import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

// Protection CSRF en complément de SameSite : toute écriture doit venir d'une origine autorisée.
export function originCheck(req, res, next) {
  if (SAFE.has(req.method)) return next();
  const origin = req.get('origin');
  if (!origin || !env.corsOrigins.includes(origin)) {
    return next(new AppError(403, 'ORIGIN_REJECTED', 'Origine de la requête non autorisée.'));
  }
  next();
}
