import { Router } from 'express';
import { z } from 'zod';
import { errors } from '../../lib/errors.js';
import { pageQuery, pageResult } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { runIdempotent } from '../../services/idempotency.js';
import { createReservation, createSale, expireReservations, recordPayment, transitionReservation } from '../../services/commerce.js';
import { customerFields } from '../customers/routes.js';

const router = Router();
router.use(requirePermission('reservations:write'));
const uuid = z.uuid();
const INCLUDE = {
  customer: true, location: { select: { id: true, name: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true, price: true } } } },
  payments: { include: { paymentMethod: true }, orderBy: { receivedAt: 'asc' } },
  sale: { select: { id: true, number: true } },
  statusChanges: { orderBy: { createdAt: 'asc' }, include: { adminUser: { select: { name: true } } } },
};

router.get('/', async (req, res) => {
  const f = parse(z.object({ ...pageQuery, status: z.enum(['PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED', 'CONVERTED']).optional(), active: z.enum(['1']).optional() }).strict(), req.query);
  await prisma.$transaction((tx) => expireReservations(tx));
  const where = f.status ? { status: f.status } : f.active ? { status: { in: ['PENDING', 'CONFIRMED'] } } : {};
  const [total, items] = await Promise.all([
    prisma.stockReservation.count({ where }),
    prisma.stockReservation.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (f.page - 1) * f.limit, take: f.limit, include: { ...INCLUDE, statusChanges: false } }),
  ]);
  res.json(pageResult(items, total, f.page, f.limit));
});

router.get('/:id', async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params);
  const r = await prisma.stockReservation.findUnique({ where: { id }, include: INCLUDE });
  if (!r) throw errors.notFound('Réservation');
  res.json(r);
});

router.post('/', async (req, res) => {
  const d = parse(z.object({
    locationId: uuid, customerId: uuid.optional(), newCustomer: z.object(customerFields).strict().optional(),
    expiresAt: z.coerce.date().optional(), notes: z.string().trim().max(1000).optional(),
    items: z.array(z.object({ productId: uuid, quantity: z.number().int().positive().max(1000), quotedPrice: z.number().int().min(0).optional() }).strict()).min(1).max(50),
    deposit: z.object({ amount: z.number().int().positive(), methodCode: z.string().max(40), externalReference: z.string().trim().max(100).optional() }).strict().optional(),
  }).strict(), req.body);
  const result = await runIdempotent(req, 'POST /reservations', async (tx) => {
    const r = await createReservation(tx, req.admin, d, req.ip);
    if (d.deposit) await recordPayment(tx, req.admin, { reservationId: r.id, ...d.deposit }, req.ip);
    return { status: 201, body: { id: r.id, number: r.number, expiresAt: r.expiresAt } };
  });
  res.status(result.status).json(result.body);
});

for (const action of ['confirm', 'extend', 'cancel']) {
  router.post(`/:id/${action}`, async (req, res) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const d = parse(z.object({
      reason: action === 'cancel' ? z.string().trim().min(3).max(500) : z.string().trim().max(500).optional(),
      ...(action === 'extend' ? { expiresAt: z.coerce.date() } : {}),
    }).strict(), req.body ?? {});
    const result = await runIdempotent(req, `POST /reservations/${id}/${action}`, async (tx) => {
      await transitionReservation(tx, req.admin, id, action, d, req.ip);
      return { status: 200, body: { id } };
    });
    res.status(result.status).json(result.body);
  });
}

router.post('/:id/payments', requirePermission('payments:write'), async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params);
  const d = parse(z.object({ amount: z.number().int().positive(), methodCode: z.string().max(40), externalReference: z.string().trim().max(100).optional() }).strict(), req.body);
  const result = await runIdempotent(req, `POST /reservations/${id}/payments`, async (tx) => {
    const p = await recordPayment(tx, req.admin, { reservationId: id, ...d }, req.ip);
    return { status: 201, body: { id: p.id, reference: p.reference } };
  });
  res.status(result.status).json(result.body);
});

// Conversion en vente validée : la quantité réservée devient affectée (pas de double comptage).
router.post('/:id/convert', requirePermission('sales:write'), async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params);
  const d = parse(z.object({
    channel: z.enum(['IN_STORE', 'DELIVERY']).default('IN_STORE'), deliveryFee: z.number().int().min(0).optional(),
    notes: z.string().trim().max(1000).optional(),
    discounts: z.array(z.object({ productId: uuid, discountAmount: z.number().int().min(0) }).strict()).optional(),
  }).strict(), req.body ?? {});
  const result = await runIdempotent(req, `POST /reservations/${id}/convert`, async (tx) => {
    const sale = await createSale(tx, req.admin, { ...d, reservationId: id, items: d.discounts ?? [] }, req.ip);
    return { status: 201, body: { saleId: sale.id, number: sale.number } };
  });
  res.status(result.status).json(result.body);
});

export default router;
