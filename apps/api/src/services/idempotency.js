import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

const KEY_RE = /^[A-Za-z0-9_-]{16,100}$/;

/**
 * Exécute une opération commerciale une seule fois par Idempotency-Key.
 * La clé est insérée en premier DANS la transaction de l'opération :
 * - un double clic concurrent attend le premier, puis rejoue sa réponse ;
 * - si l'opération échoue, la clé disparaît avec le rollback et l'on peut réessayer.
 * fn(tx) renvoie { status, body }.
 */
export async function runIdempotent(req, endpoint, fn) {
  const key = req.get('idempotency-key');
  if (!key || !KEY_RE.test(key)) {
    throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'En-tête Idempotency-Key manquant ou invalide.');
  }
  const adminUserId = req.admin.id;
  const requestHash = createHash('sha256').update(JSON.stringify(req.body ?? null)).digest('hex');

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.idempotencyKey.create({ data: { adminUserId, key, endpoint, requestHash } });
      const result = await fn(tx);
      await tx.idempotencyKey.update({
        where: { adminUserId_key: { adminUserId, key } },
        data: { responseStatus: result.status, responseBody: result.body },
      });
      return result;
    }, { timeout: 15_000 });
  } catch (err) {
    // Seul un doublon sur la clé d'idempotence elle-même signifie « requête déjà reçue ».
    const onKey = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && err.meta?.modelName === 'IdempotencyKey';
    if (!onKey) throw err;
    const prior = await prisma.idempotencyKey.findUnique({ where: { adminUserId_key: { adminUserId, key } } });
    if (!prior || prior.responseStatus == null) {
      throw new AppError(409, 'REQUEST_IN_PROGRESS', 'Cette opération est déjà en cours.');
    }
    if (prior.endpoint !== endpoint || prior.requestHash !== requestHash) {
      throw new AppError(422, 'IDEMPOTENCY_KEY_REUSED', 'Cette clé a déjà servi pour une autre requête.');
    }
    return { status: prior.responseStatus, body: prior.responseBody, replayed: true };
  }
}
