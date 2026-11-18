import { z } from 'zod';

// Toute la configuration passe par ici : l'API refuse de démarrer si une variable manque.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  // Origines autorisées (site public + administration), séparées par des virgules.
  CORS_ORIGINS: z.string().min(1),
  // URL publique du site, utilisée pour les liens de réinitialisation.
  APP_URL: z.url(),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  // Nombre de proxys devant l'API (Render : 1), pour lire la vraie IP cliente.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Noms des variables seulement, jamais leurs valeurs.
  const names = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
  throw new Error(`Configuration invalide : ${names}`);
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
};
