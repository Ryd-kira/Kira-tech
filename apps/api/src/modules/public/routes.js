import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError, errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { imageView, productCardView, productDetailView, showcaseView } from './dto.js';

// Tranches de budget du filtre public (FCFA). Modifiables ici sans toucher au frontend.
export const BUDGET_BANDS = [
  { id: 'lt150', label: 'Moins de 150 000 FCFA', max: 149_999 },
  { id: '150-300', label: '150 000 à 300 000 FCFA', min: 150_000, max: 300_000 },
  { id: '300-500', label: '300 000 à 500 000 FCFA', min: 300_001, max: 500_000 },
  { id: 'gt500', label: 'Plus de 500 000 FCFA', min: 500_001 },
];
const PERFORMANCE_LABELS = { BASIC: 'Basique', INTERMEDIATE: 'Intermédiaire', ADVANCED: 'Avancée', GAMING: 'Gaming' };
const PRODUCT_INCLUDE = {
  category: true,
  usages: { include: { usageTag: true }, orderBy: { usageTag: { sortOrder: 'asc' } } },
  images: { orderBy: { sortOrder: 'asc' } },
};

const router = Router();

// Les GET publics sont mis en cache 60 s par le navigateur et le CDN.
router.use((req, res, next) => {
  if (req.method === 'GET') res.set('Cache-Control', 'public, max-age=60');
  next();
});

const list = (inner) => z.preprocess((v) => (v == null || v === '' ? undefined : [].concat(v).flatMap((x) => String(x).split(','))), z.array(inner).max(10).optional());

const catalogQuery = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.string().max(80).optional(),
  ram: list(z.coerce.number().int().positive()),
  storage: list(z.coerce.number().int().positive()),
  usage: list(z.string().max(40)),
  performance: list(z.enum(['BASIC', 'INTERMEDIATE', 'ADVANCED', 'GAMING'])),
  condition: list(z.enum(['NEW', 'USED'])),
  budget: list(z.enum(BUDGET_BANDS.map((b) => b.id))),
  sort: z.enum(['new', 'price_asc', 'price_desc']).default('new'),
  page: z.coerce.number().int().min(1).max(500).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(24),
}).strict();

async function loadSettings() {
  return prisma.siteSetting.findUniqueOrThrow({ where: { id: 1 } });
}

async function stockStatuses(ids) {
  if (ids.length === 0) return new Map();
  const rows = await prisma.$queryRaw`
    SELECT "productId", "stockQuantity", "stockStatus", "availabilityLabel", "isManuallyUnavailable"
    FROM product_stock_status WHERE "productId" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`;
  return new Map(rows.map((r) => [r.productId, r]));
}

router.get('/products', async (req, res) => {
  const f = parse(catalogQuery, req.query);
  const and = [{ status: 'PUBLISHED' }];
  if (f.q) {
    and.push({ OR: ['name', 'brand', 'sku', 'processor'].map((k) => ({ [k]: { contains: f.q, mode: 'insensitive' } })) });
  }
  if (f.category) and.push({ category: { slug: f.category } });
  if (f.ram) and.push({ ramGb: { in: f.ram } });
  if (f.storage) and.push({ storageGb: { in: f.storage } });
  if (f.usage) and.push({ usages: { some: { usageTag: { slug: { in: f.usage } } } } });
  if (f.performance) and.push({ performanceLevel: { in: f.performance } });
  if (f.condition) and.push({ condition: { in: f.condition } });
  if (f.budget) {
    // Le filtre budget ne porte que sur les prix affichés : sinon il révélerait un prix masqué.
    and.push({ showPrice: true });
    and.push({
      OR: BUDGET_BANDS.filter((b) => f.budget.includes(b.id))
        .map((b) => ({ price: { ...(b.min != null ? { gte: b.min } : {}), ...(b.max != null ? { lte: b.max } : {}) } })),
    });
  }
  // Tri par prix : les prix masqués passent en fin de liste, triés par nouveauté.
  const orderBy = f.sort === 'new'
    ? [{ createdAt: 'desc' }, { id: 'desc' }]
    : [{ showPrice: 'desc' }, { price: f.sort === 'price_asc' ? 'asc' : 'desc' }, { createdAt: 'desc' }, { id: 'desc' }];
  const where = { AND: and };

  const [total, products, settings] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where, orderBy, skip: (f.page - 1) * f.limit, take: f.limit,
      include: { ...PRODUCT_INCLUDE, images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
    }),
    loadSettings(),
  ]);
  const statuses = await stockStatuses(products.map((p) => p.id));
  res.json({
    items: products.map((p) => productCardView(p, statuses.get(p.id), settings)),
    page: f.page, limit: f.limit, total, pages: Math.max(1, Math.ceil(total / f.limit)),
  });
});

