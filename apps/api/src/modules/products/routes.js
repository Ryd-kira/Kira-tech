import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { can } from '../../auth/permissions.js';
import { cloudinaryConfig, deliveryUrl, destroy, isOwnPublicId, uploadSignature } from '../../lib/cloudinary.js';
import { AppError, errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { pageQuery, pageResult } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { uniqueSlug } from '../../lib/slug.js';
import { parse } from '../../lib/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { writeAudit } from '../../services/audit.js';

const router = Router();
router.use(requirePermission('products:write'));

const PRICE_FIELDS = ['price', 'showPrice'];
const nullableText = (max) => z.string().trim().max(max).nullable().optional().transform((v) => (v === '' ? null : v));

// Liste blanche explicite des champs modifiables : tout autre champ est refusé.
const productFields = {
  name: z.string().trim().min(2).max(160),
  sku: z.string().trim().min(2).max(60).regex(/^[A-Za-z0-9._-]+$/, 'Lettres, chiffres, point, tiret ou souligné'),
  brand: z.string().trim().min(1).max(60),
  categoryId: z.uuid(),
  description: z.string().trim().max(5000),
  condition: z.enum(['NEW', 'USED']),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  processor: nullableText(120),
  ramGb: z.number().int().positive().max(1024).nullable().optional(),
  storageGb: z.number().int().positive().max(65536).nullable().optional(),
  storageType: nullableText(30),
  gpu: nullableText(120),
  screenSizeInch: z.number().positive().max(100).nullable().optional(),
  resolution: nullableText(40),
  operatingSystem: nullableText(60),
  performanceLevel: z.enum(['BASIC', 'INTERMEDIATE', 'ADVANCED', 'GAMING']).nullable().optional(),
  warrantyMonths: z.number().int().min(0).max(120).nullable().optional(),
  color: nullableText(40),
  isTouchscreen: z.boolean(),
  conditionNote: nullableText(120),
  batteryNote: nullableText(120),
  extraSpecs: z.array(z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().min(1).max(160) }).strict()).max(20),
  price: z.number().int().min(0).max(100_000_000),
  showPrice: z.boolean(),
  lowStockThreshold: z.number().int().min(0).max(10000),
  isManuallyUnavailable: z.boolean(),
  isFeatured: z.boolean(),
  isSerialized: z.boolean(),
  usageSlugs: z.array(z.string().max(40)).max(10),
};
const createSchema = z.object({
  ...productFields,
  description: productFields.description.default(''),
  status: productFields.status.default('DRAFT'),
  price: productFields.price.optional(),
  showPrice: productFields.showPrice.optional(),
  lowStockThreshold: productFields.lowStockThreshold.default(2),
  isManuallyUnavailable: productFields.isManuallyUnavailable.default(false),
  isFeatured: productFields.isFeatured.default(false),
  isSerialized: productFields.isSerialized.default(false),
  isTouchscreen: productFields.isTouchscreen.default(false),
  extraSpecs: productFields.extraSpecs.default([]),
  usageSlugs: productFields.usageSlugs.default([]),
}).strict();
const updateSchema = z.object(productFields).partial().strict()
  .refine((d) => Object.keys(d).length > 0, 'Aucune modification');

// Droit par champ : un GESTIONNAIRE gère les produits mais pas les prix (matrice validée).
function assertPriceRight(admin, data) {
  const touched = PRICE_FIELDS.filter((f) => f in data);
  if (touched.length && !can(admin.role, 'products:price')) {
    throw new AppError(403, 'FORBIDDEN_FIELD', "Vous n'avez pas l'autorisation de modifier le prix.", touched.map((field) => ({ field, message: 'Réservé aux administrateurs' })));
  }
}

async function usagesFor(tx, slugs) {
  if (!slugs) return undefined;
  const tags = await tx.usageTag.findMany({ where: { slug: { in: slugs } } });
  if (tags.length !== new Set(slugs).size) throw new AppError(400, 'VALIDATION_ERROR', 'Usage inconnu.', [{ field: 'usageSlugs', message: 'Usage inconnu' }]);
  return tags;
}

async function assertCategory(tx, id) {
  if (id && !(await tx.category.findUnique({ where: { id }, select: { id: true } }))) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Catégorie inconnue.', [{ field: 'categoryId', message: 'Catégorie inconnue' }]);
  }
}

