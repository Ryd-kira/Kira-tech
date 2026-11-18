import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loginAs, makeAdmin, prisma } from './helpers.mjs';

let admin, manager, cat, cotonou, calavi, transit;
const key = () => randomUUID();
async function product(over = {}) {
  return prisma.product.create({
    data: { slug: `s-${randomUUID()}`, sku: `S-${randomUUID().slice(0, 10)}`, name: `Stock ${randomUUID().slice(0, 4)}`, brand: 'B', description: '', condition: 'NEW', price: 100000, categoryId: cat.id, ...over },
  });
}
const level = async (productId, locationId) =>
  (await prisma.$queryRaw`SELECT physical, reserved, allocated, available, quarantine, damaged FROM stock_availability WHERE "productId" = ${productId}::uuid AND "locationId" = ${locationId}::uuid`)[0]
  ?? { physical: 0, available: 0, damaged: 0, quarantine: 0 };

before(async () => {
  admin = await loginAs(await makeAdmin({ role: 'ADMIN' }));
  manager = await loginAs(await makeAdmin({ role: 'GESTIONNAIRE' }));
  cat = await prisma.category.findUniqueOrThrow({ where: { slug: 'accessoires' } });
  [cotonou, calavi, transit] = await Promise.all(['COTONOU', 'CALAVI', 'TRANSIT'].map((code) => prisma.stockLocation.findUniqueOrThrow({ where: { code } })));
});
after(() => prisma.$disconnect());

const adjust = (who, body, k = key()) => who.post('/api/v1/admin/stock/adjustments').set('Idempotency-Key', k).send(body);

test('ajustements : entrée, sortie refusée au-delà du disponible, casse vers « endommagé »', async () => {
  const p = await product();
  assert.equal((await adjust(manager, { productId: p.id, locationId: cotonou.id, kind: 'IN', quantity: 5, reason: 'Inventaire initial' })).status, 201);
  const tooMuch = await adjust(manager, { productId: p.id, locationId: cotonou.id, kind: 'OUT', quantity: 6, reason: 'Erreur' });
  assert.equal(tooMuch.status, 409);
  assert.equal(tooMuch.body.error.code, 'STOCK_INSUFFICIENT');
  assert.equal((await adjust(manager, { productId: p.id, locationId: cotonou.id, kind: 'DAMAGE', quantity: 2, reason: 'Écran fissuré' })).status, 201);
  const l = await level(p.id, cotonou.id);
  assert.equal(l.physical, 3);
  assert.equal(l.damaged, 2);
  const moves = await prisma.stockMovement.findMany({ where: { productId: p.id }, orderBy: { createdAt: 'asc' } });
  assert.deepEqual(moves.map((m) => [m.type, m.bucket, m.quantityBefore, m.quantityAfter]), [
    ['ADJUSTMENT_IN', 'ON_HAND', 0, 5], ['DAMAGE', 'ON_HAND', 5, 3], ['DAMAGE', 'DAMAGED', 0, 2],
  ]);
});

test('ajustement : motif obligatoire, double envoi rejoué sans double mouvement', async () => {
  const p = await product();
  assert.equal((await adjust(admin, { productId: p.id, locationId: cotonou.id, kind: 'IN', quantity: 1, reason: '' })).status, 400);
  const k = key();
  const body = { productId: p.id, locationId: cotonou.id, kind: 'IN', quantity: 4, reason: 'Inventaire' };
  const [a, b] = await Promise.all([adjust(admin, body, k), adjust(admin, body, k)]);
  assert.deepEqual([a.status, b.status].sort(), [201, 201]);
  assert.equal((await level(p.id, cotonou.id)).physical, 4);
});

test('concurrence : 10 sorties simultanées de 1 sur un stock de 3, exactement 3 passent', async () => {
  const p = await product();
  await adjust(admin, { productId: p.id, locationId: cotonou.id, kind: 'IN', quantity: 3, reason: 'Inventaire' });
  const results = await Promise.all(Array.from({ length: 10 }, () =>
    adjust(admin, { productId: p.id, locationId: cotonou.id, kind: 'LOSS', quantity: 1, reason: 'Test concurrence' })));
  assert.equal(results.filter((r) => r.status === 201).length, 3);
  assert.equal((await level(p.id, cotonou.id)).physical, 0);
});

