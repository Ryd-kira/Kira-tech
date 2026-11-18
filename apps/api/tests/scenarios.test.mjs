// Les 12 scénarios obligatoires de l'addendum 3 (§ I), plus les garde-fous associés.
// Chaque scénario vérifie : compteurs de stock, statuts, solde, et historique cohérent.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loginAs, makeAdmin, prisma } from './helpers.mjs';
import { sweepOnce } from '../src/jobs/expireReservations.js';

let admin, superA, manager, cat, store, transit;
const K = () => randomUUID();
const P = (who, url, body) => who.post(url).set('Idempotency-Key', K()).send(body ?? {});

async function computer({ qty = 3, price = 300000, serialized = false } = {}) {
  const p = await prisma.product.create({
    data: { slug: `pc-${randomUUID()}`, sku: `PC-${randomUUID().slice(0, 8)}`, name: `Ordinateur ${randomUUID().slice(0, 4)}`, brand: 'HP', description: '', condition: 'NEW', status: 'PUBLISHED', price, categoryId: cat.id, isSerialized: serialized, warrantyMonths: 12 },
  });
  if (qty) {
    const body = { productId: p.id, locationId: store.id, kind: 'IN', quantity: qty, reason: 'Stock initial' };
    if (serialized) body.serialNumbers = Array.from({ length: qty }, () => `SN-${randomUUID().slice(0, 8)}`);
    const r = await P(admin, '/api/v1/admin/stock/adjustments', body);
    assert.equal(r.status, 201, JSON.stringify(r.body));
  }
  return p;
}
const lvl = async (productId, locationId = store.id) =>
  (await prisma.$queryRaw`SELECT physical, reserved, allocated, available, quarantine, damaged FROM stock_availability WHERE "productId" = ${productId}::uuid AND "locationId" = ${locationId}::uuid`)[0]
  ?? { physical: 0, reserved: 0, allocated: 0, available: 0, quarantine: 0, damaged: 0 };
const sale = async (id) => (await admin.get(`/api/v1/admin/sales/${id}`)).body;
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));

before(async () => {
  admin = await loginAs(await makeAdmin({ role: 'ADMIN' }));
  superA = await loginAs(await makeAdmin({ role: 'SUPER_ADMIN' }));
  manager = await loginAs(await makeAdmin({ role: 'GESTIONNAIRE' }));
  cat = await prisma.category.findUniqueOrThrow({ where: { slug: 'ordinateurs-portables' } });
  store = await prisma.stockLocation.findUniqueOrThrow({ where: { code: 'COTONOU' } });
  transit = await prisma.stockLocation.findUniqueOrThrow({ where: { code: 'TRANSIT' } });
});
after(() => prisma.$disconnect());

test('1. Réserver un ordinateur sans paiement', async () => {
  const p = await computer();
  const r = await P(admin, '/api/v1/admin/reservations', { locationId: store.id, items: [{ productId: p.id, quantity: 1 }], newCustomer: { name: 'Client Un', phone: '+22997000001' } });
  assert.equal(r.status, 201);
  assert.match(r.body.number, /^R-\d{4}-\d{6}$/);
  assert.deepEqual(pick(await lvl(p.id), ['physical', 'reserved', 'available']), { physical: 3, reserved: 1, available: 2 });
  const d = (await admin.get(`/api/v1/admin/reservations/${r.body.id}`)).body;
  assert.equal(d.status, 'PENDING');
  assert.equal(d.payments.length, 0);
});

test('2. Réserver un ordinateur avec acompte', async () => {
  const p = await computer();
  const r = await P(admin, '/api/v1/admin/reservations', {
    locationId: store.id, items: [{ productId: p.id, quantity: 1 }], newCustomer: { name: 'Client Deux', phone: '+22997000002' },
    deposit: { amount: 100000, methodCode: 'MOBILE_MONEY', externalReference: 'MM-123' },
  });
  assert.equal(r.status, 201);
  const d = (await admin.get(`/api/v1/admin/reservations/${r.body.id}`)).body;
  assert.equal(d.payments.length, 1);
  assert.equal(d.payments[0].amount, 100000);
  assert.equal(d.payments[0].saleId, null);
  assert.equal((await lvl(p.id)).reserved, 1);
});

