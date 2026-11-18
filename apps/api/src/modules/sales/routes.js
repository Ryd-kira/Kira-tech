import { Router } from 'express';
import { z } from 'zod';
import { AppError, errors } from '../../lib/errors.js';
import { pageQuery, pageResult } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { runIdempotent } from '../../services/idempotency.js';
import {
  allocateBackorders, cancelSale, createFulfillment, createReturn, createSale, recordPayment, saleBalance, transitionFulfillment,
} from '../../services/commerce.js';
import { customerFields } from '../customers/routes.js';

const router = Router();
const uuid = z.uuid();

export const deliverySchema = z.object({
  recipientName: z.string().trim().min(2).max(120),
  recipientPhone: z.string().trim().regex(/^\+?[0-9 ]{8,20}$/, 'Numéro invalide'),
  address: z.string().trim().min(3).max(300),
  city: z.string().trim().min(2).max(80),
  district: z.string().trim().max(80).optional(),
  courierName: z.string().trim().max(120).optional(),
  courierPhone: z.string().trim().max(30).optional(),
  scheduledAt: z.coerce.date().optional(),
  observations: z.string().trim().max(1000).optional(),
}).strict();

const DETAIL = {
  customer: true, location: { select: { id: true, name: true, city: true, address: true } },
  validatedBy: { select: { name: true } }, reservation: { select: { id: true, number: true } },
  exchangeReturn: { select: { id: true, number: true, sale: { select: { number: true } } } },
  items: { include: { product: { select: { id: true, sku: true, isSerialized: true, warrantyMonths: true } }, serialNumbers: { select: { id: true, serialNumber: true, status: true } } }, orderBy: { id: 'asc' } },
  payments: { orderBy: { receivedAt: 'asc' }, include: { paymentMethod: true, recordedBy: { select: { name: true } }, refunds: { include: { paymentMethod: true } } } },
  refunds: { orderBy: { refundedAt: 'asc' }, include: { paymentMethod: true } },
  fulfillments: { orderBy: { createdAt: 'asc' }, include: { items: true, events: { orderBy: { createdAt: 'asc' }, include: { fulfillment: false } } } },
  returns: { orderBy: { receivedAt: 'asc' }, include: { items: true, exchangeSale: { select: { id: true, number: true } } } },
  statusChanges: { orderBy: { createdAt: 'asc' }, include: { adminUser: { select: { name: true } } } },
};

async function detail(id) {
  const sale = await prisma.sale.findUnique({ where: { id }, include: DETAIL });
  if (!sale) throw errors.notFound('Vente');
  const balance = await saleBalance(prisma, id);
  // Statut de remise calculé à partir des quantités, jamais du paiement.
  const qty = sale.items.reduce((a, i) => ({ total: a.total + i.quantity, handed: a.handed + i.quantityHandedOver, cancelled: a.cancelled + i.quantityCancelled }), { total: 0, handed: 0, cancelled: 0 });
  const handoverStatus = sale.status === 'CANCELLED' ? 'CANCELLED' : qty.handed === 0 ? 'NOT_HANDED' : qty.handed < qty.total ? 'PARTIAL' : 'HANDED';
  return { ...sale, balance, handoverStatus, items: sale.items.map((i) => ({ ...i, unitCostSnapshot: undefined })) };
}