const ADMIN_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  usages: { include: { usageTag: { select: { slug: true, label: true } } } },
  images: { orderBy: { sortOrder: 'asc' } },
};

async function statusesFor(ids) {
  if (!ids.length) return new Map();
  const rows = await prisma.$queryRaw`
    SELECT "productId", "stockQuantity", "stockStatus", "availabilityLabel"
    FROM product_stock_status WHERE "productId" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`;
  return new Map(rows.map((r) => [r.productId, r]));
}

function adminView(p, status, admin) {
  const { averageCost, usages, ...rest } = p;
  return {
    ...rest,
    screenSizeInch: p.screenSizeInch == null ? null : Number(p.screenSizeInch),
    usages: usages.map((u) => u.usageTag),
    // Coût d'achat : visible seulement pour qui voit les coûts (dashboard:costs).
    ...(can(admin.role, 'dashboard:costs') ? { averageCost: Number(averageCost) } : {}),
    stock: status ? { quantity: status.stockQuantity, status: status.stockStatus, label: status.availabilityLabel } : { quantity: 0, status: 'OUT_OF_STOCK', label: 'Rupture de stock' },
  };
}

// Valeurs utiles à l'audit : seulement les champs effectivement modifiés.
function diff(before, data) {
  const oldValues = {};
  const newValues = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === 'usageSlugs') continue;
    const prev = before[k] instanceof Prisma.Decimal ? Number(before[k]) : before[k];
    if (prev !== v) { oldValues[k] = prev; newValues[k] = v; }
  }
  return { oldValues, newValues };
}

router.get('/', async (req, res) => {
  const f = parse(z.object({
    ...pageQuery,
    q: z.string().trim().max(80).optional(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
    categoryId: z.uuid().optional(),
    stock: z.enum(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']).optional(),
  }).strict(), req.query);
  const and = [];
  if (f.q) and.push({ OR: ['name', 'brand', 'sku'].map((k) => ({ [k]: { contains: f.q, mode: 'insensitive' } })) });
  if (f.status) and.push({ status: f.status });
  else and.push({ status: { not: 'ARCHIVED' } });
  if (f.categoryId) and.push({ categoryId: f.categoryId });
  if (f.stock) {
    const ids = await prisma.$queryRaw`SELECT "productId" FROM product_stock_status WHERE "stockStatus" = ${f.stock}`;
    and.push({ id: { in: ids.map((r) => r.productId) } });
  }
  const where = { AND: and };
  const [total, items] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip: (f.page - 1) * f.limit, take: f.limit,
      include: { ...ADMIN_INCLUDE, images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
    }),
  ]);
  const statuses = await statusesFor(items.map((p) => p.id));
  res.json(pageResult(items.map((p) => adminView(p, statuses.get(p.id), req.admin)), total, f.page, f.limit));
});

router.get('/:id', async (req, res) => {
  const { id } = parse(z.object({ id: z.uuid() }), req.params);
  const p = await prisma.product.findUnique({ where: { id }, include: ADMIN_INCLUDE });
  if (!p) throw errors.notFound('Produit');
  const statuses = await statusesFor([id]);
  res.json(adminView(p, statuses.get(id), req.admin));
});

router.post('/', async (req, res) => {
  const data = parse(createSchema, req.body);
  assertPriceRight(req.admin, data);
  const product = await prisma.$transaction(async (tx) => {
    await assertCategory(tx, data.categoryId);
    const tags = await usagesFor(tx, data.usageSlugs);
    const { usageSlugs, ...fields } = data;
    const created = await tx.product.create({
      data: {
        ...fields,
        price: fields.price ?? 0,
        // Sans prix saisi, le prix n'est jamais affiché.
        showPrice: fields.showPrice ?? (fields.price != null),
        slug: await uniqueSlug(tx, 'product', fields.name),
        usages: { create: tags.map((t) => ({ usageTagId: t.id })) },
      },
      include: ADMIN_INCLUDE,
    });
    await writeAudit(tx, {
      adminUserId: req.admin.id, action: 'product.create', entityType: 'Product', entityId: created.id,
      newValues: { name: created.name, sku: created.sku, price: created.price, showPrice: created.showPrice, status: created.status }, ip: req.ip,
    });
    return created;
  });
  res.status(201).json(adminView(product, null, req.admin));
});