test('3. Convertir une réservation en vente validée (pas de double comptage)', async () => {
  const p = await computer();
  const r = await P(admin, '/api/v1/admin/reservations', { locationId: store.id, items: [{ productId: p.id, quantity: 1 }], deposit: { amount: 100000, methodCode: 'CASH' } });
  const before = await lvl(p.id);
  const c = await P(admin, `/api/v1/admin/reservations/${r.body.id}/convert`, {});
  assert.equal(c.status, 201);
  const after = await lvl(p.id);
  assert.deepEqual(pick(after, ['physical', 'reserved', 'allocated']), { physical: 3, reserved: 0, allocated: 1 });
  assert.equal(after.available, before.available);
  const s = await sale(c.body.saleId);
  assert.equal(s.reservation.number, r.body.number);
  assert.equal(s.balance.collected, 100000); // l'acompte compte une seule fois
  assert.equal(s.balance.amountDue, 200000);
  assert.equal(s.handoverStatus, 'NOT_HANDED'); // validée ne veut pas dire remise
  const res = (await admin.get(`/api/v1/admin/reservations/${r.body.id}`)).body;
  assert.deepEqual(res.statusChanges.map((x) => x.toStatus), ['PENDING', 'CONVERTED']);
  const conv = await prisma.stockMovement.findMany({ where: { saleId: c.body.saleId, type: 'RESERVATION_TO_SALE' }, orderBy: { createdAt: 'asc' } });
  assert.deepEqual(conv.map((m) => [m.bucket, m.quantityDelta]), [['RESERVED', -1], ['ALLOCATED', 1]]);
  // Une réservation convertie ne peut pas l'être deux fois.
  assert.equal((await P(admin, `/api/v1/admin/reservations/${r.body.id}/convert`, {})).body.error.code, 'INVALID_TRANSITION');
});

test('4. Annuler une réservation et libérer le stock', async () => {
  const p = await computer({ qty: 1 });
  const r = await P(admin, '/api/v1/admin/reservations', { locationId: store.id, items: [{ productId: p.id, quantity: 1 }] });
  // Plusieurs réservations ne dépassent jamais le disponible.
  assert.equal((await P(admin, '/api/v1/admin/reservations', { locationId: store.id, items: [{ productId: p.id, quantity: 1 }] })).body.error.code, 'STOCK_INSUFFICIENT');
  assert.equal((await P(admin, `/api/v1/admin/reservations/${r.body.id}/cancel`, { reason: 'Client a renoncé' })).status, 200);
  assert.deepEqual(pick(await lvl(p.id), ['reserved', 'available']), { reserved: 0, available: 1 });
  assert.equal((await admin.get(`/api/v1/admin/reservations/${r.body.id}`)).body.status, 'CANCELLED');
});

test('5. Valider une vente sans réservation préalable', async () => {
  const p = await computer({ qty: 2 });
  const s = await P(admin, '/api/v1/admin/sales', { channel: 'IN_STORE', locationId: store.id, items: [{ productId: p.id, quantity: 2 }] });
  assert.equal(s.status, 201);
  assert.match(s.body.number, /^V-\d{4}-\d{6}$/);
  assert.deepEqual(pick(await lvl(p.id), ['physical', 'allocated', 'available']), { physical: 2, allocated: 2, available: 0 });
  const refused = await P(admin, '/api/v1/admin/sales', { channel: 'IN_STORE', locationId: store.id, items: [{ productId: p.id, quantity: 1 }] });
  assert.equal(refused.body.error.code, 'STOCK_INSUFFICIENT');
  const d = await sale(s.body.id);
  assert.equal(d.balance.paymentStatus, 'UNPAID');
  assert.equal(d.items[0].unitPrice, 300000);
});

