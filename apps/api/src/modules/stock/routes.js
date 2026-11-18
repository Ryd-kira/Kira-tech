import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError, errors } from '../../lib/errors.js';
import { pageQuery, pageResult } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { writeAudit } from '../../services/audit.js';
import { runIdempotent } from '../../services/idempotency.js';
import { applyStockChanges, lockSerials, perSerial } from '../../services/stockLedger.js';

const router = Router();
const uuid = z.uuid();

router.get('/locations', requirePermission('stock:read'), async (req, res) => {
  res.json({ items: await prisma.stockLocation.findMany({ where: { isActive: true }, orderBy: [{ type: 'asc' }, { name: 'asc' }] }) });
});

// Vue « Stocks » : une ligne par produit, une colonne par emplacement.
router.get('/levels', requirePermission('stock:read'), async (req, res) => {
  const f = parse(z.object({
    ...pageQuery,
    q: z.string().trim().max(80).optional(),
    categoryId: uuid.optional(),
    status: z.enum(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']).optional(),
  }).strict(), req.query);
  const and = [{ status: { not: 'ARCHIVED' } }];
  if (f.q) and.push({ OR: ['name', 'brand', 'sku'].map((k) => ({ [k]: { contains: f.q, mode: 'insensitive' } })) });
  if (f.categoryId) and.push({ categoryId: f.categoryId });
  if (f.status) {
    const ids = await prisma.$queryRaw`SELECT "productId" FROM product_stock_status WHERE "stockStatus" = ${f.status}`;
    and.push({ id: { in: ids.map((r) => r.productId) } });
  }
  const where = { AND: and };
  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (f.page - 1) * f.limit, take: f.limit,
      select: { id: true, name: true, sku: true, price: true, isSerialized: true, lowStockThreshold: true, isManuallyUnavailable: true, category: { select: { name: true } } },
    }),
  ]);
  const ids = products.map((p) => p.id);
  const levels = ids.length ? await prisma.$queryRaw`
    SELECT "productId", "locationId", physical, reserved, allocated, available, quarantine, damaged
    FROM stock_availability WHERE "productId" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})` : [];
  const statuses = ids.length ? await prisma.$queryRaw`
    SELECT "productId", "stockQuantity", "stockStatus" FROM product_stock_status
    WHERE "productId" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})` : [];
  const items = products.map((p) => ({
    ...p,
    levels: levels.filter((l) => l.productId === p.id).map(({ productId, ...l }) => l),
    sellable: statuses.find((s) => s.productId === p.id)?.stockQuantity ?? 0,
    stockStatus: statuses.find((s) => s.productId === p.id)?.stockStatus ?? 'OUT_OF_STOCK',
  }));
  res.json(pageResult(items, total, f.page, f.limit));
});

// Grand livre : lecture seule, filtrable.
router.get('/movements', requirePermission('stock:read'), async (req, res) => {
  const f = parse(z.object({
    ...pageQuery,
    productId: uuid.optional(), locationId: uuid.optional(), operationId: uuid.optional(),
    type: z.string().max(40).optional(),
    from: z.coerce.date().optional(), to: z.coerce.date().optional(),
  }).strict(), req.query);
  const where = {
    ...(f.productId ? { productId: f.productId } : {}),
    ...(f.locationId ? { locationId: f.locationId } : {}),
    ...(f.operationId ? { operationId: f.operationId } : {}),
    ...(f.type ? { type: f.type } : {}),
    ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.findMany({
      where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (f.page - 1) * f.limit, take: f.limit,
      include: {
        product: { select: { name: true, sku: true } }, location: { select: { name: true } },
        adminUser: { select: { name: true } }, serialNumber: { select: { serialNumber: true } },
        transfer: { select: { number: true } }, receipt: { select: { number: true } },
      },
    }),
  ]);
  res.json(pageResult(items, total, f.page, f.limit));
});