router.patch('/:id', async (req, res) => {
  const { id } = parse(z.object({ id: z.uuid() }), req.params);
  const data = parse(updateSchema, req.body);
  assertPriceRight(req.admin, data);
  const product = await prisma.$transaction(async (tx) => {
    const before = await tx.product.findUnique({ where: { id }, include: { usages: { include: { usageTag: true } } } });
    if (!before) throw errors.notFound('Produit');
    await assertCategory(tx, data.categoryId);
    const tags = await usagesFor(tx, data.usageSlugs);
    const { usageSlugs, ...fields } = data;
    if (fields.name && fields.name !== before.name && before.status === 'DRAFT') {
      // Le slug suit le nom tant que le produit n'a jamais été publié (les liens publiés restent stables).
      fields.slug = await uniqueSlug(tx, 'product', fields.name, id);
    }
    if (tags) {
      await tx.productUsage.deleteMany({ where: { productId: id } });
      await tx.productUsage.createMany({ data: tags.map((t) => ({ productId: id, usageTagId: t.id })) });
    }
    const updated = await tx.product.update({ where: { id }, data: fields, include: ADMIN_INCLUDE });
    const { oldValues, newValues } = diff(before, data);
    if (tags) {
      oldValues.usages = before.usages.map((u) => u.usageTag.slug).sort();
      newValues.usages = [...usageSlugs].sort();
    }
    const priceChanged = PRICE_FIELDS.some((f) => f in newValues);
    await writeAudit(tx, {
      adminUserId: req.admin.id, action: priceChanged ? 'product.price.update' : 'product.update',
      entityType: 'Product', entityId: id, oldValues, newValues, ip: req.ip,
    });
    return updated;
  });
  const statuses = await statusesFor([id]);
  res.json(adminView(product, statuses.get(id), req.admin));
});

// Suppression réelle seulement sans aucun historique ; sinon, archivage.
router.delete('/:id', async (req, res) => {
  const { id } = parse(z.object({ id: z.uuid() }), req.params);
  const images = await prisma.$transaction(async (tx) => {
    const p = await tx.product.findUnique({
      where: { id },
      include: {
        images: true,
        _count: { select: { stockMovements: true, saleItems: true, reservationItems: true, purchaseItems: true, transferItems: true, serialNumbers: true } },
        stockLevels: true,
      },
    });
    if (!p) throw errors.notFound('Produit');
    const hasHistory = Object.values(p._count).some((n) => n > 0)
      || p.stockLevels.some((l) => l.onHand || l.reserved || l.allocated || l.quarantine || l.damaged);
    if (hasHistory) {
      throw errors.conflict('PRODUCT_HAS_HISTORY', 'Ce produit a un historique de stock ou de ventes : archivez-le au lieu de le supprimer.');
    }
    await tx.stockLevel.deleteMany({ where: { productId: id } });
    await tx.contactMessage.updateMany({ where: { productId: id }, data: { productId: null } });
    await tx.product.delete({ where: { id } });
    await writeAudit(tx, {
      adminUserId: req.admin.id, action: 'product.delete', entityType: 'Product', entityId: id,
      oldValues: { name: p.name, sku: p.sku }, ip: req.ip,
    });
    return p.images;
  });
  // Nettoyage Cloudinary après validation : un échec ici ne doit pas annuler la suppression.
  const cfg = cloudinaryConfig();
  if (cfg) {
    for (const img of images) {
      destroy(cfg, img.cloudinaryPublicId).catch((err) => logger.warn({ err, publicId: img.cloudinaryPublicId }, 'image Cloudinary non supprimée'));
    }
  }
  res.status(204).end();
});

// ── Photos ──────────────────────────────────────────────────────────────────
function requireCloudinary() {
  const cfg = cloudinaryConfig();
  if (!cfg) throw new AppError(503, 'CLOUDINARY_NOT_CONFIGURED', "L'envoi de photos n'est pas encore configuré (compte Cloudinary).");
  return cfg;
}

router.post('/:id/images/signature', async (req, res) => {
  const { id } = parse(z.object({ id: z.uuid() }), req.params);
  const cfg = requireCloudinary();
  if (!(await prisma.product.findUnique({ where: { id }, select: { id: true } }))) throw errors.notFound('Produit');
  res.json(uploadSignature(cfg));
});

