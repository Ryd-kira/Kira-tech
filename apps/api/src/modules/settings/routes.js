import { Router } from 'express';
import { z } from 'zod';
import { can } from '../../auth/permissions.js';
import { cloudinaryConfig, deliveryUrl, destroy, FOLDERS, isOwnPublicId, uploadSignature } from '../../lib/cloudinary.js';
import { AppError, errors, isReferenced } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
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
  // Accueil
  homeLayout: z.enum(['CLASSIC', 'SHOWCASE']).optional(),
  bannerEnabled: z.boolean().optional(),
  bannerTitle: optText(120),
  bannerText: longText(400),
  bannerCtaLabel: optText(40),
  // Lien du bouton : une page du site (/catalogue?ram=16) ou une adresse https.
  bannerCtaUrl: z.union([
    z.string().trim().max(300).regex(/^\/(?!\/)[A-Za-z0-9\-._~/?#&=%+,:]*$/, 'Chemin du site (ex. /catalogue) ou adresse https'),
    z.url({ protocol: /^https$/ }).max(300), z.literal(''), z.null(),
  ]).optional().transform((v) => (v === '' ? null : v)),
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

const SETTINGS_PERMS = ['settings:content', 'settings:sensitive', 'branding:write', 'stores:manage'];
const readable = (req, res, next) => (SETTINGS_PERMS.some((p) => can(req.admin.role, p)) ? next() : next(errors.forbidden()));

router.get('/', readable, async (req, res) => {
  const [settings, locations, paymentMethods, services] = await Promise.all([
    prisma.siteSetting.findUniqueOrThrow({ where: { id: 1 } }),
    prisma.stockLocation.findMany({ orderBy: { code: 'asc' } }),
    prisma.paymentMethod.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.siteService.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
  ]);
  res.json({
    settings, locations, paymentMethods, services,
    canEditContent: can(req.admin.role, 'settings:content'),
    canEditSensitive: can(req.admin.role, 'settings:sensitive'),
    canEditBranding: can(req.admin.role, 'branding:write'),
    canManageStores: can(req.admin.role, 'stores:manage'),
  });
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
    const merged = { ...before, ...data };
    if (merged.bannerEnabled && !merged.bannerTitle) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Certaines informations sont invalides.', [{ field: 'bannerTitle', message: 'Un titre est nécessaire pour afficher la bannière.' }]);
    }
    if (Boolean(merged.bannerCtaLabel) !== Boolean(merged.bannerCtaUrl)) {
      const field = merged.bannerCtaLabel ? 'bannerCtaUrl' : 'bannerCtaLabel';
      throw new AppError(400, 'VALIDATION_ERROR', 'Certaines informations sont invalides.', [{ field, message: 'Renseignez le texte et le lien du bouton, ou aucun des deux.' }]);
    }
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
  if ('isActive' in data && !can(req.admin.role, 'stores:manage')) {
    throw new AppError(403, 'FORBIDDEN_FIELD', "Vous n'avez pas l'autorisation d'activer ou de désactiver une boutique.");
  }
  if (Object.keys(data).some((k) => k !== 'isActive') && !can(req.admin.role, 'settings:content')) throw errors.forbidden();
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
  if (!can(req.admin.role, 'stores:manage')) throw errors.forbidden();
  const data = parse(z.object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,30}$/, 'De 2 à 30 lettres, chiffres ou _ (ex. PORTO_NOVO)'),
    name: z.string().trim().min(2).max(80),
    type: z.enum(['STORE', 'WAREHOUSE']),
    city: optText(80),
    address: optText(300),
    phone: optText(30),
    openingHours: optText(300),
  }).strict(), req.body);
  const loc = await prisma.$transaction(async (tx) => {
    const created = await tx.stockLocation.create({ data: { ...data, isSellable: data.type === 'STORE' } });
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'location.create', entityType: 'StockLocation', entityId: created.id, newValues: data, ip: req.ip });
    return created;
  });
  res.status(201).json(loc);
});

// Suppression : seulement une boutique sans historique (aucun mouvement, vente, achat…).
// Avec un historique, la base refuse (clés étrangères) : on propose la désactivation.
router.delete('/locations/:id', readable, async (req, res) => {
  if (!can(req.admin.role, 'stores:manage')) throw errors.forbidden();
  const { id } = parse(z.object({ id: z.uuid() }), req.params);
  let removed;
  try {
    removed = await prisma.$transaction(async (tx) => {
      const loc = await tx.stockLocation.findUnique({ where: { id } });
      if (!loc) throw errors.notFound('Emplacement');
      if (loc.type === 'TRANSIT') throw errors.conflict('LOCATION_LOCKED', "L'emplacement « En transit » est géré par le système.");
      const levels = await tx.stockLevel.findMany({ where: { locationId: id } });
      if (levels.some((l) => l.onHand || l.reserved || l.allocated || l.quarantine || l.damaged)) {
        throw errors.conflict('LOCATION_HAS_STOCK', 'Cet emplacement contient encore du stock. Transférez-le ou désactivez la boutique.');
      }
      await tx.stockLevel.deleteMany({ where: { locationId: id } });
      await tx.stockLocation.delete({ where: { id } });
      await writeAudit(tx, { adminUserId: req.admin.id, action: 'location.delete', entityType: 'StockLocation', entityId: id, oldValues: { code: loc.code, name: loc.name }, ip: req.ip });
      return loc;
    });
  } catch (err) {
    if (isReferenced(err)) {
      throw errors.conflict('LOCATION_HAS_HISTORY', "Cette boutique a un historique (ventes, mouvements, achats…) et ne peut pas être supprimée. Désactivez-la : elle disparaît du site et de la caisse, l'historique reste consultable.");
    }
    throw err;
  }
  cleanup(removed.logoPublicId);
  res.status(204).end();
});