test('6. Vente directe en boutique : validation, paiement et remise tracés séparément', async () => {
  const p = await computer({ qty: 2, serialized: true });
  const sn = await prisma.productSerialNumber.findFirst({ where: { productId: p.id } });
  const s = await P(admin, '/api/v1/admin/sales', {
    channel: 'IN_STORE', locationId: store.id, items: [{ productId: p.id, quantity: 1, discountAmount: 10000 }],
    payment: { amount: 290000, methodCode: 'CASH' }, handover: { mode: 'now', receivedByName: 'Client Six', serials: { [p.id]: [sn.id] } },
  });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  const d = await sale(s.body.id);
  assert.equal(d.total, 290000);
  assert.equal(d.balance.paymentStatus, 'PAID');
  assert.equal(d.handoverStatus, 'HANDED');
  assert.equal(d.statusChanges.length, 1);
  assert.equal(d.payments.length, 1);
  assert.deepEqual(d.fulfillments[0].events.map((e) => e.toStatus), ['PREPARING', 'COMPLETED']);
  assert.deepEqual(pick(await lvl(p.id), ['physical', 'allocated']), { physical: 1, allocated: 0 });
  const serial = await prisma.productSerialNumber.findUnique({ where: { id: sn.id } });
  assert.equal(serial.status, 'DELIVERED');
  assert.ok(serial.warrantyEndsAt > new Date());
  // Un appareil suivi ne sort pas sans son numéro de série.
  const missing = await P(admin, '/api/v1/admin/sales', { channel: 'IN_STORE', locationId: store.id, items: [{ productId: p.id, quantity: 1 }], handover: { mode: 'now', receivedByName: 'X Y' } });
  assert.equal(missing.body.error.code, 'SERIALS_REQUIRED');
  assert.equal((await lvl(p.id)).allocated, 0); // tout a été annulé (transaction)
});

test('7. Valider une vente avec retrait différé', async () => {
  const p = await computer({ qty: 1 });
  const s = await P(admin, '/api/v1/admin/sales', { channel: 'IN_STORE', locationId: store.id, items: [{ productId: p.id, quantity: 1 }], payment: { amount: 300000, methodCode: 'BANK_TRANSFER' } });
  assert.deepEqual(pick(await lvl(p.id), ['physical', 'allocated']), { physical: 1, allocated: 1 });
  const d = await sale(s.body.id);
  assert.equal(d.balance.paymentStatus, 'PAID');
  assert.equal(d.handoverStatus, 'NOT_HANDED'); // payée ne veut pas dire remise
  const f = await P(admin, `/api/v1/admin/sales/${s.body.id}/fulfillments`, { mode: 'PICKUP' });
  await P(admin, `/api/v1/admin/fulfillments/${f.body.id}/ready`);
  const noName = await P(admin, `/api/v1/admin/fulfillments/${f.body.id}/complete`, {});
  assert.equal(noName.status, 400);
  assert.equal((await P(admin, `/api/v1/admin/fulfillments/${f.body.id}/complete`, { receivedByName: 'Frère du client' })).status, 200);
  assert.deepEqual(pick(await lvl(p.id), ['physical', 'allocated']), { physical: 0, allocated: 0 });
  assert.equal((await sale(s.body.id)).handoverStatus, 'HANDED');
});

async function deliverySale(p, qty = 1, payment = 100000) {
  return P(admin, '/api/v1/admin/sales', {
    channel: 'DELIVERY', locationId: store.id, items: [{ productId: p.id, quantity: qty }], deliveryFee: 5000,
    payment: { amount: payment, methodCode: 'MOBILE_MONEY' },
    handover: { mode: 'delivery', delivery: { recipientName: 'Client Huit', recipientPhone: '+22997000008', address: 'Rue 12', city: 'Abomey-Calavi', district: 'Zogbadjè' } },
  });
}

test('8. Effectuer une livraison avec paiement partiel', async () => {
  const p = await computer({ qty: 1 });
  const s = await deliverySale(p);
  assert.equal(s.status, 201, JSON.stringify(s.body));
  let d = await sale(s.body.id);
  assert.equal(d.total, 305000);
  assert.equal(d.balance.amountDue, 205000);
  const f = d.fulfillments[0];
  assert.equal(f.status, 'PREPARING');
  assert.equal((await P(admin, `/api/v1/admin/fulfillments/${f.id}/dispatch`, { courierName: 'Livreur A' })).status, 200);
  assert.deepEqual(pick(await lvl(p.id), ['physical', 'allocated']), { physical: 0, allocated: 0 });
  assert.deepEqual(pick(await lvl(p.id, transit.id), ['physical', 'allocated']), { physical: 1, allocated: 1 });
  d = await sale(s.body.id);
  assert.equal(d.balance.paymentStatus, 'PARTIALLY_PAID'); // indépendant de la livraison
});