test('transfert Cotonou -> Calavi : transit puis réception, annulation impossible après', async () => {
  const p = await product();
  await adjust(admin, { productId: p.id, locationId: cotonou.id, kind: 'IN', quantity: 4, reason: 'Inventaire' });
  const t = await manager.post('/api/v1/admin/transfers').set('Idempotency-Key', key())
    .send({ sourceLocationId: cotonou.id, destinationLocationId: calavi.id, items: [{ productId: p.id, quantity: 3 }] });
  assert.equal(t.status, 201);
  assert.match(t.body.number, /^T-\d{4}-\d{6}$/);
  assert.equal((await manager.post(`/api/v1/admin/transfers/${t.body.id}/ship`).set('Idempotency-Key', key()).send({})).status, 200);
  assert.equal((await level(p.id, cotonou.id)).physical, 1);
  assert.equal((await level(p.id, transit.id)).physical, 3);
  const again = await manager.post(`/api/v1/admin/transfers/${t.body.id}/ship`).set('Idempotency-Key', key()).send({});
  assert.equal(again.body.error.code, 'INVALID_TRANSITION');
  assert.equal((await manager.post(`/api/v1/admin/transfers/${t.body.id}/receive`).set('Idempotency-Key', key()).send({})).status, 200);
  assert.equal((await level(p.id, transit.id)).physical, 0);
  assert.equal((await level(p.id, calavi.id)).physical, 3);
  const detail = await manager.get(`/api/v1/admin/transfers/${t.body.id}`);
  assert.deepEqual(detail.body.statusChanges.map((s) => s.toStatus), ['PENDING', 'IN_TRANSIT', 'RECEIVED']);
});

test("transfert annulé en route : la marchandise revient à la source", async () => {
  const p = await product();
  await adjust(admin, { productId: p.id, locationId: cotonou.id, kind: 'IN', quantity: 2, reason: 'Inventaire' });
  const t = await admin.post('/api/v1/admin/transfers').set('Idempotency-Key', key()).send({ sourceLocationId: cotonou.id, destinationLocationId: calavi.id, items: [{ productId: p.id, quantity: 2 }] });
  await admin.post(`/api/v1/admin/transfers/${t.body.id}/ship`).set('Idempotency-Key', key()).send({});
  const c = await admin.post(`/api/v1/admin/transfers/${t.body.id}/cancel`).set('Idempotency-Key', key()).send({ reason: 'Erreur de destination' });
  assert.equal(c.status, 200);
  assert.equal((await level(p.id, cotonou.id)).physical, 2);
  assert.equal((await level(p.id, transit.id)).physical, 0);
});

test('achat : réceptions partielles, sur-réception refusée, coût moyen pondéré, coûts cachés au gestionnaire', async () => {
  const p1 = await product();
  const p2 = await product();
  const supplier = await prisma.supplier.create({ data: { name: `Fournisseur ${randomUUID().slice(0, 6)}` } });
  const created = await admin.post('/api/v1/admin/purchases').set('Idempotency-Key', key()).send({
    supplierId: supplier.id, locationId: cotonou.id, purchaseDate: '2026-11-18', additionalCosts: 20000,
    items: [{ productId: p1.id, quantityOrdered: 4, unitCost: 100000 }, { productId: p2.id, quantityOrdered: 10, unitCost: 10000 }],
  });
  assert.equal(created.status, 201);
  assert.equal((await manager.post('/api/v1/admin/purchases').set('Idempotency-Key', key()).send({})).status, 403);
  // Création seule : aucun stock.
  assert.equal((await level(p1.id, cotonou.id)).physical, 0);

  const detail = await admin.get(`/api/v1/admin/purchases/${created.body.id}`);
  assert.equal(detail.body.totalAmount, 520000);
  const i1 = detail.body.items.find((i) => i.productId === p1.id);
  const i2 = detail.body.items.find((i) => i.productId === p2.id);
  assert.equal(i1.landedUnitCost, 104000); // 400 000 / 500 000 des frais = 16 000, soit 4 000 par unité
  assert.equal(i2.landedUnitCost, 10400);

  const over = await manager.post(`/api/v1/admin/purchases/${created.body.id}/receipts`).set('Idempotency-Key', key()).send({ items: [{ purchaseItemId: i1.id, quantity: 5 }] });
  assert.equal(over.body.error.code, 'OVER_RECEIPT');
  const r1 = await manager.post(`/api/v1/admin/purchases/${created.body.id}/receipts`).set('Idempotency-Key', key()).send({ items: [{ purchaseItemId: i1.id, quantity: 2 }] });
  assert.equal(r1.body.purchaseStatus, 'PARTIALLY_RECEIVED');
  assert.equal((await level(p1.id, cotonou.id)).physical, 2);
  assert.equal(Number((await prisma.product.findUnique({ where: { id: p1.id } })).averageCost), 104000);

  const managerView = await manager.get(`/api/v1/admin/purchases/${created.body.id}`);
  assert.equal('totalAmount' in managerView.body, false);
  assert.equal('unitCost' in managerView.body.items[0], false);

  const r2 = await manager.post(`/api/v1/admin/purchases/${created.body.id}/receipts`).set('Idempotency-Key', key())
    .send({ items: [{ purchaseItemId: i1.id, quantity: 2 }, { purchaseItemId: i2.id, quantity: 10 }] });
  assert.equal(r2.body.purchaseStatus, 'RECEIVED');
  assert.equal((await admin.post(`/api/v1/admin/purchases/${created.body.id}/cancel`).set('Idempotency-Key', key()).send({ reason: 'Trop tard' })).body.error.code, 'INVALID_TRANSITION');
});

