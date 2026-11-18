import { Router } from 'express';
import { z } from 'zod';
import { AppError, errors } from '../../lib/errors.js';
import { pageQuery, pageResult } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { writeAudit } from '../../services/audit.js';
import { runIdempotent } from '../../services/idempotency.js';
import { nextNumber } from '../../services/numbering.js';
import { applyStockChanges, lockSerials, perSerial, recordStatus, transitLocation } from '../../services/stockLedger.js';

/**
 * Transfert entre emplacements, en deux temps atomiques :
 *  - expédition : source -q, « En transit » +q ;
 *  - réception  : « En transit » -q, destination +q.
 * Un emplacement n'est jamais débité sans son mouvement.
 */
const router = Router();
const uuid = z.uuid();
const INCLUDE = {
  source: { select: { id: true, name: true } }, destination: { select: { id: true, name: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true, isSerialized: true } } } },
  statusChanges: { orderBy: { createdAt: 'asc' }, include: { adminUser: { select: { name: true } } } },
};

router.get('/', requirePermission('stock:read'), async (req, res) => {
  const f = parse(z.object({ ...pageQuery, status: z.enum(['PENDING', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED']).optional() }).strict(), req.query);
  const where = f.status ? { status: f.status } : {};
  const [total, items] = await Promise.all([
    prisma.stockTransfer.count({ where }),
    prisma.stockTransfer.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (f.page - 1) * f.limit, take: f.limit, include: INCLUDE }),
  ]);
  res.json(pageResult(items, total, f.page, f.limit));
});

router.get('/:id', requirePermission('stock:read'), async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params);
  const t = await prisma.stockTransfer.findUnique({ where: { id }, include: INCLUDE });
  if (!t) throw errors.notFound('Transfert');
  const serials = await prisma.stockMovement.findMany({
    where: { transferId: id, type: 'TRANSFER_OUT', serialNumberId: { not: null } },
    select: { productId: true, serialNumber: { select: { id: true, serialNumber: true } } },
  });
  res.json({ ...t, serials: serials.map((s) => ({ productId: s.productId, ...s.serialNumber })) });
});

router.post('/', requirePermission('transfers:write'), async (req, res) => {
  const d = parse(z.object({
    sourceLocationId: uuid, destinationLocationId: uuid, reason: z.string().trim().max(500).optional(),
    items: z.array(z.object({ productId: uuid, quantity: z.number().int().positive().max(100000) }).strict()).min(1).max(100),
  }).strict().refine((x) => x.sourceLocationId !== x.destinationLocationId, { message: 'Source et destination identiques', path: ['destinationLocationId'] })
    .refine((x) => new Set(x.items.map((i) => i.productId)).size === x.items.length, { message: 'Un produit apparaît deux fois', path: ['items'] }), req.body);
  const result = await runIdempotent(req, 'POST /transfers', async (tx) => {
    const locs = await tx.stockLocation.findMany({ where: { id: { in: [d.sourceLocationId, d.destinationLocationId] }, isActive: true, type: { not: 'TRANSIT' } } });
    if (locs.length !== 2) throw new AppError(400, 'INVALID_LOCATION', 'Emplacement source ou destination invalide.');
    const transfer = await tx.stockTransfer.create({
      data: {
        number: await nextNumber(tx, 'TRANSFER'), sourceLocationId: d.sourceLocationId, destinationLocationId: d.destinationLocationId,
        reason: d.reason, createdById: req.admin.id, items: { create: d.items },
      },
    });
    await recordStatus(tx, { adminUserId: req.admin.id, to: 'PENDING', transferId: transfer.id });
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'transfer.create', entityType: 'StockTransfer', entityId: transfer.id, newValues: d, ip: req.ip });
    return { status: 201, body: { id: transfer.id, number: transfer.number } };
  });
  res.status(result.status).json(result.body);
});

async function loadForUpdate(tx, id) {
  // Verrou sur le transfert : deux expéditions simultanées du même transfert sont impossibles.
  const [row] = await tx.$queryRaw`SELECT id FROM stock_transfers WHERE id = ${id}::uuid FOR UPDATE`;
  if (!row) throw errors.notFound('Transfert');
  return tx.stockTransfer.findUnique({ where: { id }, include: { items: { include: { product: true } } } });
}

