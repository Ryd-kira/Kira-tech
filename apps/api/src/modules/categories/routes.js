import { Router } from 'express';
import { z } from 'zod';
import { can } from '../../auth/permissions.js';
import { errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { uniqueSlug } from '../../lib/slug.js';
import { parse } from '../../lib/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { writeAudit } from '../../services/audit.js';

const router = Router();

// Lecture : nécessaire au formulaire produit, donc ouverte à qui gère les produits.
const canRead = (req, res, next) =>
  (can(req.admin.role, 'products:write') || can(req.admin.role, 'categories:write') ? next() : next(errors.forbidden()));

router.get('/', canRead, async (req, res) => {
  const items = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: true } } },
  });
  res.json({ items: items.map(({ _count, ...c }) => ({ ...c, productCount: _count.products })) });
});

router.get('/usage-tags', canRead, async (req, res) => {
  res.json({ items: await prisma.usageTag.findMany({ orderBy: { sortOrder: 'asc' } }) });
});

const fields = {
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
};

router.post('/', requirePermission('categories:write'), async (req, res) => {
  const data = parse(z.object(fields).strict(), req.body);
  const cat = await prisma.$transaction(async (tx) => {
    const created = await tx.category.create({ data: { ...data, slug: await uniqueSlug(tx, 'category', data.name) } });
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'category.create', entityType: 'Category', entityId: created.id, newValues: data, ip: req.ip });
    return created;
  });
  res.status(201).json(cat);
});

router.patch('/:id', requirePermission('categories:write'), async (req, res) => {
  const { id } = parse(z.object({ id: z.uuid() }), req.params);
  const data = parse(z.object(fields).partial().strict().refine((d) => Object.keys(d).length > 0, 'Aucune modification'), req.body);
  const cat = await prisma.$transaction(async (tx) => {
    const before = await tx.category.findUnique({ where: { id } });
    if (!before) throw errors.notFound('Catégorie');
    const updated = await tx.category.update({ where: { id }, data });
    await writeAudit(tx, {
      adminUserId: req.admin.id, action: 'category.update', entityType: 'Category', entityId: id,
      oldValues: Object.fromEntries(Object.keys(data).map((k) => [k, before[k]])), newValues: data, ip: req.ip,
    });
    return updated;
  });
  res.json(cat);
});

router.delete('/:id', requirePermission('categories:write'), async (req, res) => {
  const { id } = parse(z.object({ id: z.uuid() }), req.params);
  await prisma.$transaction(async (tx) => {
    const cat = await tx.category.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
    if (!cat) throw errors.notFound('Catégorie');
    if (cat._count.products > 0) {
      throw errors.conflict('CATEGORY_NOT_EMPTY', `Cette catégorie contient ${cat._count.products} produit(s) : déplacez-les ou désactivez la catégorie.`);
    }
    await tx.category.delete({ where: { id } });
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'category.delete', entityType: 'Category', entityId: id, oldValues: { name: cat.name }, ip: req.ip });
  });
  res.status(204).end();
});

export default router;