test('9. Confirmer une livraison', async () => {
  const p = await computer({ qty: 1 });
  const s = await deliverySale(p, 1, 305000);
  const f = (await sale(s.body.id)).fulfillments[0];
  await P(admin, `/api/v1/admin/fulfillments/${f.id}/dispatch`, {});
  const ok = await P(admin, `/api/v1/admin/fulfillments/${f.id}/complete`, { receivedByName: 'Client Huit', proofNote: 'Signature sur le bon' });
  assert.equal(ok.status, 200);
  assert.deepEqual(pick(await lvl(p.id, transit.id), ['physical', 'allocated']), { physical: 0, allocated: 0 });
  const d = await sale(s.body.id);
  assert.equal(d.handoverStatus, 'HANDED');
  assert.deepEqual(d.fulfillments[0].events.map((e) => e.toStatus), ['PREPARING', 'IN_TRANSIT', 'COMPLETED']);
  assert.equal(d.fulfillments[0].receivedByName, 'Client Huit');
});

test('10. Enregistrer un échec de livraison', async () => {
  const p = await computer({ qty: 1 });
  const s = await deliverySale(p);
  const f = (await sale(s.body.id)).fulfillments[0];
  await P(admin, `/api/v1/admin/fulfillments/${f.id}/dispatch`, {});
  assert.equal((await P(admin, `/api/v1/admin/fulfillments/${f.id}/fail`, { note: 'Client injoignable' })).status, 200);
  assert.equal((await lvl(p.id, transit.id)).physical, 1); // toujours en transit
  assert.equal((await P(admin, `/api/v1/admin/fulfillments/${f.id}/return-to-store`, {})).status, 200);
  assert.deepEqual(pick(await lvl(p.id), ['physical', 'allocated', 'available']), { physical: 1, allocated: 1, available: 0 });
  assert.equal((await lvl(p.id, transit.id)).physical, 0);
  // Une nouvelle livraison peut être créée pour la même vente.
  const again = await P(admin, `/api/v1/admin/sales/${s.body.id}/fulfillments`, { mode: 'DELIVERY', delivery: { recipientName: 'Client Huit', recipientPhone: '+22997000008', address: 'Rue 12', city: 'Abomey-Calavi' } });
  assert.equal(again.status, 201);
});

test('11. Effectuer une remise partielle', async () => {
  const p = await computer({ qty: 3 });
  const s = await P(admin, '/api/v1/admin/sales', { channel: 'IN_STORE', locationId: store.id, items: [{ productId: p.id, quantity: 3 }] });
  const item = (await sale(s.body.id)).items[0];
  const f1 = await P(admin, `/api/v1/admin/sales/${s.body.id}/fulfillments`, { mode: 'PICKUP', items: [{ saleItemId: item.id, quantity: 2 }] });
  const tooMuch = await P(admin, `/api/v1/admin/sales/${s.body.id}/fulfillments`, { mode: 'PICKUP', items: [{ saleItemId: item.id, quantity: 2 }] });
  assert.equal(tooMuch.body.error.code, 'QUANTITY_UNAVAILABLE');
  await P(admin, `/api/v1/admin/fulfillments/${f1.body.id}/complete`, { receivedByName: 'Client Onze' });
  let d = await sale(s.body.id);
  assert.equal(d.handoverStatus, 'PARTIAL');
  assert.deepEqual(pick(d.items[0], ['quantityHandedOver', 'quantityAllocated']), { quantityHandedOver: 2, quantityAllocated: 1 });
  assert.deepEqual(pick(await lvl(p.id), ['physical', 'allocated']), { physical: 1, allocated: 1 });
  const f2 = await P(admin, `/api/v1/admin/sales/${s.body.id}/fulfillments`, { mode: 'PICKUP' });
  await P(admin, `/api/v1/admin/fulfillments/${f2.body.id}/complete`, { receivedByName: 'Client Onze' });
  d = await sale(s.body.id);
  assert.equal(d.handoverStatus, 'HANDED');
});

