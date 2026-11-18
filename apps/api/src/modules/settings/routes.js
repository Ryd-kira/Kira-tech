import { Router } from 'express';
import { z } from 'zod';
import { can } from '../../auth/permissions.js';
import { AppError, errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { writeAudit } from '../../services/audit.js';

const router = Router();

const optText = (max) => z.string().trim().max(max).nullable().optional().transform((v) => (v === '' ? null : v));
// Liens publics : https uniquement (refuse javascript:, data:, http:).
const optUrl = z.union([z.url({ protocol: /^https$/ }).max(300), z.literal(''), z.null()]).optional().transform((v) => (v === '' ? null : v));
// Texte long : retours à la ligne normalisés, espaces de fin retirés.
const longText = (max) => z.string().max(max).nullable().optional()
  .transform((v) => (v === undefined ? undefined : v === null ? null : v.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim() || null));

// Deux niveaux, conformément à la matrice : contenu (ADMIN) et paramètres sensibles (SUPER_ADMIN).
const CONTENT = {
  companyName: z.string().trim().min(2).max(100).optional(),
  phone: optText(30),
  email: z.union([z.email().max(254), z.literal(''), z.null()]).optional().transform((v) => (v === '' ? null : v)),
  openingHours: optText(300),
  facebookUrl: optUrl,
  instagramUrl: optUrl,
  tiktokUrl: optUrl,
  aboutText: longText(6000),
  servicesIntro: longText(600),
};
const SENSITIVE = {
  whatsappNumber: z.union([z.string().trim().regex(/^\+[1-9][0-9]{7,14}$/, 'Format international attendu, ex. +229XXXXXXXX'), z.literal(''), z.null()])
    .optional().transform((v) => (v === '' ? null : v)),
  publicStockDisplay: z.enum(['LABEL_ONLY', 'LABEL_AND_QUANTITY']).optional(),
  reservationDefaultHours: z.number().int().min(1).max(720).optional(),
  allowBackorder: z.boolean().optional(),
  maxDiscountPercentAdmin: z.number().int().min(0).max(100).optional(),
  maxDiscountPercentManager: z.number().int().min(0).max(100).optional(),
};

const readable = (req, res, next) =>
  (can(req.admin.role, 'settings:content') || can(req.admin.role, 'settings:sensitive') ? next() : next(errors.forbidden()));

router.get('/', readable, async (req, res) => {
  const [settings, locations, paymentMethods, services] = await Promise.all([
    prisma.siteSetting.findUniqueOrThrow({ where: { id: 1 } }),
    prisma.stockLocation.findMany({ orderBy: { code: 'asc' } }),
    prisma.paymentMethod.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.siteService.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
  ]);
  res.json({ settings, locations, paymentMethods, services, canEditContent: can(req.admin.role, 'settings:content'), canEditSensitive: can(req.admin.role, 'settings:sensitive') });
});

router.patch('/', readable, async (req, res) => {
  const data = parse(z.object({ ...CONTENT, ...SENSITIVE }).strict().refine((d) => Object.keys(d).length > 0, 'Aucune modification'), req.body);
  const sensitive = Object.keys(data).filter((k) => k in SENSITIVE);
  if (sensitive.length && !can(req.admin.role, 'settings:sensitive')) {
    throw new AppError(403, 'FORBIDDEN_FIELD', 'Ces paramètres sont réservés au super administrateur.', sensitive.map((field) => ({ field, message: 'Réservé au super administrateur' })));
  }
  if (Object.keys(data).some((k) => k in CONTENT) && !can(req.admin.role, 'settings:content')) throw errors.forbidden();
  const updated = await prisma.$transaction(async (tx) => {
    const before = await tx.siteSetting.findUniqueOrThrow({ where: { id: 1 } });
    const next = await tx.siteSetting.update({ where: { id: 1 }, data });
    await writeAudit(tx, {
      adminUserId: req.admin.id, action: sensitive.length ? 'settings.sensitive.update' : 'settings.update', entityType: 'SiteSetting', entityId: '1',
      oldValues: Object.fromEntries(Object.keys(data).map((k) => [k, before[k]])), newValues: data, ip: req.ip,
    });
    return next;
  });
  res.json(updated);
});

// Boutiques : adresse et ville affichées sur le site (contenu) ; création et activation (sensible).
router.patch('/locations/:id', readable, async (req, res) => {
  const { id } = parse(z.object({ id: z.uuid() }), req.params);
  const data = parse(z.object({
    name: z.string().trim().min(2).max(80).optional(),
    city: optText(80),
    address: optText(300),
    phone: optText(30),
    openingHours: optText(300),
    isActive: z.boolean().optional(),
  }).strict().refine((d) => Object.keys(d).length > 0, 'Aucune modification'), req.body);
  if ('isActive' in data && !can(req.admin.role, 'settings:sensitive')) {
    throw new AppError(403, 'FORBIDDEN_FIELD', "L'activation d'un emplacement est réservée au super administrateur.");
  }
  if (!can(req.admin.role, 'settings:content') && !can(req.admin.role, 'settings:sensitive')) throw errors.forbidden();
  const loc = await prisma.$transaction(async (tx) => {
    const before = await tx.stockLocation.findUnique({ where: { id } });
    if (!before) throw errors.notFound('Emplacement');
    if (before.type === 'TRANSIT') throw errors.conflict('LOCATION_LOCKED', "L'emplacement « En transit » est géré par le système.");
    const next = await tx.stockLocation.update({ where: { id }, data });
    await writeAudit(tx, {
      adminUserId: req.admin.id, action: 'location.update', entityType: 'StockLocation', entityId: id,
      oldValues: Object.fromEntries(Object.keys(data).map((k) => [k, before[k]])), newValues: data, ip: req.ip,
    });
    return next;
  });
  res.json(loc);
});

router.post('/locations', readable, async (req, res) => {
  if (!can(req.admin.role, 'settings:sensitive')) throw errors.forbidden();
  const data = parse(z.object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,30}$/),
    name: z.string().trim().min(2).max(80),
    type: z.enum(['STORE', 'WAREHOUSE']),
    city: optText(80),
    address: optText(300),
  }).strict(), req.body);
  const loc = await prisma.$transaction(async (tx) => {
    const created = await tx.stockLocation.create({ data: { ...data, isSellable: data.type === 'STORE' } });
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'location.create', entityType: 'StockLocation', entityId: created.id, newValues: data, ip: req.ip });
    return created;
  });
  res.status(201).json(loc);
});

