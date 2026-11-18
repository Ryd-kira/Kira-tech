import { Router } from 'express';
import { z } from 'zod';
import { pageQuery, pageResult } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { runIdempotent } from '../../services/idempotency.js';
import { recordRefund, voidPayment } from '../../services/commerce.js';

const router = Router();
const uuid = z.uuid();

router.get('/methods', requirePermission('payments:write'), async (req, res) => {
  res.json({ items: await prisma.paymentMethod.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }) });
});

router.get('/', requirePermission('payments:write'), async (req, res) => {
  const f = parse(z.object({ ...pageQuery, methodCode: z.string().max(40).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), status: z.enum(['RECORDED', 'VOIDED']).optional() }).strict(), req.query);
  const where = {
    ...(f.status ? { status: f.status } : {}),
    ...(f.methodCode ? { paymentMethod: { code: f.methodCode } } : {}),
    ...(f.from || f.to ? { receivedAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
  };
  const [total, items, sums] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where, orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }], skip: (f.page - 1) * f.limit, take: f.limit,
      include: {
        paymentMethod: true, recordedBy: { select: { name: true } },
        sale: { select: { id: true, number: true, customer: { select: { name: true } } } },
        reservation: { select: { id: true, number: true } }, refunds: { where: { status: 'RECORDED' }, select: { amount: true } },
      },
    }),
    prisma.payment.aggregate({ where: { ...where, status: 'RECORDED' }, _sum: { amount: true } }),
  ]);
  res.json({ ...pageResult(items, total, f.page, f.limit), totalCollected: sums._sum.amount ?? 0 });
});

// Annulation d'une saisie erronée : la ligne reste, avec son motif (SUPER_ADMIN).
router.post('/:id/void', requirePermission('payments:void'), async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params);
  const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(500) }).strict(), req.body);
  const result = await runIdempotent(req, `POST /payments/${id}/void`, async (tx) => {
    await voidPayment(tx, req.admin, id, reason, req.ip);
    return { status: 200, body: { id, status: 'VOIDED' } };
  });
  res.status(result.status).json(result.body);
});

router.post('/:id/refunds', requirePermission('refunds:write'), async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params);
  const d = parse(z.object({ amount: z.number().int().positive(), methodCode: z.string().max(40), reason: z.string().trim().min(3).max(500), returnId: uuid.optional() }).strict(), req.body);
  const result = await runIdempotent(req, `POST /payments/${id}/refunds`, async (tx) => {
    const r = await recordRefund(tx, req.admin, id, d, req.ip);
    return { status: 201, body: { id: r.id, reference: r.reference } };
  });
  res.status(result.status).json(result.body);
});

export default router;