router.post('/:id/images', async (req, res) => {
  const { id } = parse(z.object({ id: z.uuid() }), req.params);
  const cfg = requireCloudinary();
  const data = parse(z.object({
    publicId: z.string().max(255).refine((v) => isOwnPublicId(v), 'Fichier non reconnu'),
    version: z.number().int().positive(),
    format: z.enum(['jpg', 'jpeg', 'png', 'webp']),
    width: z.number().int().positive().max(20000),
    height: z.number().int().positive().max(20000),
    alt: z.string().trim().max(200).optional(),
  }).strict(), req.body);
  const image = await prisma.$transaction(async (tx) => {
    const p = await tx.product.findUnique({ where: { id }, select: { name: true } });
    if (!p) throw errors.notFound('Produit');
    const last = await tx.productImage.findFirst({ where: { productId: id }, orderBy: { sortOrder: 'desc' } });
    const created = await tx.productImage.create({
      data: {
        productId: id, cloudinaryPublicId: data.publicId, url: deliveryUrl(cfg, data.publicId, data.version, data.format),
        width: data.width, height: data.height, alt: data.alt || p.name, sortOrder: last ? last.sortOrder + 1 : 0,
      },
    });
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'product.image.add', entityType: 'Product', entityId: id, newValues: { publicId: data.publicId }, ip: req.ip });
    return created;
  });
  res.status(201).json(image);
});

// Réordonner : la liste complète des identifiants, dans le nouvel ordre (le premier = photo principale).
router.put('/:id/images/order', async (req, res) => {
  const { id } = parse(z.object({ id: z.uuid() }), req.params);
  const { ids } = parse(z.object({ ids: z.array(z.uuid()).min(1).max(50) }).strict(), req.body);
  const images = await prisma.$transaction(async (tx) => {
    const current = await tx.productImage.findMany({ where: { productId: id } });
    if (current.length !== ids.length || !current.every((img) => ids.includes(img.id))) {
      throw new AppError(400, 'VALIDATION_ERROR', 'La liste des photos ne correspond pas au produit.');
    }
    // Deux passes pour ne jamais violer l'unicité (produit, ordre) en cours de route.
    for (const [i, imgId] of ids.entries()) await tx.productImage.update({ where: { id: imgId }, data: { sortOrder: 1000 + i } });
    for (const [i, imgId] of ids.entries()) await tx.productImage.update({ where: { id: imgId }, data: { sortOrder: i } });
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'product.image.reorder', entityType: 'Product', entityId: id, ip: req.ip });
    return tx.productImage.findMany({ where: { productId: id }, orderBy: { sortOrder: 'asc' } });
  });
  res.json({ items: images });
});

router.patch('/:id/images/:imageId', async (req, res) => {
  const { id, imageId } = parse(z.object({ id: z.uuid(), imageId: z.uuid() }), req.params);
  const { alt } = parse(z.object({ alt: z.string().trim().min(1).max(200) }).strict(), req.body);
  const img = await prisma.productImage.findFirst({ where: { id: imageId, productId: id } });
  if (!img) throw errors.notFound('Photo');
  res.json(await prisma.productImage.update({ where: { id: imageId }, data: { alt } }));
});

router.delete('/:id/images/:imageId', async (req, res) => {
  const { id, imageId } = parse(z.object({ id: z.uuid(), imageId: z.uuid() }), req.params);
  const img = await prisma.$transaction(async (tx) => {
    // L'image doit appartenir au produit de l'URL (pas de suppression croisée).
    const found = await tx.productImage.findFirst({ where: { id: imageId, productId: id } });
    if (!found) throw errors.notFound('Photo');
    await tx.productImage.delete({ where: { id: imageId } });
    const rest = await tx.productImage.findMany({ where: { productId: id }, orderBy: { sortOrder: 'asc' } });
    for (const [i, r] of rest.entries()) if (r.sortOrder !== i) await tx.productImage.update({ where: { id: r.id }, data: { sortOrder: i } });
    await writeAudit(tx, { adminUserId: req.admin.id, action: 'product.image.delete', entityType: 'Product', entityId: id, oldValues: { publicId: found.cloudinaryPublicId }, ip: req.ip });
    return found;
  });
  const cfg = cloudinaryConfig();
  if (cfg) destroy(cfg, img.cloudinaryPublicId).catch((err) => logger.warn({ err }, 'image Cloudinary non supprimée'));
  res.status(204).end();
});

export default router;
