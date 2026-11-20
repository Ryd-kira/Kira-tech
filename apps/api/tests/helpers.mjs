import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/lib/passwords.js';
import { prisma } from '../src/lib/prisma.js';

export const ORIGIN = 'http://localhost:5173';
export const app = createApp();
export { prisma };

export const uniqueEmail = (p = 'u') => `${p}-${randomUUID().slice(0, 8)}@test.local`;
export const PASSWORD = 'Motdepasse-solide-2026';

export async function makeAdmin({ role = 'ADMIN', mustChangePassword = false, email = uniqueEmail(role.toLowerCase()) } = {}) {
  return prisma.adminUser.create({
    data: { name: `Test ${role}`, email, role, passwordHash: await hashPassword(PASSWORD), mustChangePassword },
  });
}

// Agent qui conserve le cookie de session et envoie l'Origin autorisée.
export async function loginAs(user, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/admin/auth/login').set('Origin', ORIGIN).send({ email: user.email, password });
  if (res.status !== 200) throw new Error(`login ${res.status} ${JSON.stringify(res.body)}`);
  const wrap = (m) => (url) => agent[m](url).set('Origin', ORIGIN);
  return { agent, get: wrap('get'), post: wrap('post'), patch: wrap('patch'), put: wrap('put'), del: wrap('delete'), res };
}
