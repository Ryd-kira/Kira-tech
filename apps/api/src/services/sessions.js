import { createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

// Jeton opaque dans le cookie ; seule son empreinte est en base (une fuite de la base
// ne donne aucune session utilisable).
export const COOKIE_NAME = env.isProd ? '__Host-kts_session' : 'kts_session';
const TTL_MS = env.SESSION_TTL_HOURS * 3600_000;
const REFRESH_EVERY_MS = 5 * 60_000;

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export function cookieOptions() {
  return { httpOnly: true, secure: env.isProd, sameSite: 'lax', path: '/', maxAge: TTL_MS };
}

export async function createSession(adminUserId, { ip, userAgent }) {
  const token = randomBytes(32).toString('base64url');
  await prisma.adminSession.create({
    data: {
      adminUserId, tokenHash: hashToken(token), ip, userAgent: userAgent?.slice(0, 300),
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });
  return token;
}

// Charge la session ET l'utilisateur à chaque requête : rôle et statut actif viennent
// toujours de la base, jamais d'une valeur mise en cache côté client.
export async function resolveSession(token) {
  if (!token) return null;
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { adminUser: true },
  });
  const now = Date.now();
  if (!session || session.revokedAt || session.expiresAt.getTime() <= now || !session.adminUser.isActive) {
    return null;
  }
  if (now - session.lastSeenAt.getTime() > REFRESH_EVERY_MS) {
    await prisma.adminSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(now), expiresAt: new Date(now + TTL_MS) },
    });
  }
  return session;
}

export function revokeSession(id) {
  return prisma.adminSession.update({ where: { id }, data: { revokedAt: new Date() } });
}

export function revokeAllSessions(adminUserId, client = prisma) {
  return client.adminSession.updateMany({
    where: { adminUserId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
