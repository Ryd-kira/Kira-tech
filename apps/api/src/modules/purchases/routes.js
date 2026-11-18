import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { can } from '../../auth/permissions.js';
import { AppError, errors } from '../../lib/errors.js';
import { pageQuery, pageResult } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { writeAudit } from '../../services/audit.js';
import { runIdempotent } from '../../services/idempotency.js';
import { nextNumber } from '../../services/numbering.js';
import { applyStockChanges, perSerial, recordStatus } from '../../services/stockLedger.js';

/**
 * Achats : la création d'un achat ne touche pas au stock. Seule la RÉCEPTION effective
 * fait entrer la marchandise (addendum 2 §4), éventuellement en plusieurs fois.
 */
const router = Router();
const uuid = z.uuid();
const round2 = (n) => Math.round(n * 100) / 100;

const INCLUDE = {
  supplier: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true, isSerialized: true } } }, orderBy: { id: 'asc' } },
  receipts: {
    orderBy: { receivedAt: 'asc' },
    include: { location: { select: { name: true } }, receivedBy: { select: { name: true } }, items: { include: { serialNumbers: { select: { serialNumber: true } } } } },
  },
  statusChanges: { orderBy: { createdAt: 'asc' }, include: { adminUser: { select: { name: true } } } },
};

// Les coûts d'achat ne sont visibles que pour les rôles qui ont accès aux coûts.
function view(p, admin) {
  const out = { ...p, items: p.items.map((i) => ({ ...i, landedUnitCost: Number(i.landedUnitCost) })) };
  if (can(admin.role, 'dashboard:costs')) return out;
  delete out.itemsTotal; delete out.additionalCosts; delete out.totalAmount;
  out.items = out.items.map(({ unitCost, landedUnitCost, ...i }) => i);
  return out;
}

router.get('/', requirePermission('purchases:receive'), async (req, res) => {
  const f = parse(z.object({ ...pageQuery, status: z.enum(['ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']).optional(), supplierId: uuid.optional() }).strict(), req.query);
  const where = { ...(f.status ? { status: f.status } : {}), ...(f.supplierId ? { supplierId: f.supplierId } : {}) };
  const [total, items] = await Promise.all([
    prisma.purchase.count({ where }),
    prisma.purchase.findMany({ where, orderBy: [{ purchaseDate: 'desc' }, { id: 'desc' }], skip: (f.page - 1) * f.limit, take: f.limit, include: { ...INCLUDE, receipts: false, statusChanges: false } }),
  ]);
  res.json(pageResult(items.map((p) => view({ ...p, receipts: undefined }, req.admin)), total, f.page, f.limit));
});

router.get('/:id', requirePermission('purchases:receive'), async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params);
  const p = await prisma.purchase.findUnique({ where: { id }, include: INCLUDE });
  if (!p) throw errors.notFound('Achat');
  res.json(view(p, req.admin));
});

router.post('/', requirePermission('purchases:write'), async (req, res) => {
  const d = parse(z.object({
    supplierId: uuid, locationId: uuid,
    supplierReference: z.string().trim().max(100).optional(),
    purchaseDate: z.coerce.date(),
    additionalCosts: z.number().int().min(0).max(1_000_000_000).default(0),
    notes: z.string().trim().max(2000).optional(),
    items: z.array(z.object({ productId: uuid, quantityOrdered: z.number().int().positive().max(100000), unitCost: z.number().int().min(0).max(100_000_000) }).strict()).min(1).max(200),
  }).strict().refine((x) => new Set(x.items.map((i) => i.productId)).size === x.items.length, { message: 'Un produit apparaît deux fois', path: ['items'] }), req.body);

  const result = await runIdempotent(req, 'POST /purchases', async (tx) => {
    const [supplier, location, products] = await Promise.all([
      tx.supplier.findUnique({ where: { id: d.supplierId } }),
      tx.stockLocation.findUnique({ where: { id: d.locationId } }),
      tx.product.findMany({ where: { id: { in: d.items.map((i) => i.productId) } }, select: { id: true } }),
    ]);
    if (!supplier) throw new AppError(400, 'VALIDATION_ERROR', 'Fournisseur inconnu.', [{ field: 'supplierId', message: 'Fournisseur inconnu' }]);
    if (!location || location.type === 'TRANSIT') throw new AppError(400, 'INVALID_LOCATION', 'Emplacement de réception invalide.');
    if (products.length !== d.items.length) throw new AppError(400, 'VALIDATION_ERROR', 'Produit inconnu dans la liste.');

    // Frais supplémentaires répartis au prorata de la valeur de chaque ligne (ou des quantités si tout est à 0).
    const itemsTotal = d.items.reduce((s, i) => s + i.quantityOrdered * i.unitCost, 0);
    const totalQty = d.items.reduce((s, i) => s + i.quantityOrdered, 0);
    const items = d.items.map((i) => {
      const share = itemsTotal > 0 ? (i.quantityOrdered * i.unitCost) / itemsTotal : i.quantityOrdered / totalQty;
      return { ...i, landedUnitCost: round2(i.unitCost + (d.additionalCosts * share) / i.quantityOrdered) };
    });
    const purchase = await tx.purchase.create({
      data: {
        number: await nextNumber(tx, 'PURCHASE'), supplierId: d.supplierId, locationId: d.locationId, supplierReference: d.supplierReference,
        purchaseDate: d.purchaseDate, additionalCosts: d.additionalCosts, itemsTotal, totalAmount: itemsTotal + d.additionalCosts,
        notes: d.notes, createdById: req.admin.id, items: { create: items },
      },
    });
    await recordStatus(tx, { adminUserId: req.admin.id, to: 'ORDERED', purchaseId: purchase.id });
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'purchase.create', entityType: 'Purchase', entityId: purchase.id, newValues: { number: purchase.number, totalAmount: purchase.totalAmount }, ip: req.ip });
    return { status: 201, body: { id: purchase.id, number: purchase.number } };
  });
  res.status(result.status).json(result.body);
});

