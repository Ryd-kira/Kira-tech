// Dates en heure du Bénin (UTC+1).
export const todayBj = () => new Date(Date.now() + 3600_000).toISOString().slice(0, 10);
const shift = (iso, days) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

export function presetRange(preset) {
  const t = todayBj();
  if (preset === 'today') return { from: t, to: t };
  if (preset === '7d') return { from: shift(t, -6), to: t };
  if (preset === '30d') return { from: shift(t, -29), to: t };
  if (preset === 'month') return { from: `${t.slice(0, 8)}01`, to: t };
  if (preset === 'lastMonth') {
    const firstThis = new Date(`${t.slice(0, 8)}01T00:00:00Z`);
    const last = shift(firstThis.toISOString().slice(0, 10), -1);
    return { from: `${last.slice(0, 8)}01`, to: last };
  }
  return null;
}
export const PRESETS = [['today', "Aujourd'hui"], ['7d', '7 derniers jours'], ['30d', '30 derniers jours'], ['month', 'Ce mois-ci'], ['lastMonth', 'Mois précédent'], ['custom', 'Personnalisée']];
