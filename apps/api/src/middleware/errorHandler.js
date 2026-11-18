import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function notFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route introuvable.', requestId: req.id } });
}

// Le client reçoit un code et un message ; le détail technique reste dans les logs.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let status = 500;
  let body = { code: 'INTERNAL_ERROR', message: 'Une erreur inattendue est survenue.' };

  if (err instanceof AppError) {
    status = err.status;
    body = { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) };
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    body = { code: 'MALFORMED_JSON', message: 'Requête mal formée.' };
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    body = { code: 'PAYLOAD_TOO_LARGE', message: 'Requête trop volumineuse.' };
  } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    status = 409;
    body = { code: 'ALREADY_EXISTS', message: 'Cet élément existe déjà.' };
  } else if (String(err?.message).includes('KTS_IMMUTABLE')) {
    // Filet de sécurité : un trigger a refusé de modifier l'historique.
    status = 409;
    body = { code: 'IMMUTABLE_RECORD', message: 'Cet enregistrement ne peut plus être modifié.' };
  }

  if (status >= 500) logger.error({ err, requestId: req.id }, 'erreur serveur');
  else logger.info({ code: body.code, requestId: req.id }, 'requête refusée');

  res.status(status).json({ error: { ...body, requestId: req.id } });
}
