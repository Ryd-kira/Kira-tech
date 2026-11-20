import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { app, ORIGIN, loginAs, makeAdmin, prisma } from './helpers.mjs';
import { overridesFor } from '../src/auth/permissions.js';

let superA, admin, manager;
const tag = randomUUID().slice(0, 6).toUpperCase();

before(async () => {
  await prisma.rolePermission.deleteMany({});
  superA = await loginAs(await makeAdmin({ role: 'SUPER_ADMIN' }));
  admin = await loginAs(await makeAdmin({ role: 'ADMIN' }));
  manager = await loginAs(await makeAdmin({ role: 'GESTIONNAIRE' }));
});
after(async () => {
  await prisma.rolePermission.deleteMany({});
  await prisma.$disconnect();
});

const me = async (who) => (await who.get('/api/v1/admin/auth/me')).body.permissions;

test('rôles : seul le super administrateur consulte et modifie les permissions', async () => {
  assert.equal((await admin.get('/api/v1/admin/roles')).status, 403);
  const res = await superA.get('/api/v1/admin/roles');
  assert.equal(res.status, 200);
  assert.equal(res.body.roles.SUPER_ADMIN.editable, false);
  assert.ok(res.body.catalog.find((p) => p.code === 'users:manage').locked);
  assert.equal((await superA.put('/api/v1/admin/roles/SUPER_ADMIN').send({ permissions: [] })).status, 400);
});

test('rôles : accorder puis retirer une permission au gestionnaire prend effet tout de suite', async () => {
  assert.equal((await manager.get('/api/v1/admin/customers')).status, 403);
  const current = (await superA.get('/api/v1/admin/roles')).body.roles.GESTIONNAIRE.permissions;
  const granted = await superA.put('/api/v1/admin/roles/GESTIONNAIRE').send({ permissions: [...current, 'customers:write'] });
  assert.equal(granted.status, 200);
  assert.ok(granted.body.roles.GESTIONNAIRE.permissions.includes('customers:write'));
  assert.ok((await me(manager)).includes('customers:write'));
  assert.equal((await manager.get('/api/v1/admin/customers')).status, 200);

  // Retrait d'une permission par défaut : stockée comme écart « granted = false ».
  const reduced = await superA.put('/api/v1/admin/roles/GESTIONNAIRE').send({ permissions: current.filter((p) => p !== 'stock:adjust') });
  assert.equal(reduced.status, 200);
  assert.equal((await me(manager)).includes('stock:adjust'), false);
  const rows = await prisma.rolePermission.findMany({ where: { role: 'GESTIONNAIRE' } });
  assert.deepEqual(rows.map((r) => [r.permission, r.granted]), [['stock:adjust', false]]);
  const log = await prisma.auditLog.findFirst({ where: { action: 'role.permissions.update', entityId: 'GESTIONNAIRE' }, orderBy: { createdAt: 'desc' } });
  assert.deepEqual(log.newValues.removed, ['customers:write', 'stock:adjust']);

  // Retour aux valeurs par défaut : plus aucun écart.
  await superA.put('/api/v1/admin/roles/GESTIONNAIRE').send({ permissions: current });
  assert.equal(await prisma.rolePermission.count({ where: { role: 'GESTIONNAIRE' } }), 0);
});

test('rôles : gestion des comptes et des rôles jamais déléguée', async () => {
  const res = await superA.put('/api/v1/admin/roles/ADMIN').send({ permissions: ['users:manage'] });
  assert.equal(res.status, 400);
  assert.deepEqual(overridesFor('ADMIN', ['roles:manage']).some((r) => r.permission === 'roles:manage'), false);
});

