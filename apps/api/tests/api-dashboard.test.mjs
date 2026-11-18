import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loginAs, makeAdmin, prisma } from './helpers.mjs';
import { csvCell } from '../src/modules/reports/routes.js';

let superA, admin, manager, shop, product;
const K = () => randomUUID();
const P = (who, url, body) => who.post(url).set('Idempotency-Key', K()).send(body ?? {});
const today = new Date(Date.now() + 3600_000).toISOString().slice(0, 10);

before(async () => {
  superA = await loginAs(await makeAdmin({ role: 'SUPER_ADMIN' }));
  admin = await loginAs(await makeAdmin({ role: 'ADMIN' }));
  manager = await loginAs(await makeAdmin({ role: 'GESTIONNAIRE' }));
  // Boutique dédiée : les chiffres du test ne sont pas pollués par les autres tests.
  shop = await prisma.stockLocation.create({ data: { code: `SHOP_${randomUUID().slice(0, 6).toUpperCase()}`, name: 'Boutique test', type: 'STORE' } });
  const cat = await prisma.category.findUniqueOrThrow({ where: { slug: 'accessoires' } });
  product = await prisma.product.create({ data: { slug: `d-${randomUUID()}`, sku: `D-${randomUUID().slice(0, 8)}`, name: 'Produit tableau de bord', brand: 'B', description: '', condition: 'NEW', status: 'PUBLISHED', price: 100000, averageCost: 70000, categoryId: cat.id } });
  await P(admin, '/api/v1/admin/stock/adjustments', { productId: product.id, locationId: shop.id, kind: 'IN', quantity: 5, reason: 'Stock' });
  // Vente : 2 × 100 000, remise 10 000, encaissé 90 000, puis 1 article retourné et remboursé 50 000.
  const s = await P(admin, '/api/v1/admin/sales', { channel: 'IN_STORE', locationId: shop.id, items: [{ productId: product.id, quantity: 2, discountAmount: 10000 }], payment: { amount: 90000, methodCode: 'CASH' }, handover: { mode: 'now', receivedByName: 'Client' } });
  const sale = (await admin.get(`/api/v1/admin/sales/${s.body.id}`)).body;
  const ret = await P(admin, `/api/v1/admin/sales/${s.body.id}/returns`, { reason: 'CUSTOMER_RETURN', locationId: shop.id, items: [{ saleItemId: sale.items[0].id, quantity: 1, condition: 'RESTOCKED' }] });
  await P(admin, `/api/v1/admin/payments/${sale.payments[0].id}/refunds`, { amount: 50000, methodCode: 'CASH', reason: 'Retour', returnId: ret.body.id });
});
after(() => prisma.$disconnect());

test("chiffre d'affaires, encaissements, créances et marge sont distincts et exacts", async () => {
  const res = await admin.get(`/api/v1/admin/dashboard?from=${today}&to=${today}&locationId=${shop.id}`);
  assert.equal(res.status, 200);
  const c = res.body.sections.commercial;
  assert.equal(c.gross, 190000);
  assert.equal(c.returnsValue, 95000); // la moitié de la ligne nette (190 000 / 2)
  assert.equal(c.revenue, 95000);
  assert.equal(c.salesCount, 1);
  assert.equal(c.collected, 90000);
  assert.equal(c.refunded, 50000);
  // Dû : 95 000 net - (90 000 - 50 000) = 55 000.
  assert.deepEqual(c.receivables, { amount: 55000, count: 1 });
  const m = res.body.sections.costs.margin;
  assert.equal(m.amount, 25000); // (95 000 - 70 000) × 1 article conservé
  assert.equal(res.body.sections.costs.stockValue.amount, 4 * 70000);
});

test('accès selon le rôle', async () => {
  const g = (await manager.get('/api/v1/admin/dashboard')).body.sections;
  assert.deepEqual(Object.keys(g), ['stock']);
  const a = (await admin.get('/api/v1/admin/dashboard')).body.sections;
  assert.deepEqual(Object.keys(a).sort(), ['commercial', 'costs', 'stock']);
  const s = (await superA.get('/api/v1/admin/dashboard')).body.sections;
  assert.ok('activity' in s);
  assert.equal((await manager.get('/api/v1/admin/reports/sales.csv')).status, 403);
  assert.equal((await admin.get('/api/v1/admin/audit-logs')).status, 403);
  assert.equal((await superA.get('/api/v1/admin/audit-logs?limit=5')).status, 200);
});

test('période invalide refusée proprement', async () => {
  assert.equal((await admin.get('/api/v1/admin/dashboard?from=2026-02-30x')).status, 400);
  assert.equal((await admin.get('/api/v1/admin/dashboard?from=2026-12-01&to=2026-01-01')).status, 400);
});

test('export CSV : en-tête Excel, protection contre les formules', async () => {
  const res = await admin.get(`/api/v1/admin/reports/sales.csv?from=${today}&to=${today}&locationId=${shop.id}`);
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/csv/);
  assert.match(res.text, /^﻿Numéro;Date/);
  assert.equal(csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
  assert.equal(csvCell('-5000'), '-5000');
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
});
