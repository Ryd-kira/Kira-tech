import { Router } from 'express';
import { z } from 'zod';
import { errors, isReferenced } from '../../lib/errors.js';
import { pageQuery, pageResult } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { writeAudit } from '../../services/audit.js';

const router = Router();
const opt = (max) => z.string().trim().max(max).nullable().optional().transform((v) => (v === '' ? null : v));
// Seulement les informations nécessaires (addendum 2 §6).
export const customerFields = {
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^\+?[0-9 ]{8,20}$/, 'Numéro invalide').transform((v) => v.replace(/\s/g, '')),
  email: z.union([z.email().max(254), z.literal(''), z.null()]).optional().transform((v) => (v === '' ? null : v)),
  address: opt(300), city: opt(80), district: opt(80), notes: opt(2000),
};

router.use(requirePermission('customers:write'));

router.get('/', async (req, res) => {
  const f = parse(z.object({ ...pageQuery, q: z.string().trim().max(80).optional() }).strict(), req.query);
  const where = f.q ? { OR: [{ name: { contains: f.q, mode: 'insensitive' } }, { phone: { contains: f.q.replace(/\s/g, '') } }] } : {};
  const [total, items] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (f.page - 1) * f.limit, take: f.limit }),
  ]);
  res.json(pageResult(items, total, f.page, f.limit));
});

router.get('/:id', async (req, res) => {
  const { id } = parse(z.object({ id: z.uuid() }), req.params);
  const c = await prisma.customer.findUnique({
    where: { id },
    include: {
      sales: { orderBy: { validatedAt: 'desc' }, include: { items: { select: { productName: true, quantity: true } }, payments: { include: { paymentMethod: true } }, returns: { include: { items: true } } } },
      reservations: { orderBy: { createdAt: 'desc' }, take: 20, include: { items: { include: { product: { select: { name: true } } } } } },
    },
  });
  if (!c) throw errors.notFound('Client');
  const balances = c.sales.length ? await prisma.$queryRaw`SELECT "saleId", "netTotal", collected, refunded, "amountDue", "paymentStatus" FROM sale_balance WHERE "saleId" = ANY(${c.sales.map((s) => s.id)}::uuid[])` : [];
  const receivable = balances.reduce((s, b) => s + Math.max(b.amountDue, 0), 0);
  res.json({ ...c, balances, receivable });
});

router.post('/', async (req, res) => {
  const data = parse(z.object(customerFields).strict(), req.body);
  const c = await prisma.$transaction(async (tx) => {
    const created = await tx.customer.create({ data: { ...data, createdById: req.admin.id } });
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'customer.create', entityType: 'Customer', entityId: created.id, ip: req.ip });
    return created;
  });
  res.status(201).json(c);
});

router.patch('/:id', async (req, res) => {
  const { id } = parse(z.object({ id: z.uuid() }), req.params);
  const data = parse(z.object(customerFields).partial().strict().refine((d) => Object.keys(d).length > 0, 'Aucune modification'), req.body);
  const c = await prisma.$transaction(async (tx) => {
    if (!(await tx.customer.findUnique({ where: { id } }))) throw errors.notFound('Client');
    const next = await tx.customer.update({ where: { id }, data });
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'customer.update', entityType: 'Customer', entityId: id, newValues: Object.keys(data), ip: req.ip });
    return next;
  });
  res.json(c);
});

// Suppression : seulement un client sans achat, réservation ni numéro de série.
// Avec un historique, l'anonymisation retire ses données personnelles et garde les ventes.
router.delete('/:id', requirePermission('customers:delete'), async (req, res) => {
  const { id } = parse(z.object({ id: z.uuid() }), req.params);
  try {
    await prisma.$transaction(async (tx) => {
      const c = await tx.customer.findUnique({ where: { id } });
      if (!c) throw errors.notFound('Client');
      await tx.customer.delete({ where: { id } });
      await writeAudit(tx, { adminUserId: req.admin.id, action: 'customer.delete', entityType: 'Customer', entityId: id, oldValues: { name: c.name }, ip: req.ip });
    });
  } catch (err) {
    if (isReferenced(err)) {
      throw errors.conflict('CUSTOMER_HAS_HISTORY', "Ce client a des achats ou des réservations : il ne peut pas être supprimé sans perdre la traçabilité. Vous pouvez l'anonymiser.");
    }
    throw err;
  }
  res.status(204).end();
});

export const ANONYMOUS = { name: 'Client anonymisé', phone: '0000000000', email: null, address: null, city: null, district: null, notes: null };

router.post('/:id/anonymize', requirePermission('customers:delete'), async (req, res) => {
  const { id } = parse(z.object({ id: z.uuid() }), req.params);
  const c = await prisma.$transaction(async (tx) => {
    const before = await tx.customer.findUnique({ where: { id } });
    if (!before) throw errors.notFound('Client');
    const next = await tx.customer.update({ where: { id }, data: ANONYMOUS });
    // Le journal garde la trace de l'action, pas les données retirées.
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'customer.anonymize', entityType: 'Customer', entityId: id, ip: req.ip });
    return next;
  });
  res.json(c);
});

export default router;