test('boutiques : création, désactivation et suppression réservées au super administrateur', async () => {
  const body = { code: `T_${tag}`, name: `Boutique ${tag}`, type: 'STORE', city: 'Porto-Novo', phone: '+229 01 00 00 00' };
  assert.equal((await admin.post('/api/v1/admin/settings/locations').send(body)).status, 403);
  const created = await superA.post('/api/v1/admin/settings/locations').send(body);
  assert.equal(created.status, 201);
  assert.equal(created.body.phone, '+229 01 00 00 00');
  assert.equal((await admin.patch(`/api/v1/admin/settings/locations/${created.body.id}`).send({ isActive: false })).status, 403);
  assert.equal((await admin.patch(`/api/v1/admin/settings/locations/${created.body.id}`).send({ address: 'Rue 1' })).status, 200);
  assert.equal((await admin.del(`/api/v1/admin/settings/locations/${created.body.id}`)).status, 403);
  assert.equal((await superA.del(`/api/v1/admin/settings/locations/${created.body.id}`)).status, 204);
  assert.equal(await prisma.stockLocation.count({ where: { id: created.body.id } }), 0);
});

test('boutiques : une boutique avec historique ne se supprime pas', async () => {
  const cotonou = await prisma.stockLocation.findUniqueOrThrow({ where: { code: 'COTONOU' } });
  const hasHistory = await prisma.stockMovement.count({ where: { locationId: cotonou.id } });
  const res = await superA.del(`/api/v1/admin/settings/locations/${cotonou.id}`);
  assert.equal(res.status, 409);
  assert.ok(['LOCATION_HAS_HISTORY', 'LOCATION_HAS_STOCK'].includes(res.body.error.code), `${res.body.error.code} (${hasHistory} mouvements)`);
  assert.ok(await prisma.stockLocation.findUnique({ where: { id: cotonou.id } }));
  const transit = await prisma.stockLocation.findFirstOrThrow({ where: { type: 'TRANSIT' } });
  assert.equal((await superA.del(`/api/v1/admin/settings/locations/${transit.id}`)).status, 409);
});

test('logos : réservés au super administrateur ; fichier étranger refusé', async () => {
  const loc = await prisma.stockLocation.findUniqueOrThrow({ where: { code: 'CALAVI' } });
  assert.equal((await admin.put('/api/v1/admin/settings/branding/chain-logo').send({ image: null })).status, 403);
  assert.equal((await admin.put(`/api/v1/admin/settings/locations/${loc.id}/logo`).send({ image: null })).status, 403);
  const foreign = { publicId: 'kira-tech/products/x', version: 1, format: 'png', width: 10, height: 10 };
  assert.equal((await superA.put('/api/v1/admin/settings/branding/chain-logo').send({ image: foreign })).status, 400);
  const cleared = await superA.put('/api/v1/admin/settings/branding/chain-logo').send({ image: null });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.chainLogoUrl, null);
  assert.equal((await superA.put(`/api/v1/admin/settings/locations/${loc.id}/logo`).send({ image: null })).status, 200);
  // Sans compte Cloudinary : message clair plutôt qu'une erreur technique.
  const sig = await superA.post('/api/v1/admin/settings/branding/signature').send({ purpose: 'logo' });
  assert.equal(sig.status, process.env.CLOUDINARY_API_SECRET ? 200 : 503);
});

