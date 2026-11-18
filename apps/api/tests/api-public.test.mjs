import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { app, ORIGIN, prisma } from './helpers.mjs';

const tag = randomUUID().slice(0, 6);
let cat, store;

async function product(over) {
  const p = await prisma.product.create({
    data: {
      slug: `p-${tag}-${randomUUID().slice(0, 6)}`, sku: `SKU-${randomUUID().slice(0, 8)}`, name: `Test ${tag}`, brand: 'Marque',
      description: 'Description', condition: 'NEW', status: 'PUBLISHED', categoryId: cat.id, price: 300000, ramGb: 8, storageGb: 512,
      ...over,
    },
  });
  return p;
}

before(async () => {
  cat = await prisma.category.create({ data: { name: `Cat ${tag}`, slug: `cat-${tag}` } });
  store = await prisma.stockLocation.findUniqueOrThrow({ where: { code: 'COTONOU' } });
});
after(() => prisma.$disconnect());

const list = (qs) => request(app).get(`/api/v1/public/products?category=cat-${tag}&${qs}`);

test('prix masqué : absent de la réponse, jamais de coût ni de quantité physique', async () => {
  const p = await product({ showPrice: false, price: 777777, averageCost: 500000, name: `Caché ${tag}` });
  await prisma.stockLevel.create({ data: { productId: p.id, locationId: store.id, onHand: 5, reserved: 1 } });
  const res = await request(app).get(`/api/v1/public/products/${p.slug}`);
  assert.equal(res.status, 200);
  const raw = JSON.stringify(res.body);
  assert.equal(raw.includes('777777'), false);
  assert.equal(raw.includes('500000'), false);
  assert.equal('price' in res.body.product, false);
  assert.equal(res.body.product.priceOnRequest, true);
  assert.equal(res.body.product.availability.label, 'Disponible');
  assert.equal('quantity' in res.body.product.availability, false);
  for (const k of ['averageCost', 'stockLevels', 'id', 'categoryId', 'isManuallyUnavailable']) {
    assert.equal(k in res.body.product, false, k);
  }
});

test('brouillons et archives invisibles', async () => {
  const d = await product({ status: 'DRAFT' });
  const a = await product({ status: 'ARCHIVED' });
  assert.equal((await request(app).get(`/api/v1/public/products/${d.slug}`)).status, 404);
  assert.equal((await request(app).get(`/api/v1/public/products/${a.slug}`)).status, 404);
  const res = await list('');
  assert.equal(res.body.items.some((i) => [d.slug, a.slug].includes(i.slug)), false);
});

test('filtres combinés RAM + budget ; le budget ignore les prix masqués', async () => {
  const fixtureCat = await prisma.category.create({ data: { name: `Cat2 ${tag}`, slug: `cat2-${tag}` } });
  const mk = (o) => product({ categoryId: fixtureCat.id, ...o });
  const a = await mk({ ramGb: 16, price: 200000 });
  await mk({ ramGb: 8, price: 200000 });
  await mk({ ramGb: 16, price: 600000 });
  await mk({ ramGb: 16, price: 200000, showPrice: false });
  const res = await request(app).get(`/api/v1/public/products?category=cat2-${tag}&ram=16&budget=150-300`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.items.map((i) => i.slug), [a.slug]);
  assert.equal(res.body.total, 1);
});

test('tri par prix : prix masqués en dernier', async () => {
  const c = await prisma.category.create({ data: { name: `Cat3 ${tag}`, slug: `cat3-${tag}` } });
  const hidden = await product({ categoryId: c.id, price: 1, showPrice: false });
  const cheap = await product({ categoryId: c.id, price: 100000 });
  const dear = await product({ categoryId: c.id, price: 900000 });
  const res = await request(app).get(`/api/v1/public/products?category=cat3-${tag}&sort=price_asc`);
  assert.deepEqual(res.body.items.map((i) => i.slug), [cheap.slug, dear.slug, hidden.slug]);
});

test('disponibilité : désactivation manuelle et seuil de stock faible', async () => {
  const off = await product({ isManuallyUnavailable: true });
  await prisma.stockLevel.create({ data: { productId: off.id, locationId: store.id, onHand: 10 } });
  const low = await product({ lowStockThreshold: 2 });
  await prisma.stockLevel.create({ data: { productId: low.id, locationId: store.id, onHand: 2 } });
  const out = await product({});
  const get = async (p) => (await request(app).get(`/api/v1/public/products/${p.slug}`)).body.product.availability;
  assert.deepEqual(await get(off), { status: 'UNAVAILABLE', label: 'Indisponible' });
  assert.deepEqual(await get(low), { status: 'LOW_STOCK', label: 'Stock faible' });
  assert.deepEqual(await get(out), { status: 'OUT_OF_STOCK', label: 'Rupture de stock' });
});

test('paramètre de filtre invalide : 400 lisible, pas 500', async () => {
  const res = await request(app).get('/api/v1/public/products?ram=abc');
  assert.equal(res.status, 400);
  const unknown = await request(app).get('/api/v1/public/products?evil=1');
  assert.equal(unknown.status, 400);
});

test('contact : enregistré, champ piège ignoré, origine exigée', async () => {
  const body = { name: 'Client test', phone: '+229 01 00 00 00 00', subject: 'Disponibilité', message: 'Bonjour, ce modèle est-il disponible ?' };
  const ok = await request(app).post('/api/v1/public/contact').set('Origin', ORIGIN).send(body);
  assert.equal(ok.status, 202);
  const bot = await request(app).post('/api/v1/public/contact').set('Origin', ORIGIN).send({ ...body, name: 'Robot', website: 'http://spam' });
  assert.equal(bot.status, 202);
  assert.equal(await prisma.contactMessage.count({ where: { name: 'Robot' } }), 0);
  const noOrigin = await request(app).post('/api/v1/public/contact').send(body);
  assert.equal(noOrigin.status, 403);
});

test('filtres et sitemap', async () => {
  const f = await request(app).get('/api/v1/public/filters');
  assert.equal(f.status, 200);
  assert.ok(f.body.usages.some((u) => u.slug === 'programmation'));
  const s = await request(app).get('/api/v1/public/sitemap.xml');
  assert.equal(s.status, 200);
  assert.match(s.text, /<urlset/);
  assert.match(s.headers['content-type'], /xml/);
});