router.get('/', requirePermission('sales:write'), async (req, res) => {
  const f = parse(z.object({
    ...pageQuery, q: z.string().trim().max(80).optional(),
    status: z.enum(['VALIDATED', 'CANCELLED']).optional(), channel: z.enum(['IN_STORE', 'DELIVERY']).optional(),
    locationId: uuid.optional(), customerId: uuid.optional(),
    paymentStatus: z.enum(['UNPAID', 'PARTIALLY_PAID', 'PAID']).optional(),
    from: z.coerce.date().optional(), to: z.coerce.date().optional(),
  }).strict(), req.query);
  const and = [];
  if (f.q) and.push({ OR: [{ number: { contains: f.q, mode: 'insensitive' } }, { customer: { name: { contains: f.q, mode: 'insensitive' } } }, { customer: { phone: { contains: f.q } } }] });
  for (const k of ['status', 'channel', 'locationId', 'customerId']) if (f[k]) and.push({ [k]: f[k] });
  if (f.from || f.to) and.push({ validatedAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } });
  if (f.paymentStatus) {
    const ids = await prisma.$queryRaw`SELECT "saleId" FROM sale_balance WHERE "paymentStatus" = ${f.paymentStatus}`;
    and.push({ id: { in: ids.map((r) => r.saleId) } });
  }
  const where = { AND: and };
  const [total, items] = await Promise.all([
    prisma.sale.count({ where }),
    prisma.sale.findMany({
      where, orderBy: [{ validatedAt: 'desc' }, { id: 'desc' }], skip: (f.page - 1) * f.limit, take: f.limit,
      include: { customer: { select: { name: true, phone: true } }, location: { select: { name: true } }, items: { select: { quantity: true, quantityHandedOver: true, productName: true } } },
    }),
  ]);
  const balances = items.length ? await prisma.$queryRaw`SELECT "saleId", "amountDue", "paymentStatus", collected FROM sale_balance WHERE "saleId" = ANY(${items.map((s) => s.id)}::uuid[])` : [];
  res.json(pageResult(items.map((s) => ({ ...s, balance: balances.find((b) => b.saleId === s.id) })), total, f.page, f.limit));
});

router.get('/:id', requirePermission('sales:write'), async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params);
  res.json(await detail(id));
});

/**
 * Caisse : une seule requête peut valider la vente, encaisser et remettre le produit,
 * mais chaque événement est enregistré séparément (validation, paiement, remise).
 */
router.post('/', requirePermission('sales:write'), async (req, res) => {
  const d = parse(z.object({
    channel: z.enum(['IN_STORE', 'DELIVERY']), locationId: uuid,
    customerId: uuid.optional(), newCustomer: z.object(customerFields).strict().optional(),
    items: z.array(z.object({ productId: uuid, quantity: z.number().int().positive().max(1000), discountAmount: z.number().int().min(0).default(0) }).strict()).min(1).max(100),
    deliveryFee: z.number().int().min(0).max(10_000_000).optional(), notes: z.string().trim().max(1000).optional(),
    exchangeReturnId: uuid.optional(),
    payment: z.object({ amount: z.number().int().positive(), methodCode: z.string().max(40), externalReference: z.string().trim().max(100).optional() }).strict().optional(),
    handover: z.discriminatedUnion('mode', [
      z.object({ mode: z.literal('now'), receivedByName: z.string().trim().min(2).max(120), serials: z.record(z.string(), z.array(uuid)).optional() }).strict(),
      z.object({ mode: z.literal('later') }).strict(),
      z.object({ mode: z.literal('delivery'), delivery: deliverySchema }).strict(),
    ]).default({ mode: 'later' }),
  }).strict().refine((x) => new Set(x.items.map((i) => i.productId)).size === x.items.length, { message: 'Un produit apparaît deux fois', path: ['items'] })
    .refine((x) => (x.handover.mode === 'delivery') === (x.channel === 'DELIVERY'), { message: 'Une vente avec livraison doit avoir une livraison', path: ['handover'] }), req.body);

  const result = await runIdempotent(req, 'POST /sales', async (tx) => {
    const sale = await createSale(tx, req.admin, d, req.ip);
    if (d.payment) await recordPayment(tx, req.admin, { saleId: sale.id, ...d.payment }, req.ip);
    if (d.handover.mode !== 'later') {
      const items = await tx.saleItem.findMany({ where: { saleId: sale.id } });
      if (items.some((i) => i.quantityBackordered > 0) && d.handover.mode === 'now') {
        throw new AppError(409, 'STOCK_INSUFFICIENT', 'Une partie est en attente d’approvisionnement : choisissez une remise différée.');
      }
      const f = await createFulfillment(tx, req.admin, sale.id, { mode: d.handover.mode === 'now' ? 'PICKUP' : 'DELIVERY', delivery: d.handover.delivery }, req.ip);
      if (d.handover.mode === 'now') {
        const serials = Object.fromEntries(items.map((i) => [i.id, d.handover.serials?.[i.productId] ?? []]));
        await transitionFulfillment(tx, req.admin, f.id, 'complete', { receivedByName: d.handover.receivedByName, serials }, req.ip);
      }
    }
    return { status: 201, body: { id: sale.id, number: sale.number } };
  });
  res.status(result.status).json(result.body);
});