test('bannière et accueil : enregistrés par ADMIN, visibles sur le site seulement une fois activés', async () => {
  const pub = () => request(app).get('/api/v1/public/settings').set('Origin', ORIGIN);
  await admin.patch('/api/v1/admin/settings').send({ bannerEnabled: false, bannerTitle: null, bannerCtaLabel: null, bannerCtaUrl: null, homeLayout: 'CLASSIC' });
  assert.equal((await pub()).body.banner, null);

  const noTitle = await admin.patch('/api/v1/admin/settings').send({ bannerEnabled: true });
  assert.equal(noTitle.status, 400);
  assert.equal(noTitle.body.error.details[0].field, 'bannerTitle');
  const halfCta = await admin.patch('/api/v1/admin/settings').send({ bannerCtaLabel: 'Voir' });
  assert.equal(halfCta.status, 400);
  const badLink = await admin.patch('/api/v1/admin/settings').send({ bannerCtaLabel: 'Voir', bannerCtaUrl: 'javascript:alert(1)' });
  assert.equal(badLink.status, 400);

  const ok = await admin.patch('/api/v1/admin/settings').send({
    bannerEnabled: true, bannerTitle: 'Rentrée : portables 16 Go', bannerText: 'Jusqu’au 30 novembre.', bannerCtaLabel: 'Voir les portables', bannerCtaUrl: '/catalogue?ram=16', homeLayout: 'SHOWCASE',
  });
  assert.equal(ok.status, 200);
  const view = (await pub()).body;
  assert.equal(view.homeLayout, 'SHOWCASE');
  assert.deepEqual(view.banner, { title: 'Rentrée : portables 16 Go', text: 'Jusqu’au 30 novembre.', ctaLabel: 'Voir les portables', ctaUrl: '/catalogue?ram=16', image: null });
  assert.equal((await manager.patch('/api/v1/admin/settings').send({ bannerEnabled: false })).status, 403);
  await admin.patch('/api/v1/admin/settings').send({ bannerEnabled: false, homeLayout: 'CLASSIC' });
});

test('vitrine : produits mis en avant et publiés seulement, avec un résumé', async () => {
  const res = await request(app).get('/api/v1/public/showcase').set('Origin', ORIGIN);
  assert.equal(res.status, 200);
  assert.ok(res.body.items.length <= 4);
  for (const p of res.body.items) {
    assert.equal(p.isFeatured, true);
    assert.equal(typeof p.summary, 'string');
    assert.equal(p.averageCost, undefined);
  }
});

test('clients : suppression sans historique, anonymisation sinon, réservées au super administrateur', async () => {
  const c = await admin.post('/api/v1/admin/customers').send({ name: `Client ${tag}`, phone: '+22997000000', email: 'c@example.com', city: 'Cotonou' });
  assert.equal(c.status, 201);
  assert.equal((await admin.del(`/api/v1/admin/customers/${c.body.id}`)).status, 403);
  assert.equal((await superA.del(`/api/v1/admin/customers/${c.body.id}`)).status, 204);

  // Client avec un historique : un ordinateur livré lui est rattaché (numéro de série).
  const withSale = await prisma.customer.create({ data: { name: `Historique ${tag}`, phone: '+22997000001', email: 'h@example.com', createdById: (await prisma.adminUser.findFirstOrThrow()).id } });
  const product = await prisma.product.findFirstOrThrow();
  await prisma.productSerialNumber.create({ data: { productId: product.id, serialNumber: `SN-${tag}`, status: 'DELIVERED', receivedAt: new Date(), customerId: withSale.id } });
  {
    const refused = await superA.del(`/api/v1/admin/customers/${withSale.id}`);
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error.code, 'CUSTOMER_HAS_HISTORY');
    const anon = await superA.post(`/api/v1/admin/customers/${withSale.id}/anonymize`);
    assert.equal(anon.status, 200);
    assert.equal(anon.body.name, 'Client anonymisé');
    assert.equal(anon.body.email, null);
    assert.equal(await prisma.productSerialNumber.count({ where: { customerId: withSale.id } }), 1);
    const log = await prisma.auditLog.findFirst({ where: { action: 'customer.anonymize', entityId: withSale.id } });
    assert.equal(log.oldValues, null);
  }
});

test('fournisseurs : suppression sans commande, refus sinon', async () => {
  const s = await admin.post('/api/v1/admin/suppliers').send({ name: `Fournisseur ${tag}` });
  assert.equal(s.status, 201);
  assert.equal((await admin.del(`/api/v1/admin/suppliers/${s.body.id}`)).status, 403);
  assert.equal((await superA.del(`/api/v1/admin/suppliers/${s.body.id}`)).status, 204);
  const used = await prisma.supplier.findFirst({ where: { purchases: { some: {} } } });
  if (used) assert.equal((await superA.del(`/api/v1/admin/suppliers/${used.id}`)).status, 409);
});