router.post('/:id/ship', requirePermission('transfers:write'), async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params);
  const d = parse(z.object({ serials: z.record(z.string(), z.array(uuid)).optional() }).strict(), req.body ?? {});
  const result = await runIdempotent(req, `POST /transfers/${id}/ship`, async (tx) => {
    const t = await loadForUpdate(tx, id);
    if (t.status !== 'PENDING') throw errors.invalidTransition('Seul un transfert en attente peut être expédié.');
    const transit = await transitLocation(tx);
    const changes = [];
    for (const item of t.items) {
      if (item.product.isSerialized) {
        const ids = d.serials?.[item.productId] ?? [];
        if (ids.length !== item.quantity) throw new AppError(400, 'SERIALS_REQUIRED', `Sélectionnez ${item.quantity} numéro(s) de série pour ${item.product.name}.`);
        const serials = await lockSerials(tx, { productId: item.productId, locationId: t.sourceLocationId, serialIds: ids });
        await tx.productSerialNumber.updateMany({ where: { id: { in: ids } }, data: { status: 'IN_TRANSIT', locationId: transit.id } });
        changes.push(...perSerial({ productId: item.productId, locationId: t.sourceLocationId, bucket: 'ON_HAND', delta: -1 }, serials));
        changes.push(...perSerial({ productId: item.productId, locationId: transit.id, bucket: 'ON_HAND', delta: 1 }, serials));
      } else {
        changes.push({ productId: item.productId, locationId: t.sourceLocationId, bucket: 'ON_HAND', delta: -item.quantity });
        changes.push({ productId: item.productId, locationId: transit.id, bucket: 'ON_HAND', delta: item.quantity });
      }
    }
    await applyStockChanges(tx, { type: 'TRANSFER_OUT', adminUserId: req.admin.id, refs: { transferId: id }, documentRef: t.number }, changes);
    await tx.stockTransfer.update({ where: { id }, data: { status: 'IN_TRANSIT', shippedAt: new Date() } });
    await recordStatus(tx, { adminUserId: req.admin.id, from: 'PENDING', to: 'IN_TRANSIT', transferId: id });
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'transfer.ship', entityType: 'StockTransfer', entityId: id, ip: req.ip });
    return { status: 200, body: { id, status: 'IN_TRANSIT' } };
  });
  res.status(result.status).json(result.body);
});

async function serialsOf(tx, transferId) {
  return tx.stockMovement.findMany({ where: { transferId, type: 'TRANSFER_OUT', bucket: 'ON_HAND', quantityDelta: { lt: 0 }, serialNumberId: { not: null } }, select: { productId: true, serialNumberId: true } });
}

// Retour de « En transit » vers un emplacement (réception à destination ou annulation vers la source).
async function landFromTransit(tx, t, targetLocationId, type, adminUserId) {
  const transit = await transitLocation(tx);
  const serialMoves = await serialsOf(tx, t.id);
  const changes = [];
  for (const item of t.items) {
    const own = serialMoves.filter((m) => m.productId === item.productId).map((m) => ({ id: m.serialNumberId }));
    if (item.product.isSerialized) {
      await tx.productSerialNumber.updateMany({ where: { id: { in: own.map((s) => s.id) } }, data: { status: 'IN_STOCK', locationId: targetLocationId } });
      changes.push(...perSerial({ productId: item.productId, locationId: transit.id, bucket: 'ON_HAND', delta: -1 }, own));
      changes.push(...perSerial({ productId: item.productId, locationId: targetLocationId, bucket: 'ON_HAND', delta: 1 }, own));
    } else {
      changes.push({ productId: item.productId, locationId: transit.id, bucket: 'ON_HAND', delta: -item.quantity });
      changes.push({ productId: item.productId, locationId: targetLocationId, bucket: 'ON_HAND', delta: item.quantity });
    }
  }
  await applyStockChanges(tx, { type, adminUserId, refs: { transferId: t.id }, documentRef: t.number }, changes);
}

router.post('/:id/receive', requirePermission('transfers:write'), async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params);
  const result = await runIdempotent(req, `POST /transfers/${id}/receive`, async (tx) => {
    const t = await loadForUpdate(tx, id);
    if (t.status !== 'IN_TRANSIT') throw errors.invalidTransition('Seul un transfert expédié peut être réceptionné.');
    await landFromTransit(tx, t, t.destinationLocationId, 'TRANSFER_IN', req.admin.id);
    await tx.stockTransfer.update({ where: { id }, data: { status: 'RECEIVED', receivedAt: new Date() } });
    await recordStatus(tx, { adminUserId: req.admin.id, from: 'IN_TRANSIT', to: 'RECEIVED', transferId: id });
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'transfer.receive', entityType: 'StockTransfer', entityId: id, ip: req.ip });
    return { status: 200, body: { id, status: 'RECEIVED' } };
  });
  res.status(result.status).json(result.body);
});

router.post('/:id/cancel', requirePermission('transfers:write'), async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params);
  const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(500) }).strict(), req.body);
  const result = await runIdempotent(req, `POST /transfers/${id}/cancel`, async (tx) => {
    const t = await loadForUpdate(tx, id);
    if (!['PENDING', 'IN_TRANSIT'].includes(t.status)) throw errors.invalidTransition('Ce transfert ne peut plus être annulé.');
    if (t.status === 'IN_TRANSIT') await landFromTransit(tx, t, t.sourceLocationId, 'TRANSFER_IN', req.admin.id);
    await tx.stockTransfer.update({ where: { id }, data: { status: 'CANCELLED' } });
    await recordStatus(tx, { adminUserId: req.admin.id, from: t.status, to: 'CANCELLED', reason, transferId: id });
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'transfer.cancel', entityType: 'StockTransfer', entityId: id, reason, ip: req.ip });
    return { status: 200, body: { id, status: 'CANCELLED' } };
  });
  res.status(result.status).json(result.body);
});

export default router;
