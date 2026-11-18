import { Router } from 'express';
import { z } from 'zod';
import { errors } from '../../lib/errors.js';
import { pageQuery, pageResult } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { runIdempotent } from '../../services/idempotency.js';
import { transitionFulfillment } from '../../services/commerce.js';

const router = Router();
router.use(requirePermission('fulfillments:write'));
const uuid = z.uuid();
const INCLUDE = {
  sale: { select: { id: true, number: true, customer: { select: { name: true, phone: true } } } },
  items: { include: { saleItem: { select: { productName: true, productId: true, product: { select: { isSerialized: true } } } } } },
  events: { orderBy: { createdAt: 'asc' } },
};

router.get('/', async (req, res) => {
  const f = parse(z.object({
    ...pageQuery, mode: z.enum(['PICKUP', 'DELIVERY']).optional(),
    status: z.enum(['PREPARING', 'READY', 'IN_TRANSIT', 'COMPLETED', 'FAILED', 'RETURNED_TO_STORE', 'CANCELLED']).optional(),
    open: z.enum(['1']).optional(),
  }).strict(), req.query);
  const where = {
    ...(f.mode ? { mode: f.mode } : {}),
    ...(f.status ? { status: f.status } : f.open ? { status: { in: ['PREPARING', 'READY', 'IN_TRANSIT', 'FAILED'] } } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.saleFulfillment.count({ where }),
    prisma.saleFulfillment.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (f.page - 1) * f.limit, take: f.limit, include: INCLUDE }),
  ]);
  res.json(pageResult(items, total, f.page, f.limit));
});

router.get('/:id', async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params);
  const f = await prisma.saleFulfillment.findUnique({ where: { id }, include: INCLUDE });
  if (!f) throw errors.notFound('Remise');
  res.json(f);
});

const ACTIONS = { ready: 'ready', dispatch: 'dispatch', complete: 'complete', fail: 'fail', retry: 'retry', 'return-to-store': 'returnToStore', cancel: 'cancel' };
for (const [path, action] of Object.entries(ACTIONS)) {
  router.post(`/:id/${path}`, async (req, res) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const d = parse(z.object({
      note: ['fail', 'cancel'].includes(action) ? z.string().trim().min(3).max(1000) : z.string().trim().max(1000).optional(),
      receivedByName: z.string().trim().min(2).max(120).optional(),
      proofNote: z.string().trim().max(1000).optional(),
      courierName: z.string().trim().max(120).optional(), courierPhone: z.string().trim().max(30).optional(),
      serials: z.record(z.string(), z.array(uuid)).optional(),
    }).strict(), req.body ?? {});
    const result = await runIdempotent(req, `POST /fulfillments/${id}/${path}`, async (tx) => ({ status: 200, body: await transitionFulfillment(tx, req.admin, id, action, d, req.ip) }));
    res.status(result.status).json(result.body);
  });
}

export default router;