router.get('/products/:slug', async (req, res) => {
  const { slug } = parse(z.object({ slug: z.string().min(1).max(160) }), req.params);
  const product = await prisma.product.findFirst({ where: { slug, status: 'PUBLISHED' }, include: PRODUCT_INCLUDE });
  if (!product) throw errors.notFound('Produit');
  const [statuses, settings, similar] = await Promise.all([
    stockStatuses([product.id]),
    loadSettings(),
    prisma.product.findMany({
      where: { status: 'PUBLISHED', categoryId: product.categoryId, NOT: { id: product.id } },
      orderBy: { createdAt: 'desc' }, take: 4,
      include: { ...PRODUCT_INCLUDE, images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
    }),
  ]);
  const similarStatuses = await stockStatuses(similar.map((p) => p.id));
  res.json({
    product: productDetailView(product, statuses.get(product.id), settings),
    similar: similar.map((p) => productCardView(p, similarStatuses.get(p.id), settings)),
  });
});

// Vitrine de l'accueil : jusqu'à 4 produits « mis en avant », avec un court texte.
router.get('/showcase', async (req, res) => {
  const [products, settings] = await Promise.all([
    prisma.product.findMany({
      where: { status: 'PUBLISHED', isFeatured: true },
      orderBy: { updatedAt: 'desc' }, take: 4,
      include: { ...PRODUCT_INCLUDE, images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
    }),
    loadSettings(),
  ]);
  const statuses = await stockStatuses(products.map((p) => p.id));
  res.json({ items: products.map((p) => showcaseView(p, statuses.get(p.id), settings)) });
});

router.get('/filters', async (req, res) => {
  const published = { status: 'PUBLISHED' };
  const [categories, usages, rams, storages] = await Promise.all([
    prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { name: true, slug: true } }),
    prisma.usageTag.findMany({ orderBy: { sortOrder: 'asc' }, select: { slug: true, label: true } }),
    prisma.product.findMany({ where: { ...published, ramGb: { not: null } }, distinct: ['ramGb'], select: { ramGb: true }, orderBy: { ramGb: 'asc' } }),
    prisma.product.findMany({ where: { ...published, storageGb: { not: null } }, distinct: ['storageGb'], select: { storageGb: true }, orderBy: { storageGb: 'asc' } }),
  ]);
  res.json({
    categories,
    usages,
    ram: rams.map((r) => r.ramGb),
    storage: storages.map((s) => s.storageGb),
    performance: Object.entries(PERFORMANCE_LABELS).map(([value, label]) => ({ value, label })),
    condition: [{ value: 'NEW', label: 'Neuf' }, { value: 'USED', label: 'Occasion' }],
    budget: BUDGET_BANDS.map(({ id, label }) => ({ id, label })),
  });
});

router.get('/categories', async (req, res) => {
  const items = await prisma.category.findMany({
    where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { name: true, slug: true, description: true },
  });
  res.json({ items });
});

router.get('/settings', async (req, res) => {
  // Coordonnées et textes : une modification dans l'administration doit se voir tout de suite.
  res.set('Cache-Control', 'no-cache');
  const [s, stores, services] = await Promise.all([
    loadSettings(),
    prisma.stockLocation.findMany({
      where: { type: 'STORE', isActive: true }, orderBy: { code: 'desc' },
      select: { code: true, name: true, city: true, address: true, phone: true, openingHours: true, logoUrl: true },
    }),
    prisma.siteService.findMany({
      where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { title: true, description: true, icon: true },
    }),
  ]);
  res.json({
    companyName: s.companyName, whatsappNumber: s.whatsappNumber, phone: s.phone, email: s.email,
    openingHours: s.openingHours, facebookUrl: s.facebookUrl, instagramUrl: s.instagramUrl, tiktokUrl: s.tiktokUrl,
    aboutText: s.aboutText, servicesIntro: s.servicesIntro,
    logoUrl: s.chainLogoUrl,
    homeLayout: s.homeLayout,
    // Bannière : absente tant qu'elle n'est pas activée.
    banner: s.bannerEnabled ? {
      title: s.bannerTitle, text: s.bannerText, ctaLabel: s.bannerCtaLabel, ctaUrl: s.bannerCtaUrl,
      image: s.bannerImageUrl ? imageView({ url: s.bannerImageUrl, width: s.bannerImageWidth, height: s.bannerImageHeight, alt: '' }, 1600) : null,
    } : null,
    stores, services,
  });
});

const contactLimiter = rateLimit({
  windowMs: 60 * 60_000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false,
  handler: (req, res, next) => next(new AppError(429, 'TOO_MANY_MESSAGES', 'Trop de messages envoyés. Réessayez plus tard ou écrivez-nous sur WhatsApp.')),
});

router.post('/contact', contactLimiter, async (req, res) => {
  const data = parse(z.object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().regex(/^\+?[0-9 ]{8,20}$/, 'Numéro de téléphone invalide'),
    email: z.union([z.email().max(254), z.literal('')]).optional(),
    subject: z.string().trim().min(2).max(150),
    message: z.string().trim().min(10).max(3000),
    productSlug: z.string().max(160).optional(),
    website: z.string().max(200).optional(), // champ piège invisible : rempli seulement par les robots
  }).strict(), req.body);

  if (data.website) return res.status(202).json({ status: 'received' });

  const product = data.productSlug
    ? await prisma.product.findFirst({ where: { slug: data.productSlug, status: 'PUBLISHED' }, select: { id: true } })
    : null;
  await prisma.contactMessage.create({
    data: {
      name: data.name, phone: data.phone.replace(/\s/g, ''), email: data.email || null,
      subject: data.subject, message: data.message, productId: product?.id ?? null,
    },
  });
  res.status(202).json({ status: 'received' });
});

const xmlEscape = (s) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

router.get('/sitemap.xml', async (req, res) => {
  const [products, categories] = await Promise.all([
    prisma.product.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 5000 }),
    prisma.category.findMany({ where: { isActive: true }, select: { slug: true } }),
  ]);
  const base = env.APP_URL.replace(/\/$/, '');
  const urls = [
    ...['/', '/catalogue', '/services', '/a-propos', '/contact'].map((p) => ({ loc: base + p })),
    ...categories.map((c) => ({ loc: `${base}/categories/${c.slug}` })),
    ...products.map((p) => ({ loc: `${base}/produits/${p.slug}`, lastmod: p.updatedAt.toISOString().slice(0, 10) })),
  ];
  const body = urls.map((u) => `<url><loc>${xmlEscape(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('');
  res.type('application/xml').set('Cache-Control', 'public, max-age=3600')
    .send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`);
});

export default router;