router.post('/:id/cancel', requirePermission('sales:write'), async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params);
  const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(500) }).strict(), req.body);
  const result = await runIdempotent(req, `POST /sales/${id}/cancel`, async (tx) => {
    await cancelSale(tx, req.admin, id, reason, req.ip);
    return { status: 200, body: { id, status: 'CANCELLED' } };
  });
  res.status(result.status).json(result.body);
});

router.post('/:id/allocate-backorders', requirePermission('sales:write'), async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params);
  const result = await runIdempotent(req, `POST /sales/${id}/allocate-backorders`, async (tx) => ({ status: 200, body: { allocated: await allocateBackorders(tx, req.admin, id) } }));
  res.status(result.status).json(result.body);
});

router.post('/:id/payments', requirePermission('payments:write'), async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params);
  const d = parse(z.object({ amount: z.number().int().positive(), methodCode: z.string().max(40), externalReference: z.string().trim().max(100).optional(), receivedAt: z.coerce.date().optional() }).strict(), req.body);
  const result = await runIdempotent(req, `POST /sales/${id}/payments`, async (tx) => {
    const p = await recordPayment(tx, req.admin, { saleId: id, ...d }, req.ip);
    return { status: 201, body: { id: p.id, reference: p.reference } };
  });
  res.status(result.status).json(result.body);
});

router.post('/:id/fulfillments', requirePermission('fulfillments:write'), async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params);
  const d = parse(z.object({
    mode: z.enum(['PICKUP', 'DELIVERY']),
    items: z.array(z.object({ saleItemId: uuid, quantity: z.number().int().positive() }).strict()).min(1).optional(),
    delivery: deliverySchema.optional(),
  }).strict().refine((x) => x.mode === 'PICKUP' || x.delivery, { message: 'Coordonnées de livraison requises', path: ['delivery'] }), req.body);
  const result = await runIdempotent(req, `POST /sales/${id}/fulfillments`, async (tx) => {
    const f = await createFulfillment(tx, req.admin, id, d, req.ip);
    return { status: 201, body: { id: f.id, number: f.number } };
  });
  res.status(result.status).json(result.body);
});

router.post('/:id/returns', requirePermission('returns:write'), async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params);
  const d = parse(z.object({
    reason: z.enum(['CUSTOMER_RETURN', 'DEFECTIVE', 'EXCHANGE']), locationId: uuid, notes: z.string().trim().max(1000).optional(),
    items: z.array(z.object({
      saleItemId: uuid, quantity: z.number().int().positive(),
      condition: z.enum(['RESTOCKED', 'QUARANTINE', 'DAMAGED', 'NOT_REINTEGRABLE']), serialIds: z.array(uuid).optional(),
    }).strict()).min(1),
  }).strict(), req.body);
  const result = await runIdempotent(req, `POST /sales/${id}/returns`, async (tx) => {
    const r = await createReturn(tx, req.admin, id, d, req.ip);
    return { status: 201, body: { id: r.id, number: r.number } };
  });
  res.status(result.status).json(result.body);
});

export default router;
