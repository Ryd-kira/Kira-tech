import { Router } from 'express';
import { z } from 'zod';
import { pageQuery, pageResult } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePermission } from '../../middleware/auth.js';

// Journal d'activité : lecture seule (la base interdit toute modification), SUPER_ADMIN.
const router = Router();
router.use(requirePermission('audit:read'));

router.get('/', async (req, res) => {
  const f = parse(z.object({
    ...pageQuery, action: z.string().max(60).optional(), entityType: z.string().max(40).optional(),
    adminUserId: z.uuid().optional(), entityId: z.string().max(60).optional(),
    from: z.coerce.date().optional(), to: z.coerce.date().optional(),
  }).strict(), req.query);
  const where = {
    ...(f.action ? { action: { startsWith: f.action } } : {}),
    ...(f.entityType ? { entityType: f.entityType } : {}),
    ...(f.adminUserId ? { adminUserId: f.adminUserId } : {}),
    ...(f.entityId ? { entityId: f.entityId } : {}),
    ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (f.page - 1) * f.limit, take: f.limit, include: { adminUser: { select: { name: true, email: true } } } }),
  ]);
  res.json(pageResult(items, total, f.page, f.limit));
});

export default router;
