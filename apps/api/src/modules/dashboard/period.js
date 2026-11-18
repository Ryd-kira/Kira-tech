import { z } from 'zod';

// Les journées commencent à minuit heure du Bénin (UTC+1, sans heure d'été).
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue AAAA-MM-JJ');
export const periodQuery = {
  from: day.optional(),
  to: day.optional(),
  locationId: z.uuid().optional(),
};

export function resolvePeriod({ from, to }) {
  const today = new Date(Date.now() + 3600_000).toISOString().slice(0, 10);
  const f = from ?? `${today.slice(0, 8)}01`; // par défaut : le mois en cours
  const t = to ?? today;
  const start = new Date(`${f}T00:00:00+01:00`);
  const end = new Date(new Date(`${t}T00:00:00+01:00`).getTime() + 86_400_000);
  if (end <= start) throw Object.assign(new Error('Période invalide'), { status: 400 });
  if (end - start > 400 * 86_400_000) throw Object.assign(new Error('Période limitée à 400 jours'), { status: 400 });
  return { from: f, to: t, start, end };
}
