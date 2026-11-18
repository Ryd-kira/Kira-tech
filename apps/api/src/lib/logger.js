import pino from 'pino';
import { env } from '../config/env.js';

// Masquage à la source : mots de passe, cookies et jetons n'atteignent jamais les logs.
export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]',
      '*.password', '*.newPassword', '*.currentPassword', '*.token', '*.passwordHash',
    ],
    censor: '[masqué]',
  },
});
