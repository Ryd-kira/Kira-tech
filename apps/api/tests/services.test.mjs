import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { makeAdmin, prisma } from './helpers.mjs';
import { runIdempotent } from '../src/services/idempotency.js';
import { nextNumber } from '../src/services/numbering.js';

after(() => prisma.$disconnect());

const fakeReq = (admin, key, body) => ({ admin, body, get: (h) => (h === 'idempotency-key' ? key : undefined) });

test('double clic simultané : une seule exécution, même réponse rejouée', async () => {
  const admin = await makeAdmin();
  const key = randomUUID();
  let executions = 0;
  const op = () => runIdempotent(fakeReq(admin, key, { a: 1 }), 'POST /test', async (tx) => {
    executions += 1;
    const number = await nextNumber(tx, 'SALE');
    await new Promise((r) => setTimeout(r, 100));
    return { status: 201, body: { number } };
  });
  const [r1, r2] = await Promise.all([op(), op()]);
  assert.equal(executions, 1);
  assert.equal(r1.body.number, r2.body.number);
  assert.equal([r1, r2].filter((r) => r.replayed).length, 1);
});

test('même clé, autre contenu : refusé', async () => {
  const admin = await makeAdmin();
  const key = randomUUID();
  await runIdempotent(fakeReq(admin, key, { a: 1 }), 'POST /test', async () => ({ status: 201, body: {} }));
  await assert.rejects(
    runIdempotent(fakeReq(admin, key, { a: 2 }), 'POST /test', async () => ({ status: 201, body: {} })),
    (e) => e.code === 'IDEMPOTENCY_KEY_REUSED',
  );
});

test('opération en échec : la clé est libérée et la nouvelle tentative passe', async () => {
  const admin = await makeAdmin();
  const key = randomUUID();
  await assert.rejects(runIdempotent(fakeReq(admin, key, {}), 'POST /test', async () => { throw new Error('échec'); }));
  const ok = await runIdempotent(fakeReq(admin, key, {}), 'POST /test', async () => ({ status: 201, body: { ok: true } }));
  assert.deepEqual(ok.body, { ok: true });
});

test('numérotation : 20 numéros simultanés, tous distincts et consécutifs', async () => {
  const numbers = await Promise.all(
    Array.from({ length: 20 }, () => prisma.$transaction((tx) => nextNumber(tx, 'PAYMENT'))),
  );
  const values = numbers.map((n) => Number(n.split('-')[2])).sort((a, b) => a - b);
  assert.equal(new Set(values).size, 20);
  assert.equal(values.at(-1) - values[0], 19);
  assert.match(numbers[0], /^P-\d{4}-\d{6}$/);
});