// Prestations affichées sur le site : contenu, donc ADMIN et SUPER_ADMIN.
const contentOnly = (req, res, next) => (can(req.admin.role, 'settings:content') ? next() : next(errors.forbidden()));
const serviceFields = {
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().min(2).max(1000),
  icon: z.enum(['WRENCH', 'CPU', 'PHONE', 'SEARCH', 'CHAT']),
  sortOrder: z.number().int().min(0).max(999),
  isActive: z.boolean(),
};
const serviceId = (req) => parse(z.object({ id: z.uuid() }), req.params).id;

router.post('/services', contentOnly, async (req, res) => {
  const data = parse(z.object(serviceFields).partial({ icon: true, sortOrder: true, isActive: true }).strict(), req.body);
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.siteService.create({ data });
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'service.create', entityType: 'SiteService', entityId: row.id, newValues: data, ip: req.ip });
    return row;
  });
  res.status(201).json(created);
});

router.patch('/services/:id', contentOnly, async (req, res) => {
  const id = serviceId(req);
  const data = parse(z.object(serviceFields).partial().strict().refine((d) => Object.keys(d).length > 0, 'Aucune modification'), req.body);
  const updated = await prisma.$transaction(async (tx) => {
    const before = await tx.siteService.findUnique({ where: { id } });
    if (!before) throw errors.notFound('Prestation');
    const row = await tx.siteService.update({ where: { id }, data });
    await writeAudit(tx, {
      adminUserId: req.admin.id, action: 'service.update', entityType: 'SiteService', entityId: id,
      oldValues: Object.fromEntries(Object.keys(data).map((k) => [k, before[k]])), newValues: data, ip: req.ip,
    });
    return row;
  });
  res.json(updated);
});

router.delete('/services/:id', contentOnly, async (req, res) => {
  const id = serviceId(req);
  await prisma.$transaction(async (tx) => {
    const before = await tx.siteService.findUnique({ where: { id } });
    if (!before) throw errors.notFound('Prestation');
    await tx.siteService.delete({ where: { id } });
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'service.delete', entityType: 'SiteService', entityId: id, oldValues: { title: before.title }, ip: req.ip });
  });
  res.status(204).end();
});

export default router;