test('12. Enregistrer un retour et un remboursement', async () => {
  const p = await computer({ qty: 1 });
  const s = await P(admin, '/api/v1/admin/sales', { channel: 'IN_STORE', locationId: store.id, items: [{ productId: p.id, quantity: 1 }], payment: { amount: 300000, methodCode: 'CASH' }, handover: { mode: 'now', receivedByName: 'Client Douze' } });
  const d = await sale(s.body.id);
  // Le remboursement seul ne touche pas au stock.
  const ret = await P(admin, `/api/v1/admin/sales/${s.body.id}/returns`, { reason: 'DEFECTIVE', locationId: store.id, notes: 'Ne démarre pas', items: [{ saleItemId: d.items[0].id, quantity: 1, condition: 'QUARANTINE' }] });
  assert.equal(ret.status, 201);
  assert.deepEqual(pick(await lvl(p.id), ['physical', 'quarantine', 'available']), { physical: 0, quarantine: 1, available: 0 });
  const over = await P(admin, `/api/v1/admin/payments/${d.payments[0].id}/refunds`, { amount: 300001, methodCode: 'CASH', reason: 'Produit défectueux' });
  assert.equal(over.body.error.code, 'REFUND_EXCEEDS_PAYMENT');
  const before = await lvl(p.id);
  const refund = await P(admin, `/api/v1/admin/payments/${d.payments[0].id}/refunds`, { amount: 300000, methodCode: 'CASH', reason: 'Produit défectueux', returnId: ret.body.id });
  assert.equal(refund.status, 201);
  assert.deepEqual(await lvl(p.id), before);
  const after = await sale(s.body.id);
  assert.deepEqual(pick(after.balance, ['netTotal', 'collected', 'refunded', 'amountDue']), { netTotal: 0, collected: 300000, refunded: 300000, amountDue: 0 });
  // Un retour ne dépasse jamais ce qui a été remis.
  const again = await P(admin, `/api/v1/admin/sales/${s.body.id}/returns`, { reason: 'CUSTOMER_RETURN', locationId: store.id, items: [{ saleItemId: d.items[0].id, quantity: 1, condition: 'RESTOCKED' }] });
  assert.equal(again.body.error.code, 'RETURN_EXCEEDS_HANDOVER');
  // Contrôle terminé : retour au stock vendable par un mouvement compensatoire.
  assert.equal((await P(admin, '/api/v1/admin/stock/quarantine/release', { productId: p.id, locationId: store.id, quantity: 1, to: 'ON_HAND', reason: 'Réparé, testé' })).status, 201);
  assert.deepEqual(pick(await lvl(p.id), ['physical', 'quarantine', 'available']), { physical: 1, quarantine: 0, available: 1 });
});

// ── Garde-fous complémentaires ──────────────────────────────────────────────

test('remise : plafond du rôle appliqué par le serveur', async () => {
  const p = await computer({ qty: 1 });
  const over = await P(admin, '/api/v1/admin/sales', { channel: 'IN_STORE', locationId: store.id, items: [{ productId: p.id, quantity: 1, discountAmount: 40000 }] });
  assert.equal(over.body.error.code, 'DISCOUNT_LIMIT_EXCEEDED'); // ADMIN : 10 % de 300 000
  assert.equal((await P(superA, '/api/v1/admin/sales', { channel: 'IN_STORE', locationId: store.id, items: [{ productId: p.id, quantity: 1, discountAmount: 40000 }] })).status, 201);
  assert.equal((await P(manager, '/api/v1/admin/sales', { channel: 'IN_STORE', locationId: store.id, items: [{ productId: p.id, quantity: 1 }] })).status, 403);
});

test('prix appliqué figé : un changement de catalogue ne modifie pas la vente', async () => {
  const p = await computer({ qty: 1 });
  const s = await P(admin, '/api/v1/admin/sales', { channel: 'IN_STORE', locationId: store.id, items: [{ productId: p.id, quantity: 1 }] });
  await admin.patch(`/api/v1/admin/products/${p.id}`).send({ price: 999000 });
  assert.equal((await sale(s.body.id)).items[0].unitPrice, 300000);
});