// ── Identité visuelle : logos et image de bannière ─────────────────────────
function requireCloudinary() {
  const cfg = cloudinaryConfig();
  if (!cfg) throw new AppError(503, 'CLOUDINARY_NOT_CONFIGURED', "L'envoi d'images n'est pas encore configuré (compte Cloudinary).");
  return cfg;
}
// Nettoyage après validation : un échec ici n'annule pas l'opération.
function cleanup(publicId) {
  const cfg = cloudinaryConfig();
  if (cfg && publicId) destroy(cfg, publicId).catch((err) => logger.warn({ err, publicId }, 'image Cloudinary non supprimée'));
}
const imageBody = z.object({
  image: z.object({
    publicId: z.string().max(255).refine((v) => isOwnPublicId(v, FOLDERS.branding), 'Fichier non reconnu'),
    version: z.number().int().positive(),
    format: z.enum(['jpg', 'jpeg', 'png', 'webp']),
    width: z.number().int().positive().max(20000),
    height: z.number().int().positive().max(20000),
  }).strict().nullable(),
}).strict();
const canBrand = (req, purpose) => can(req.admin.role, purpose === 'banner' ? 'settings:content' : 'branding:write');

router.post('/branding/signature', readable, async (req, res) => {
  const { purpose } = parse(z.object({ purpose: z.enum(['logo', 'banner']) }).strict(), req.body);
  if (!canBrand(req, purpose)) throw errors.forbidden();
  res.json(uploadSignature(requireCloudinary(), Date.now(), FOLDERS.branding));
});

// Remplace (ou retire, image: null) une image de SiteSetting ; renvoie les paramètres à jour.
async function setSettingImage(req, { urlField, idField, sizeFields, action }) {
  const { image } = parse(imageBody, req.body);
  const cfg = image ? requireCloudinary() : null;
  const url = image ? deliveryUrl(cfg, image.publicId, image.version, image.format) : null;
  const before = await prisma.$transaction(async (tx) => {
    const prev = await tx.siteSetting.findUniqueOrThrow({ where: { id: 1 } });
    const data = { [urlField]: url, [idField]: image?.publicId ?? null };
    if (sizeFields) Object.assign(data, { [sizeFields[0]]: image?.width ?? null, [sizeFields[1]]: image?.height ?? null });
    await tx.siteSetting.update({ where: { id: 1 }, data });
    await writeAudit(tx, { adminUserId: req.admin.id, action, entityType: 'SiteSetting', entityId: '1', oldValues: { publicId: prev[idField] }, newValues: { publicId: image?.publicId ?? null }, ip: req.ip });
    return prev;
  });
  if (before[idField] && before[idField] !== image?.publicId) cleanup(before[idField]);
  return prisma.siteSetting.findUniqueOrThrow({ where: { id: 1 } });
}

router.put('/branding/chain-logo', readable, async (req, res) => {
  if (!canBrand(req, 'logo')) throw errors.forbidden();
  res.json(await setSettingImage(req, { urlField: 'chainLogoUrl', idField: 'chainLogoPublicId', action: 'branding.chain_logo.update' }));
});

router.put('/branding/banner-image', readable, async (req, res) => {
  if (!canBrand(req, 'banner')) throw errors.forbidden();
  res.json(await setSettingImage(req, {
    urlField: 'bannerImageUrl', idField: 'bannerImagePublicId', sizeFields: ['bannerImageWidth', 'bannerImageHeight'], action: 'branding.banner_image.update',
  }));
});

router.put('/locations/:id/logo', readable, async (req, res) => {
  if (!canBrand(req, 'logo')) throw errors.forbidden();
  const { id } = parse(z.object({ id: z.uuid() }), req.params);
  const { image } = parse(imageBody, req.body);
  const cfg = image ? requireCloudinary() : null;
  const [before, loc] = await prisma.$transaction(async (tx) => {
    const prev = await tx.stockLocation.findUnique({ where: { id } });
    if (!prev) throw errors.notFound('Emplacement');
    if (prev.type === 'TRANSIT') throw errors.conflict('LOCATION_LOCKED', "L'emplacement « En transit » est géré par le système.");
    const next = await tx.stockLocation.update({
      where: { id },
      data: { logoUrl: image ? deliveryUrl(cfg, image.publicId, image.version, image.format) : null, logoPublicId: image?.publicId ?? null },
    });
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'location.logo.update', entityType: 'StockLocation', entityId: id, oldValues: { publicId: prev.logoPublicId }, newValues: { publicId: image?.publicId ?? null }, ip: req.ip });
    return [prev, next];
  });
  if (before.logoPublicId && before.logoPublicId !== image?.publicId) cleanup(before.logoPublicId);
  res.json(loc);
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
