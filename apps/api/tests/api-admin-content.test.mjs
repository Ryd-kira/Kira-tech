import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loginAs, makeAdmin, prisma } from './helpers.mjs';
import { sign, uploadSignature } from '../src/lib/cloudinary.js';

let superA, admin, manager, cat;
const tag = randomUUID().slice(0, 6);
const base = () => ({ name: `PC ${tag} ${randomUUID().slice(0, 4)}`, sku: `T-${randomUUID().slice(0, 8)}`, brand: 'HP', categoryId: cat.id, condition: 'NEW' });

before(async () => {
  superA = await loginAs(await makeAdmin({ role: 'SUPER_ADMIN' }));
  admin = await loginAs(await makeAdmin({ role: 'ADMIN' }));
  manager = await loginAs(await makeAdmin({ role: 'GESTIONNAIRE' }));
  cat = await prisma.category.findUniqueOrThrow({ where: { slug: 'ordinateurs-portables' } });
});
after(() => prisma.$disconnect());

test('ADMIN crée un produit avec prix ; changement de prix journalisé', async () => {
  const res = await admin.post('/api/v1/admin/products').send({ ...base(), price: 300000, usageSlugs: ['programmation'] });
  assert.equal(res.status, 201);
  assert.equal(res.body.status, 'DRAFT');
  assert.equal(res.body.showPrice, true);
  assert.deepEqual(res.body.usages.map((u) => u.slug), ['programmation']);
  const upd = await admin.patch(`/api/v1/admin/products/${res.body.id}`).send({ price: 280000, showPrice: false });
  assert.equal(upd.status, 200);
  const log = await prisma.auditLog.findFirst({ where: { entityId: res.body.id, action: 'product.price.update' } });
  assert.deepEqual(log.oldValues, { price: 300000, showPrice: true });
  assert.deepEqual(log.newValues, { price: 280000, showPrice: false });
});

test('GESTIONNAIRE : produits oui, prix non (contrôlé par le serveur)', async () => {
  const blocked = await manager.post('/api/v1/admin/products').send({ ...base(), price: 1 });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error.code, 'FORBIDDEN_FIELD');
  const ok = await manager.post('/api/v1/admin/products').send(base());
  assert.equal(ok.status, 201);
  assert.equal(ok.body.price, 0);
  assert.equal(ok.body.showPrice, false);
  assert.equal('averageCost' in ok.body, false); // pas d'accès aux coûts
  const upd = await manager.patch(`/api/v1/admin/products/${ok.body.id}`).send({ showPrice: true });
  assert.equal(upd.status, 403);
  const cats = await manager.post('/api/v1/admin/categories').send({ name: `X ${tag}` });
  assert.equal(cats.status, 403);
});

test('champ non prévu refusé (ex. coût moyen, slug)', async () => {
  const res = await admin.post('/api/v1/admin/products').send({ ...base(), averageCost: 1 });
  assert.equal(res.status, 400);
  const p = await admin.post('/api/v1/admin/products').send(base());
  const slug = await admin.patch(`/api/v1/admin/products/${p.body.id}`).send({ slug: 'pirate' });
  assert.equal(slug.status, 400);
});

test('suppression : possible sans historique, refusée avec historique', async () => {
  const fresh = await admin.post('/api/v1/admin/products').send(base());
  assert.equal((await admin.del(`/api/v1/admin/products/${fresh.body.id}`)).status, 204);
  const used = await admin.post('/api/v1/admin/products').send(base());
  const store = await prisma.stockLocation.findUniqueOrThrow({ where: { code: 'COTONOU' } });
  await prisma.stockLevel.create({ data: { productId: used.body.id, locationId: store.id, onHand: 1 } });
  const res = await admin.del(`/api/v1/admin/products/${used.body.id}`);
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'PRODUCT_HAS_HISTORY');
});

