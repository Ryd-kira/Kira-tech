import { Router } from 'express';
import { z } from 'zod';
import { errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { writeAudit } from '../../services/audit.js';

const router = Router();
const opt = (max) => z.string().trim().max(max).nullable().optional().transform((v) => (v === '' ? null : v));
const fields = {
  name: z.string().trim().min(2).max(120),
  contactName: opt(120), phone: opt(30),
  email: z.union([z.email().max(254), z.literal(''), z.null()]).optional().transform((v) => (v === '' ? null : v)),
  address: opt(300), notes: opt(2000), isActive: z.boolean().optional(),
};

// Lecture ouverte à qui réceptionne (le GESTIONNAIRE voit le fournisseur d'une livraison).
router.get('/', requirePermission('purchases:receive'), async (req, res) => {
  const items = await prisma.supplier.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { purchases: true } } } });
  res.json({ items: items.map(({ _count, ...s }) => ({ ...s, purchaseCount: _count.purchases })) });
});

router.post('/', requirePermission('suppliers:write'), async (req, res) => {
  const data = parse(z.object(fields).strict(), req.body);
  const s = await prisma.$transaction(async (tx) => {
    const created = await tx.supplier.create({ data });
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'supplier.create', entityType: 'Supplier', entityId: created.id, newValues: data, ip: req.ip });
    return created;
  });
  res.status(201).json(s);
});

router.patch('/:id', requirePermission('suppliers:write'), async (req, res) => {
  const { id } = parse(z.object({ id: z.uuid() }), req.params);
  const data = parse(z.object(fields).partial().strict().refine((d) => Object.keys(d).length > 0, 'Aucune modification'), req.body);
  const s = await prisma.$transaction(async (tx) => {
    const before = await tx.supplier.findUnique({ where: { id } });
    if (!before) throw errors.notFound('Fournisseur');
    const next = await tx.supplier.update({ where: { id }, data });
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'supplier.update', entityType: 'Supplier', entityId: id, oldValues: Object.fromEntries(Object.keys(data).map((k) => [k, before[k]])), newValues: data, ip: req.ip });
    return next;
  });
  res.json(s);
});

export default router;
