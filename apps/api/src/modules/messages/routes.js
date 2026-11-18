import { Router } from 'express';
import { z } from 'zod';
import { errors } from '../../lib/errors.js';
import { pageQuery, pageResult } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { writeAudit } from '../../services/audit.js';

const router = Router();
router.use(requirePermission('messages:manage'));

router.get('/', async (req, res) => {
  const f = parse(z.object({ ...pageQuery, status: z.enum(['NEW', 'IN_PROGRESS', 'HANDLED', 'ARCHIVED']).optional() }).strict(), req.query);
  const where = f.status ? { status: f.status } : { status: { not: 'ARCHIVED' } };
  const [total, items, unread] = await Promise.all([
    prisma.contactMessage.count({ where }),
    prisma.contactMessage.findMany({
      where, orderBy: { createdAt: 'desc' }, skip: (f.page - 1) * f.limit, take: f.limit,
      include: { product: { select: { name: true, slug: true } } },
    }),
    prisma.contactMessage.count({ where: { status: 'NEW' } }),
  ]);
  res.json({ ...pageResult(items, total, f.page, f.limit), unread });
});

router.patch('/:id', async (req, res) => {
  const { id } = parse(z.object({ id: z.uuid() }), req.params);
  const { status } = parse(z.object({ status: z.enum(['NEW', 'IN_PROGRESS', 'HANDLED', 'ARCHIVED']) }).strict(), req.body);
  const msg = await prisma.$transaction(async (tx) => {
    const before = await tx.contactMessage.findUnique({ where: { id } });
    if (!before) throw errors.notFound('Message');
    const handled = status === 'HANDLED' ? { handledById: req.admin.id, handledAt: new Date() } : {};
    const next = await tx.contactMessage.update({ where: { id }, data: { status, ...handled } });
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'message.status', entityType: 'ContactMessage', entityId: id, oldValues: { status: before.status }, newValues: { status }, ip: req.ip });
    return next;
  });
  res.json(msg);
});

export default router;