test('slug : stable après publication, unique', async () => {
  const name = `Même nom ${tag}`;
  const a = await admin.post('/api/v1/admin/products').send({ ...base(), name });
  const b = await admin.post('/api/v1/admin/products').send({ ...base(), name });
  assert.notEqual(a.body.slug, b.body.slug);
  await admin.patch(`/api/v1/admin/products/${a.body.id}`).send({ status: 'PUBLISHED' });
  const renamed = await admin.patch(`/api/v1/admin/products/${a.body.id}`).send({ name: `Nouveau nom ${tag}` });
  assert.equal(renamed.body.slug, a.body.slug);
});

test('paramètres : ADMIN modifie le contenu, pas le numéro WhatsApp', async () => {
  const content = await admin.patch('/api/v1/admin/settings').send({ openingHours: 'Lun-Sam 8h-19h' });
  assert.equal(content.status, 200);
  const sensitive = await admin.patch('/api/v1/admin/settings').send({ whatsappNumber: '+22990000000' });
  assert.equal(sensitive.status, 403);
  const bad = await superA.patch('/api/v1/admin/settings').send({ whatsappNumber: '0190000000' });
  assert.equal(bad.status, 400);
  const ok = await superA.patch('/api/v1/admin/settings').send({ whatsappNumber: '+22990000000' });
  assert.equal(ok.status, 200);
  await superA.patch('/api/v1/admin/settings').send({ whatsappNumber: null, openingHours: null });
  assert.equal((await manager.get('/api/v1/admin/settings')).status, 403);
});

test('contenu du site : textes, boutiques et prestations saisis depuis l’administration', async () => {
  const about = await admin.patch('/api/v1/admin/settings').send({ aboutText: 'Premier paragraphe.\r\n\r\nSecond paragraphe.   ', servicesIntro: 'Intro services' });
  assert.equal(about.status, 200);
  assert.equal(about.body.aboutText, 'Premier paragraphe.\n\nSecond paragraphe.');
  assert.equal((await admin.patch('/api/v1/admin/settings').send({ facebookUrl: 'javascript:alert(1)' })).status, 400);
  assert.equal((await admin.patch('/api/v1/admin/settings').send({ facebookUrl: 'http://facebook.com/x' })).status, 400);
  assert.equal((await admin.patch('/api/v1/admin/settings').send({ facebookUrl: 'https://facebook.com/x' })).status, 200);

  const loc = await prisma.stockLocation.findUniqueOrThrow({ where: { code: 'CALAVI' } });
  const l = await admin.patch(`/api/v1/admin/settings/locations/${loc.id}`).send({ phone: '+229 01 00 00 00', openingHours: 'Lundi au samedi' });
  assert.equal(l.status, 200);

  const created = await admin.post('/api/v1/admin/settings/services').send({ title: `Réparation ${tag}`, description: 'Diagnostic et remplacement de pièces.', icon: 'WRENCH', sortOrder: 1 });
  assert.equal(created.status, 201);
  assert.equal((await admin.post('/api/v1/admin/settings/services').send({ title: 'x', description: 'ok ok' })).status, 400);
  assert.equal((await admin.post('/api/v1/admin/settings/services').send({ title: 'Valide', description: 'ok ok', isAdmin: true })).status, 400);
  assert.equal((await manager.post('/api/v1/admin/settings/services').send({ title: 'Valide', description: 'ok ok' })).status, 403);
  const hidden = await admin.post('/api/v1/admin/settings/services').send({ title: `Caché ${tag}`, description: 'Non affiché.', isActive: false });

  const pub = await admin.get('/api/v1/public/settings');
  assert.equal(pub.body.aboutText, 'Premier paragraphe.\n\nSecond paragraphe.');
  assert.equal(pub.body.servicesIntro, 'Intro services');
  const calavi = pub.body.stores.find((s) => s.code === 'CALAVI');
  assert.equal(calavi.phone, '+229 01 00 00 00');
  assert.equal(calavi.openingHours, 'Lundi au samedi');
  const titles = pub.body.services.map((s) => s.title);
  assert.ok(titles.includes(`Réparation ${tag}`));
  assert.ok(!titles.includes(`Caché ${tag}`));
  assert.ok(!('id' in pub.body.services[0]));

  assert.equal((await admin.patch(`/api/v1/admin/settings/services/${created.body.id}`).send({ isActive: false })).status, 200);
  assert.equal((await admin.del(`/api/v1/admin/settings/services/${created.body.id}`)).status, 204);
  assert.equal((await admin.del(`/api/v1/admin/settings/services/${hidden.body.id}`)).status, 204);
  assert.ok(await prisma.auditLog.findFirst({ where: { entityId: created.body.id, action: 'service.delete' } }));
  await admin.patch('/api/v1/admin/settings').send({ aboutText: null, servicesIntro: null, facebookUrl: null });
  await admin.patch(`/api/v1/admin/settings/locations/${loc.id}`).send({ phone: null, openingHours: null });
});