async function lockPurchase(tx, id) {
  const [row] = await tx.$queryRaw`SELECT id FROM purchases WHERE id = ${id}::uuid FOR UPDATE`;
  if (!row) throw errors.notFound('Achat');
  return tx.purchase.findUnique({ where: { id }, include: { items: { include: { product: true } } } });
}

// Réception (éventuellement partielle) : seule opération qui fait entrer du stock.
router.post('/:id/receipts', requirePermission('purchases:receive'), async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params);
  const d = parse(z.object({
    locationId: uuid.optional(), receivedAt: z.coerce.date().optional(), notes: z.string().trim().max(2000).optional(),
    items: z.array(z.object({
      purchaseItemId: uuid, quantity: z.number().int().positive().max(100000),
      serialNumbers: z.array(z.string().trim().min(2).max(80)).max(1000).optional(),
    }).strict()).min(1).max(200),
  }).strict(), req.body);

  const result = await runIdempotent(req, `POST /purchases/${id}/receipts`, async (tx) => {
    const purchase = await lockPurchase(tx, id);
    if (!['ORDERED', 'PARTIALLY_RECEIVED'].includes(purchase.status)) throw errors.invalidTransition('Cet achat ne peut plus être réceptionné.');
    const locationId = d.locationId ?? purchase.locationId;
    const location = await tx.stockLocation.findUnique({ where: { id: locationId } });
    if (!location || location.type === 'TRANSIT') throw new AppError(400, 'INVALID_LOCATION', 'Emplacement de réception invalide.');

    const receipt = await tx.purchaseReceipt.create({
      data: { number: await nextNumber(tx, 'RECEIPT'), purchaseId: id, locationId, receivedAt: d.receivedAt ?? new Date(), receivedById: req.admin.id, notes: d.notes },
    });
    const changes = [];
    for (const line of d.items) {
      const item = purchase.items.find((i) => i.id === line.purchaseItemId);
      if (!item) throw new AppError(400, 'VALIDATION_ERROR', "Ligne d'achat inconnue.");
      const remaining = item.quantityOrdered - item.quantityReceived;
      if (line.quantity > remaining) {
        throw new AppError(400, 'OVER_RECEIPT', `${item.product.name} : ${remaining} unité(s) restent à recevoir, ${line.quantity} saisie(s).`);
      }
      const receiptItem = await tx.purchaseReceiptItem.create({ data: { receiptId: receipt.id, purchaseItemId: item.id, quantity: line.quantity } });
      await tx.purchaseItem.update({ where: { id: item.id }, data: { quantityReceived: { increment: line.quantity } } });

      // Coût moyen pondéré : produit verrouillé pour que deux réceptions simultanées ne se marchent pas dessus.
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${item.productId}::uuid FOR UPDATE`;
      const [{ qty }] = await tx.$queryRaw`SELECT COALESCE(SUM("onHand" + quarantine), 0)::int AS qty FROM stock_levels WHERE "productId" = ${item.productId}::uuid`;
      const product = await tx.product.findUnique({ where: { id: item.productId }, select: { averageCost: true } });
      const newAvg = (qty * Number(product.averageCost) + line.quantity * Number(item.landedUnitCost)) / (qty + line.quantity);
      await tx.product.update({ where: { id: item.productId }, data: { averageCost: new Prisma.Decimal(round2(newAvg)) } });

      const base = { productId: item.productId, locationId, bucket: 'ON_HAND', delta: line.quantity };
      if (item.product.isSerialized) {
        if (line.serialNumbers?.length !== line.quantity) throw new AppError(400, 'SERIALS_REQUIRED', `${item.product.name} : saisissez un numéro de série par appareil reçu.`);
        const serials = [];
        for (const sn of line.serialNumbers) {
          const exists = await tx.productSerialNumber.findUnique({ where: { productId_serialNumber: { productId: item.productId, serialNumber: sn } } });
          if (exists) throw new AppError(409, 'SERIAL_EXISTS', `Le numéro de série ${sn} est déjà enregistré pour ce produit.`);
          serials.push(await tx.productSerialNumber.create({
            data: { productId: item.productId, serialNumber: sn, locationId, supplierId: purchase.supplierId, receiptItemId: receiptItem.id, unitCost: item.landedUnitCost, receivedAt: receipt.receivedAt },
          }));
        }
        changes.push(...perSerial(base, serials));
      } else {
        if (line.serialNumbers?.length) throw new AppError(400, 'VALIDATION_ERROR', `${item.product.name} n'est pas suivi par numéro de série.`);
        changes.push(base);
      }
    }
    await applyStockChanges(tx, { type: 'PURCHASE_RECEIPT', adminUserId: req.admin.id, refs: { purchaseReceiptId: receipt.id }, documentRef: purchase.supplierReference ?? purchase.number }, changes);

    const items = await tx.purchaseItem.findMany({ where: { purchaseId: id } });
    const status = items.every((i) => i.quantityReceived === i.quantityOrdered) ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
    if (status !== purchase.status) {
      await tx.purchase.update({ where: { id }, data: { status } });
      await recordStatus(tx, { adminUserId: req.admin.id, from: purchase.status, to: status, purchaseId: id });
    }
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'purchase.receive', entityType: 'Purchase', entityId: id, newValues: { receipt: receipt.number, lines: d.items.map((l) => ({ purchaseItemId: l.purchaseItemId, quantity: l.quantity })) }, ip: req.ip });
    return { status: 201, body: { receiptId: receipt.id, number: receipt.number, purchaseStatus: status } };
  });
  res.status(result.status).json(result.body);
});

