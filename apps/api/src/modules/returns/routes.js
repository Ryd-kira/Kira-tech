import { Router } from 'express';
import { z } from 'zod';
import { pageQuery, pageResult } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePermission } from '../../middleware/auth.js';

const router = Router();
router.get('/', requirePermission('returns:write'), async (req, res) => {
  const f = parse(z.object({ ...pageQuery }).strict(), req.query);
  const [total, items] = await Promise.all([
    prisma.return.count(),
    prisma.return.findMany({
      orderBy: { receivedAt: 'desc' }, skip: (f.page - 1) * f.limit, take: f.limit,
      include: {
        sale: { select: { id: true, number: true, customer: { select: { name: true } } } }, location: { select: { name: true } },
        receivedBy: { select: { name: true } }, items: { include: { saleItem: { select: { productName: true } } } },
        refunds: { select: { amount: true, reference: true } }, exchangeSale: { select: { id: true, number: true } },
      },
    }),
  ]);
  res.json(pageResult(items, total, f.page, f.limit));
});
export default router;