test('coût moyen : deux réceptions à prix différents', async () => {
  const p = await product();
  const supplier = await prisma.supplier.create({ data: { name: `F ${randomUUID().slice(0, 6)}` } });
  for (const [qty, cost] of [[2, 100000], [2, 120000]]) {
    const pur = await admin.post('/api/v1/admin/purchases').set('Idempotency-Key', key()).send({ supplierId: supplier.id, locationId: cotonou.id, purchaseDate: '2026-11-18', items: [{ productId: p.id, quantityOrdered: qty, unitCost: cost }] });
    const d = await admin.get(`/api/v1/admin/purchases/${pur.body.id}`);
    await admin.post(`/api/v1/admin/purchases/${pur.body.id}/receipts`).set('Idempotency-Key', key()).send({ items: [{ purchaseItemId: d.body.items[0].id, quantity: qty }] });
  }
  assert.equal(Number((await prisma.product.findUnique({ where: { id: p.id } })).averageCost), 110000);
});

test('numéros de série : obligatoires à la réception, suivis lors du transfert', async () => {
  const p = await product({ isSerialized: true });
  const supplier = await prisma.supplier.create({ data: { name: `F ${randomUUID().slice(0, 6)}` } });
  const pur = await admin.post('/api/v1/admin/purchases').set('Idempotency-Key', key()).send({ supplierId: supplier.id, locationId: cotonou.id, purchaseDate: '2026-11-18', items: [{ productId: p.id, quantityOrdered: 2, unitCost: 300000 }] });
  const item = (await admin.get(`/api/v1/admin/purchases/${pur.body.id}`)).body.items[0];
  const missing = await admin.post(`/api/v1/admin/purchases/${pur.body.id}/receipts`).set('Idempotency-Key', key()).send({ items: [{ purchaseItemId: item.id, quantity: 2 }] });
  assert.equal(missing.body.error.code, 'SERIALS_REQUIRED');
  const sns = [`SN-${randomUUID().slice(0, 8)}`, `SN-${randomUUID().slice(0, 8)}`];
  assert.equal((await admin.post(`/api/v1/admin/purchases/${pur.body.id}/receipts`).set('Idempotency-Key', key()).send({ items: [{ purchaseItemId: item.id, quantity: 2, serialNumbers: sns }] })).status, 201);
  const serials = await prisma.productSerialNumber.findMany({ where: { productId: p.id } });
  assert.equal(serials.length, 2);
  assert.ok(serials.every((s) => s.status === 'IN_STOCK' && s.locationId === cotonou.id && s.supplierId === supplier.id));

  const t = await admin.post('/api/v1/admin/transfers').set('Idempotency-Key', key()).send({ sourceLocationId: cotonou.id, destinationLocationId: calavi.id, items: [{ productId: p.id, quantity: 1 }] });
  const noSerial = await admin.post(`/api/v1/admin/transfers/${t.body.id}/ship`).set('Idempotency-Key', key()).send({});
  assert.equal(noSerial.body.error.code, 'SERIALS_REQUIRED');
  await admin.post(`/api/v1/admin/transfers/${t.body.id}/ship`).set('Idempotency-Key', key()).send({ serials: { [p.id]: [serials[0].id] } });
  assert.equal((await prisma.productSerialNumber.findUnique({ where: { id: serials[0].id } })).status, 'IN_TRANSIT');
  await admin.post(`/api/v1/admin/transfers/${t.body.id}/receive`).set('Idempotency-Key', key()).send({});
  const moved = await prisma.productSerialNumber.findUnique({ where: { id: serials[0].id } });
  assert.equal(moved.locationId, calavi.id);
  assert.equal(moved.status, 'IN_STOCK');
  const history = await admin.get(`/api/v1/admin/stock/serials/${serials[0].id}`);
  assert.deepEqual(history.body.movements.map((m) => m.type), ['PURCHASE_RECEIPT', 'TRANSFER_OUT', 'TRANSFER_OUT', 'TRANSFER_IN', 'TRANSFER_IN']);
});

test('vue des niveaux de stock par emplacement', async () => {
  const p = await product({ name: `Vue niveaux ${randomUUID().slice(0, 6)}` });
  await adjust(admin, { productId: p.id, locationId: calavi.id, kind: 'IN', quantity: 7, reason: 'Inventaire' });
  const res = await manager.get(`/api/v1/admin/stock/levels?q=${encodeURIComponent(p.name)}`);
  assert.equal(res.status, 200);
  const row = res.body.items[0];
  assert.equal(row.sellable, 7);
  assert.equal(row.levels.find((l) => l.locationId === calavi.id).available, 7);
});