router.post('/:id/cancel', requirePermission('purchases:write'), async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params);
  const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(500) }).strict(), req.body);
  const result = await runIdempotent(req, `POST /purchases/${id}/cancel`, async (tx) => {
    const p = await lockPurchase(tx, id);
    if (p.status !== 'ORDERED') throw errors.invalidTransition('Un achat déjà (partiellement) reçu ne peut pas être annulé : clôturez le reliquat.');
    await tx.purchase.update({ where: { id }, data: { status: 'CANCELLED' } });
    await recordStatus(tx, { adminUserId: req.admin.id, from: 'ORDERED', to: 'CANCELLED', reason, purchaseId: id });
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'purchase.cancel', entityType: 'Purchase', entityId: id, reason, ip: req.ip });
    return { status: 200, body: { id, status: 'CANCELLED' } };
  });
  res.status(result.status).json(result.body);
});

// Clôture d'un achat partiellement reçu : le reste ne sera pas livré.
router.post('/:id/close', requirePermission('purchases:write'), async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params);
  const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(500) }).strict(), req.body);
  const result = await runIdempotent(req, `POST /purchases/${id}/close`, async (tx) => {
    const p = await lockPurchase(tx, id);
    if (p.status !== 'PARTIALLY_RECEIVED') throw errors.invalidTransition('Seul un achat partiellement reçu peut être clôturé.');
    await tx.purchase.update({ where: { id }, data: { status: 'RECEIVED' } });
    await recordStatus(tx, { adminUserId: req.admin.id, from: 'PARTIALLY_RECEIVED', to: 'RECEIVED', reason: `Reliquat abandonné : ${reason}`, purchaseId: id });
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'purchase.close', entityType: 'Purchase', entityId: id, reason, ip: req.ip });
    return { status: 200, body: { id, status: 'RECEIVED' } };
  });
  res.status(result.status).json(result.body);
});

export default router;