const ADJUST_TYPES = { IN: 'ADJUSTMENT_IN', OUT: 'ADJUSTMENT_OUT', LOSS: 'LOSS', DAMAGE: 'DAMAGE' };

// Ajustement motivé : la seule façon de corriger un stock, toujours par un mouvement compensatoire.
router.post('/adjustments', requirePermission('stock:adjust'), async (req, res) => {
  const d = parse(z.object({
    productId: uuid, locationId: uuid,
    kind: z.enum(['IN', 'OUT', 'LOSS', 'DAMAGE']),
    quantity: z.number().int().positive().max(100000),
    reason: z.string().trim().min(3).max(500),
    documentRef: z.string().trim().max(100).optional(),
    serialNumbers: z.array(z.string().trim().min(2).max(80)).max(500).optional(), // entrée d'appareils suivis
    serialIds: z.array(uuid).max(500).optional(), // sortie d'appareils suivis
  }).strict(), req.body);

  const result = await runIdempotent(req, 'POST /stock/adjustments', async (tx) => {
    const [product, location] = await Promise.all([
      tx.product.findUnique({ where: { id: d.productId } }),
      tx.stockLocation.findUnique({ where: { id: d.locationId } }),
    ]);
    if (!product) throw errors.notFound('Produit');
    if (!location || location.type === 'TRANSIT') throw new AppError(400, 'INVALID_LOCATION', 'Emplacement invalide pour un ajustement.');
    const ctx = { type: ADJUST_TYPES[d.kind], adminUserId: req.admin.id, reason: d.reason, documentRef: d.documentRef };
    let changes;

    if (product.isSerialized) {
      if (d.kind === 'IN') {
        if (d.serialNumbers?.length !== d.quantity) throw new AppError(400, 'SERIALS_REQUIRED', 'Saisissez un numéro de série par appareil.');
        const serials = [];
        for (const sn of d.serialNumbers) {
          serials.push(await tx.productSerialNumber.create({ data: { productId: product.id, serialNumber: sn, locationId: location.id, receivedAt: new Date() } }));
        }
        changes = perSerial({ productId: product.id, locationId: location.id, bucket: 'ON_HAND', delta: 1 }, serials);
      } else {
        if (d.serialIds?.length !== d.quantity) throw new AppError(400, 'SERIALS_REQUIRED', 'Sélectionnez les appareils concernés.');
        const serials = await lockSerials(tx, { productId: product.id, locationId: location.id, serialIds: d.serialIds });
        const status = d.kind === 'DAMAGE' ? 'DAMAGED' : 'LOST';
        await tx.productSerialNumber.updateMany({ where: { id: { in: d.serialIds } }, data: { status, ...(d.kind === 'DAMAGE' ? {} : { locationId: null }) } });
        changes = perSerial({ productId: product.id, locationId: location.id, bucket: 'ON_HAND', delta: -1 }, serials);
        if (d.kind === 'DAMAGE') changes.push(...perSerial({ productId: product.id, locationId: location.id, bucket: 'DAMAGED', delta: 1 }, serials));
      }
    } else {
      if (d.serialNumbers || d.serialIds) throw new AppError(400, 'VALIDATION_ERROR', "Ce produit n'est pas suivi par numéro de série.");
      const q = d.quantity;
      changes = d.kind === 'IN'
        ? [{ productId: product.id, locationId: location.id, bucket: 'ON_HAND', delta: q }]
        : [{ productId: product.id, locationId: location.id, bucket: 'ON_HAND', delta: -q }];
      if (d.kind === 'DAMAGE') changes.push({ productId: product.id, locationId: location.id, bucket: 'DAMAGED', delta: q });
    }

    const { operationId, movements } = await applyStockChanges(tx, ctx, changes);
    await writeAudit(tx, {
      adminUserId: req.admin.id, action: `stock.adjust.${d.kind.toLowerCase()}`, entityType: 'Product', entityId: product.id,
      newValues: { locationId: location.id, quantity: d.quantity, operationId }, reason: d.reason, ip: req.ip,
    });
    return { status: 201, body: { operationId, movements: movements.length } };
  });
  res.status(result.status).json(result.body);
});

