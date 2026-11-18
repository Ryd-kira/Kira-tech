import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { expireReservations } from '../services/commerce.js';

const LOCK_KEY = 4207011; // verrou consultatif : une seule instance exécute le balayage
const EVERY_MS = 5 * 60_000;

export async function sweepOnce() {
  return prisma.$transaction(async (tx) => {
    const [{ locked }] = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${LOCK_KEY}) AS locked`;
    if (!locked) return 0;
    return expireReservations(tx);
  });
}

// Non lancé en production (Vercel, serverless) : chaque création de réservation ou de vente
// libère d'abord les réservations échues des produits concernés. Utilisable à la main ou par un cron.
export function startReservationSweeper() {
  const run = () => sweepOnce().then((n) => n && logger.info({ expired: n }, 'réservations expirées libérées')).catch((err) => logger.error({ err }, 'balayage des réservations'));
  run();
  return setInterval(run, EVERY_MS).unref();
}