test('paiement : pas d’encaissement au-delà du reste à payer ; annulation de saisie réservée au super administrateur', async () => {
  const p = await computer({ qty: 1 });
  const s = await P(admin, '/api/v1/admin/sales', { channel: 'IN_STORE', locationId: store.id, items: [{ productId: p.id, quantity: 1 }], payment: { amount: 100000, methodCode: 'CASH' } });
  assert.equal((await P(admin, `/api/v1/admin/sales/${s.body.id}/payments`, { amount: 200001, methodCode: 'CASH' })).body.error.code, 'OVERPAYMENT');
  const pay = (await sale(s.body.id)).payments[0];
  assert.equal((await P(admin, `/api/v1/admin/payments/${pay.id}/void`, { reason: 'Erreur de saisie' })).status, 403);
  assert.equal((await P(superA, `/api/v1/admin/payments/${pay.id}/void`, { reason: 'Erreur de saisie' })).status, 200);
  const d = await sale(s.body.id);
  assert.equal(d.balance.collected, 0);
  assert.equal(d.payments[0].status, 'VOIDED'); // la ligne reste
});

test('annulation de vente : libère le stock affecté, interdite après remise', async () => {
  const p = await computer({ qty: 2 });
  const s = await P(admin, '/api/v1/admin/sales', { channel: 'IN_STORE', locationId: store.id, items: [{ productId: p.id, quantity: 2 }] });
  assert.equal((await P(admin, `/api/v1/admin/sales/${s.body.id}/cancel`, { reason: 'Client a changé d’avis' })).status, 200);
  assert.deepEqual(pick(await lvl(p.id), ['allocated', 'available']), { allocated: 0, available: 2 });
  const s2 = await P(admin, '/api/v1/admin/sales', { channel: 'IN_STORE', locationId: store.id, items: [{ productId: p.id, quantity: 1 }], handover: { mode: 'now', receivedByName: 'Client' } });
  assert.equal((await P(admin, `/api/v1/admin/sales/${s2.body.id}/cancel`, { reason: 'Test' })).body.error.code, 'INVALID_TRANSITION');
});

test('expiration : une réservation échue libère le stock', async () => {
  const p = await computer({ qty: 1 });
  const r = await P(admin, '/api/v1/admin/reservations', { locationId: store.id, items: [{ productId: p.id, quantity: 1 }] });
  await prisma.stockReservation.update({ where: { id: r.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await sweepOnce();
  assert.equal((await admin.get(`/api/v1/admin/reservations/${r.body.id}`)).body.status, 'EXPIRED');
  assert.deepEqual(pick(await lvl(p.id), ['reserved', 'available']), { reserved: 0, available: 1 });
});

test('concurrence : 6 ventes simultanées sur 2 unités, exactement 2 passent', async () => {
  const p = await computer({ qty: 2 });
  const results = await Promise.all(Array.from({ length: 6 }, () => P(admin, '/api/v1/admin/sales', { channel: 'IN_STORE', locationId: store.id, items: [{ productId: p.id, quantity: 1 }] })));
  assert.equal(results.filter((r) => r.status === 201).length, 2);
  assert.deepEqual(pick(await lvl(p.id), ['allocated', 'available']), { allocated: 2, available: 0 });
});

test('échange : retour puis nouvelle vente liée', async () => {
  const a = await computer({ qty: 1 });
  const b = await computer({ qty: 1, price: 350000 });
  const s = await P(admin, '/api/v1/admin/sales', { channel: 'IN_STORE', locationId: store.id, items: [{ productId: a.id, quantity: 1 }], payment: { amount: 300000, methodCode: 'CASH' }, handover: { mode: 'now', receivedByName: 'Client' } });
  const item = (await sale(s.body.id)).items[0];
  const ret = await P(admin, `/api/v1/admin/sales/${s.body.id}/returns`, { reason: 'EXCHANGE', locationId: store.id, items: [{ saleItemId: item.id, quantity: 1, condition: 'RESTOCKED' }] });
  const ex = await P(admin, '/api/v1/admin/sales', { channel: 'IN_STORE', locationId: store.id, items: [{ productId: b.id, quantity: 1 }], exchangeReturnId: ret.body.id });
  assert.equal(ex.status, 201);
  const d = await sale(ex.body.id);
  assert.equal(d.exchangeReturn.number, ret.body.number);
  assert.equal((await lvl(a.id)).available, 1);
});