// Fin de contrôle d'un retour en quarantaine : vers le stock vendable ou vers « endommagé ».
router.post('/quarantine/release', requirePermission('stock:adjust'), async (req, res) => {
  const d = parse(z.object({
    productId: uuid, locationId: uuid, quantity: z.number().int().positive().max(100000),
    to: z.enum(['ON_HAND', 'DAMAGED']), reason: z.string().trim().min(3).max(500),
    serialIds: z.array(uuid).max(500).optional(),
  }).strict(), req.body);
  const result = await runIdempotent(req, 'POST /stock/quarantine/release', async (tx) => {
    const product = await tx.product.findUnique({ where: { id: d.productId } });
    if (!product) throw errors.notFound('Produit');
    let changes = [
      { productId: d.productId, locationId: d.locationId, bucket: 'QUARANTINE', delta: -d.quantity },
      { productId: d.productId, locationId: d.locationId, bucket: d.to, delta: d.quantity },
    ];
    if (product.isSerialized) {
      if (d.serialIds?.length !== d.quantity) throw new AppError(400, 'SERIALS_REQUIRED', 'Sélectionnez les appareils concernés.');
      const serials = await lockSerials(tx, { productId: d.productId, locationId: d.locationId, serialIds: d.serialIds, statuses: ['QUARANTINE'] });
      await tx.productSerialNumber.updateMany({ where: { id: { in: d.serialIds } }, data: { status: d.to === 'ON_HAND' ? 'IN_STOCK' : 'DAMAGED' } });
      changes = [
        ...perSerial({ productId: d.productId, locationId: d.locationId, bucket: 'QUARANTINE', delta: -1 }, serials),
        ...perSerial({ productId: d.productId, locationId: d.locationId, bucket: d.to, delta: 1 }, serials),
      ];
    }
    const { operationId } = await applyStockChanges(tx, { type: 'QUARANTINE_RELEASE', adminUserId: req.admin.id, reason: d.reason }, changes);
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'stock.quarantine.release', entityType: 'Product', entityId: d.productId, newValues: { to: d.to, quantity: d.quantity, operationId }, reason: d.reason, ip: req.ip });
    return { status: 201, body: { operationId } };
  });
  res.status(result.status).json(result.body);
});

// Numéros de série : recherche et historique d'un appareil.
router.get('/serials', requirePermission('stock:read'), async (req, res) => {
  const f = parse(z.object({
    q: z.string().trim().max(80).optional(), productId: uuid.optional(), locationId: uuid.optional(),
    status: z.enum(['IN_STOCK', 'RESERVED', 'ALLOCATED', 'IN_TRANSIT', 'DELIVERED', 'QUARANTINE', 'DAMAGED', 'LOST']).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  }).strict(), req.query);
  const items = await prisma.productSerialNumber.findMany({
    where: {
      ...(f.q ? { serialNumber: { contains: f.q, mode: 'insensitive' } } : {}),
      ...(f.productId ? { productId: f.productId } : {}),
      ...(f.locationId ? { locationId: f.locationId } : {}),
      ...(f.status ? { status: f.status } : {}),
    },
    orderBy: { createdAt: 'desc' }, take: f.limit,
    include: { product: { select: { name: true, sku: true } }, location: { select: { name: true } } },
  });
  res.json({ items });
});

router.get('/serials/:id', requirePermission('stock:read'), async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params);
  const serial = await prisma.productSerialNumber.findUnique({
    where: { id },
    include: {
      product: { select: { name: true, sku: true } }, location: { select: { name: true } }, supplier: { select: { name: true } },
      customer: { select: { name: true, phone: true } },
      movements: { orderBy: { createdAt: 'asc' }, include: { location: { select: { name: true } }, adminUser: { select: { name: true } } } },
    },
  });
  if (!serial) throw errors.notFound('Numéro de série');
  res.json(serial);
});

export default router;