test('photos : refus clair sans Cloudinary configuré ; fichier étranger refusé', async () => {
  const p = await admin.post('/api/v1/admin/products').send(base());
  const sig = await admin.post(`/api/v1/admin/products/${p.body.id}/images/signature`).send({});
  assert.equal(sig.status, 503);
  assert.equal(sig.body.error.code, 'CLOUDINARY_NOT_CONFIGURED');
  process.env.CLOUDINARY_CLOUD_NAME = 'demo'; process.env.CLOUDINARY_API_KEY = 'k'; process.env.CLOUDINARY_API_SECRET = 's';
  try {
    const foreign = await admin.post(`/api/v1/admin/products/${p.body.id}/images`).send({ publicId: 'autre/dossier/x', version: 1, format: 'jpg', width: 10, height: 10 });
    assert.equal(foreign.status, 400);
    const pid = `kira-tech/products/${randomUUID().slice(0, 8)}`;
    const ok = await admin.post(`/api/v1/admin/products/${p.body.id}/images`).send({ publicId: pid, version: 1, format: 'jpg', width: 10, height: 10 });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.url, `https://res.cloudinary.com/demo/image/upload/v1/${pid}.jpg`);
    // Le même fichier ne peut pas être rattaché deux fois.
    const dup = await admin.post(`/api/v1/admin/products/${p.body.id}/images`).send({ publicId: pid, version: 1, format: 'jpg', width: 10, height: 10 });
    assert.equal(dup.status, 409);
    // Une photo ne peut pas être supprimée via un autre produit.
    const other = await admin.post('/api/v1/admin/products').send(base());
    assert.equal((await admin.del(`/api/v1/admin/products/${other.body.id}/images/${ok.body.id}`)).status, 404);
  } finally {
    delete process.env.CLOUDINARY_CLOUD_NAME; delete process.env.CLOUDINARY_API_KEY; delete process.env.CLOUDINARY_API_SECRET;
  }
});

test('signature Cloudinary : algorithme documenté', () => {
  // Exemple de la documentation Cloudinary : public_id=sample_image&timestamp=1315060510 + secret abcd
  assert.equal(sign({ public_id: 'sample_image', timestamp: 1315060510 }, 'abcd'), 'b4ad47fb4e25c7bf5f92a20089f9db59bc302313');
  const s = uploadSignature({ cloudName: 'c', apiKey: 'k', apiSecret: 'abcd' }, 1_700_000_000_000);
  assert.equal(s.params.folder, 'kira-tech/products');
  assert.equal(s.params.signature, sign({ folder: s.params.folder, timestamp: s.params.timestamp, allowed_formats: s.params.allowed_formats }, 'abcd'));
  assert.equal(JSON.stringify(s).includes('abcd'), false);
});

test('messages : réservés à qui les traite', async () => {
  const msg = await prisma.contactMessage.create({ data: { name: 'C', phone: '+22900', subject: 'S', message: 'Message de test' } });
  assert.equal((await manager.get('/api/v1/admin/messages')).status, 403);
  const res = await admin.patch(`/api/v1/admin/messages/${msg.id}`).send({ status: 'HANDLED' });
  assert.equal(res.status, 200);
  assert.ok(res.body.handledAt);
});
