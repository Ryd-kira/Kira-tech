import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, loginAs, makeAdmin, ORIGIN, PASSWORD, prisma, uniqueEmail } from './helpers.mjs';

after(() => prisma.$disconnect());

test('health vérifie la base', async () => {
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok' });
});

test('route admin sans session : 401, refus par défaut', async () => {
  const res = await request(app).get('/api/v1/admin/users');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHENTICATED');
});

test('route inconnue sous /admin : 401 avant 404 (aucune découverte de routes)', async () => {
  const res = await request(app).get('/api/v1/admin/inexistant');
  assert.equal(res.status, 401);
});

test('mauvais mot de passe et e-mail inconnu : réponse identique', async () => {
  const user = await makeAdmin();
  const a = await request(app).post('/api/v1/admin/auth/login').set('Origin', ORIGIN).send({ email: user.email, password: 'mauvais-mot-de-passe' });
  const b = await request(app).post('/api/v1/admin/auth/login').set('Origin', ORIGIN).send({ email: uniqueEmail('ghost'), password: 'mauvais-mot-de-passe' });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(a.body.error.message, b.body.error.message);
  const logs = await prisma.auditLog.count({ where: { action: 'auth.login.failed', adminUserId: user.id } });
  assert.equal(logs, 1);
});

test('connexion : cookie HttpOnly, aucune empreinte de mot de passe renvoyée', async () => {
  const user = await makeAdmin({ role: 'GESTIONNAIRE' });
  const { res, get } = await loginAs(user);
  const cookie = res.headers['set-cookie'][0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.equal(JSON.stringify(res.body).includes('passwordHash'), false);
  const me = await get('/api/v1/admin/auth/me');
  assert.equal(me.status, 200);
  assert.ok(me.body.permissions.includes('stock:adjust'));
  assert.equal(me.body.permissions.includes('sales:write'), false);
});

test("écriture sans en-tête Origin autorisé : refusée (CSRF)", async () => {
  const user = await makeAdmin({ role: 'SUPER_ADMIN' });
  const { agent } = await loginAs(user);
  const res = await agent.post('/api/v1/admin/users').set('Origin', 'https://attaquant.example').send({});
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'ORIGIN_REJECTED');
});

test('5 échecs de connexion puis 429', async () => {
  const user = await makeAdmin();
  for (let i = 0; i < 5; i++) {
    await request(app).post('/api/v1/admin/auth/login').set('Origin', ORIGIN).send({ email: user.email, password: 'faux-mot-de-passe' });
  }
  const res = await request(app).post('/api/v1/admin/auth/login').set('Origin', ORIGIN).send({ email: user.email, password: PASSWORD });
  assert.equal(res.status, 429);
});

test('GESTIONNAIRE et ADMIN ne gèrent pas les comptes', async () => {
  for (const role of ['GESTIONNAIRE', 'ADMIN']) {
    const { get } = await loginAs(await makeAdmin({ role }));
    const res = await get('/api/v1/admin/users');
    assert.equal(res.status, 403, role);
  }
});

test('création de compte : champ non prévu refusé (affectation de masse)', async () => {
  const { post } = await loginAs(await makeAdmin({ role: 'SUPER_ADMIN' }));
  const res = await post('/api/v1/admin/users').send({
    name: 'Nouvel admin', email: uniqueEmail('n'), role: 'ADMIN', temporaryPassword: PASSWORD, isActive: false,
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('nouveau compte : changement de mot de passe obligatoire avant tout accès', async () => {
  const { post } = await loginAs(await makeAdmin({ role: 'SUPER_ADMIN' }));
  const email = uniqueEmail('new');
  const created = await post('/api/v1/admin/users').send({ name: 'Nouvel admin', email, role: 'ADMIN', temporaryPassword: PASSWORD });
  assert.equal(created.status, 201);
  assert.equal(created.body.mustChangePassword, true);

  const newbie = await loginAs({ email });
  const blocked = await newbie.get('/api/v1/admin/users');
  assert.equal(blocked.body.error.code, 'PASSWORD_CHANGE_REQUIRED');
  const changed = await newbie.post('/api/v1/admin/auth/password').send({ currentPassword: PASSWORD, newPassword: 'Nouveau-mot-de-passe-2026' });
  assert.equal(changed.status, 204);
  const after = await newbie.get('/api/v1/admin/users');
  assert.equal(after.status, 403); // un ADMIN n'a pas users:manage
});

test('désactivation : la session du compte tombe immédiatement', async () => {
  const boss = await loginAs(await makeAdmin({ role: 'SUPER_ADMIN' }));
  const target = await makeAdmin({ role: 'ADMIN' });
  const victim = await loginAs(target);
  assert.equal((await victim.get('/api/v1/admin/auth/me')).status, 200);
  const res = await boss.post(`/api/v1/admin/users/${target.id}/deactivate`).send({ reason: 'Départ' });
  assert.equal(res.status, 200);
  assert.equal((await victim.get('/api/v1/admin/auth/me')).status, 401);
});

test('le dernier SUPER_ADMIN actif ne peut pas être rétrogradé', async () => {
  // Isoler : désactiver directement les autres SUPER_ADMIN créés par les tests.
  const solo = await makeAdmin({ role: 'SUPER_ADMIN' });
  await prisma.adminUser.updateMany({ where: { role: 'SUPER_ADMIN', NOT: { id: solo.id } }, data: { isActive: false } });
  const { patch } = await loginAs(solo);
  const res = await patch(`/api/v1/admin/users/${solo.id}`).send({ role: 'ADMIN' });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'LAST_SUPER_ADMIN');
});

test('lien de réinitialisation : usage unique, anciennes sessions fermées', async () => {
  const boss = await makeAdmin({ role: 'SUPER_ADMIN' });
  const bossSession = await loginAs(boss);
  const target = await makeAdmin({ role: 'ADMIN' });
  const old = await loginAs(target);

  const link = await bossSession.post(`/api/v1/admin/users/${target.id}/reset-link`).send({});
  assert.equal(link.status, 201);
  const token = link.body.url.split('#')[1];
  const body = { token, newPassword: 'Reinitialise-2026-ok' };

  const first = await request(app).post('/api/v1/admin/auth/reset').set('Origin', ORIGIN).send(body);
  assert.equal(first.status, 204);
  const second = await request(app).post('/api/v1/admin/auth/reset').set('Origin', ORIGIN).send(body);
  assert.equal(second.status, 400);
  assert.equal((await old.get('/api/v1/admin/auth/me')).status, 401);
  await loginAs(target, 'Reinitialise-2026-ok');
});
