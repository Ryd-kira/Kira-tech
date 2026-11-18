// Tests des invariants garantis par PostgreSQL (indépendants du code applicatif).
// Lancer sur une base de test vide migrée : node --test tests/
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
let admin, product, store, transit, method;

const rejects = (p, re) => assert.rejects(p, (e) => re.test(String(e.message)));

// Réservation atomique : la condition de disponibilité et l'incrément sont dans
// la même instruction UPDATE. Deux requêtes simultanées ne peuvent pas réussir
// toutes les deux sur la dernière unité.
async function reserve(productId, locationId, qty) {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      UPDATE stock_levels SET reserved = reserved + ${qty}, "updatedAt" = now()
      WHERE "productId" = ${productId}::uuid AND "locationId" = ${locationId}::uuid
        AND "onHand" - reserved - allocated >= ${qty}
      RETURNING reserved`;
    if (rows.length === 0) throw new Error('STOCK_INSUFFICIENT');
    return rows[0];
  });
}

before(async () => {
  admin = await db.adminUser.create({
    data: { name: 'Test', email: `t${Date.now()}@test.local`, passwordHash: 'x', role: 'SUPER_ADMIN' },
  });
  const cat = await db.category.create({ data: { name: `Cat ${Date.now()}`, slug: `cat-${Date.now()}` } });
  product = await db.product.create({
    data: { slug: `p-${Date.now()}`, sku: `SKU-${Date.now()}`, name: 'PC test', brand: 'X',
      description: 'd', condition: 'NEW', price: 300000, categoryId: cat.id },
  });
  store = await db.stockLocation.create({ data: { code: `S${Date.now()}`, name: 'Boutique', type: 'STORE' } });
  transit = await db.stockLocation.create({
    data: { code: `T${Date.now()}`, name: 'En transit', type: 'TRANSIT', isSellable: false },
  });
  method = await db.paymentMethod.create({ data: { code: `CASH${Date.now()}`, label: 'Espèces' } });
  await db.stockLevel.create({ data: { productId: product.id, locationId: store.id, onHand: 1 } });
});

after(() => db.$disconnect());

test('deux réservations simultanées sur la dernière unité : une seule réussit', async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () => reserve(product.id, store.id, 1)),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const lvl = await db.stockLevel.findUnique({
    where: { productId_locationId: { productId: product.id, locationId: store.id } },
  });
  assert.equal(lvl.reserved, 1);
});

test('la base refuse reserved + allocated > onHand même sans le code applicatif', async () => {
  await rejects(
    db.stockLevel.update({
      where: { productId_locationId: { productId: product.id, locationId: store.id } },
      data: { allocated: 1 },
    }),
    /stock_levels_blocked_le_on_hand/,
  );
});

test('conversion réservation -> vente : pas de double comptage', async () => {
  await db.$executeRaw`
    UPDATE stock_levels SET reserved = reserved - 1, allocated = allocated + 1
    WHERE "productId" = ${product.id}::uuid AND "locationId" = ${store.id}::uuid`;
  const [row] = await db.$queryRaw`
    SELECT physical, reserved, allocated, available FROM stock_availability
    WHERE "productId" = ${product.id}::uuid AND "locationId" = ${store.id}::uuid`;
  assert.deepEqual(
    { ...row },
    { physical: 1, reserved: 0, allocated: 1, available: 0 },
  );
  const [st] = await db.$queryRaw`
    SELECT "stockStatus", "availabilityLabel" FROM product_stock_status WHERE "productId" = ${product.id}::uuid`;
  assert.equal(st.stockStatus, 'OUT_OF_STOCK');
});

test('mouvement de stock : arithmétique vérifiée, ni modification ni suppression', async () => {
  const base = {
    operationId: '0190a1b2-0000-7000-8000-000000000001', type: 'ADJUSTMENT_IN',
    productId: product.id, locationId: store.id, bucket: 'ON_HAND', adminUserId: admin.id,
  };
  await rejects(
    db.stockMovement.create({ data: { ...base, quantityBefore: 1, quantityDelta: 2, quantityAfter: 4 } }),
    /stock_movements_arithmetic/,
  );
  const mv = await db.stockMovement.create({
    data: { ...base, quantityBefore: 1, quantityDelta: 2, quantityAfter: 3 },
  });
  await rejects(db.stockMovement.update({ where: { id: mv.id }, data: { reason: 'x' } }), /KTS_IMMUTABLE/);
  await rejects(db.stockMovement.delete({ where: { id: mv.id } }), /KTS_IMMUTABLE/);
  await rejects(db.$executeRawUnsafe('TRUNCATE stock_movements CASCADE'), /KTS_IMMUTABLE/);
});

test('vente : montants cohérents, conditions figées, suppression impossible', async () => {
  const data = {
    number: `V-${Date.now()}`, channel: 'IN_STORE', locationId: store.id,
    subtotal: 300000, discountTotal: 10000, validatedById: admin.id,
  };
  await rejects(db.sale.create({ data: { ...data, total: 300000 } }), /sales_amounts/);
  await rejects(
    db.sale.create({ data: { ...data, number: data.number + 'b', deliveryFee: 2000, total: 292000 } }),
    /sales_delivery_fee_channel/,
  );
  const sale = await db.sale.create({ data: { ...data, total: 290000 } });
  await rejects(db.sale.update({ where: { id: sale.id }, data: { total: 1, subtotal: 11000 } }), /KTS_IMMUTABLE/);
  await rejects(db.sale.delete({ where: { id: sale.id } }), /KTS_IMMUTABLE/);
  // Annulation motivée autorisée, une seule fois.
  await db.sale.update({
    where: { id: sale.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'test' },
  });
  await rejects(db.sale.update({ where: { id: sale.id }, data: { notes: 'x' } }), /vente annulée/);
});

test('paiement : acompte puis solde, statut calculé, montant non modifiable', async () => {
  const sale = await db.sale.create({
    data: { number: `V2-${Date.now()}`, channel: 'IN_STORE', locationId: store.id,
      subtotal: 300000, total: 300000, validatedById: admin.id },
  });
  const p1 = await db.payment.create({
    data: { reference: `P-${Date.now()}`, saleId: sale.id, amount: 100000, paymentMethodId: method.id,
      receivedAt: new Date(), recordedById: admin.id },
  });
  let [b] = await db.$queryRaw`SELECT "amountDue", "paymentStatus" FROM sale_balance WHERE "saleId" = ${sale.id}::uuid`;
  assert.deepEqual({ ...b }, { amountDue: 200000, paymentStatus: 'PARTIALLY_PAID' });

  await rejects(db.payment.update({ where: { id: p1.id }, data: { amount: 300000 } }), /KTS_IMMUTABLE/);
  await rejects(db.payment.delete({ where: { id: p1.id } }), /KTS_IMMUTABLE/);
  await rejects(
    db.payment.update({ where: { id: p1.id }, data: { status: 'VOIDED' } }),
    /payments_void_consistency/,
  );

  await db.payment.create({
    data: { reference: `P2-${Date.now()}`, saleId: sale.id, amount: 200000, paymentMethodId: method.id,
      receivedAt: new Date(), recordedById: admin.id },
  });
  [b] = await db.$queryRaw`SELECT "amountDue", "paymentStatus" FROM sale_balance WHERE "saleId" = ${sale.id}::uuid`;
  assert.deepEqual({ ...b }, { amountDue: 0, paymentStatus: 'PAID' });
});

test('historique de statut : exactement une entité visée', async () => {
  await rejects(
    db.statusChange.create({ data: { toStatus: 'X', adminUserId: admin.id } }),
    /status_changes_one_target/,
  );
});

test('livraison : adresse obligatoire, preuve obligatoire pour clore', async () => {
  const sale = await db.sale.create({
    data: { number: `V3-${Date.now()}`, channel: 'DELIVERY', locationId: store.id,
      subtotal: 100000, deliveryFee: 2000, total: 102000, validatedById: admin.id },
  });
  const base = { saleId: sale.id, mode: 'DELIVERY', locationId: store.id, createdById: admin.id };
  await rejects(
    db.saleFulfillment.create({ data: { ...base, number: `F-${Date.now()}` } }),
    /fulfillments_delivery_fields/,
  );
  const f = await db.saleFulfillment.create({
    data: { ...base, number: `F2-${Date.now()}`, recipientPhone: '+22900000000', address: 'A', city: 'Calavi' },
  });
  await rejects(
    db.saleFulfillment.update({ where: { id: f.id }, data: { status: 'COMPLETED', completedAt: new Date() } }),
    /fulfillments_completion_proof/,
  );
});
