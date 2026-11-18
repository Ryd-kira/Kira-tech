import { useMemo, useState } from 'react';
import { formatFCFA } from '../lib/format.js';

const W = 720;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 26, left: 64 };
const dayFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// Remplit les jours sans vente à 0 : un trou n'est pas une absence de donnée.
function fillDays(from, to, rows) {
  const map = new Map(rows.map((r) => [r.day, r]));
  const out = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d = new Date(d.getTime() + 86_400_000)) {
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, amount: map.get(key)?.amount ?? 0, count: map.get(key)?.count ?? 0 });
  }
  return out;
}

function niceMax(v) {
  if (v <= 0) return 100000;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v);
}
const short = (n) => (n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M` : n >= 1000 ? `${Math.round(n / 1000)} k` : String(n));

/** Une seule série (le chiffre d'affaires par jour) : pas de légende, le titre la nomme. */
export default function DailyRevenueChart({ from, to, rows }) {
  const data = useMemo(() => fillDays(from, to, rows), [from, to, rows]);
  const [hover, setHover] = useState(null);
  const [asTable, setAsTable] = useState(false);
  const max = niceMax(Math.max(...data.map((d) => d.amount)));
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const slot = iw / data.length;
  const bw = Math.max(2, Math.min(28, slot - 2)); // 2 px d'écart entre barres
  const y = (v) => PAD.top + ih - (v / max) * ih;
  const ticks = [0, 0.5, 1].map((t) => t * max);
  const labelEvery = Math.ceil(data.length / 8);
  const h = hover != null ? data[hover] : null;

  return (
    <figure className="panel p-5 m-0 flex flex-col gap-3">
      <div className="flex justify-between items-baseline gap-3 flex-wrap">
        <figcaption className="text-lg font-bold" style={{ fontStretch: '108%' }}>Chiffre d'affaires par jour</figcaption>
        <button type="button" className="bg-transparent border-0 text-[#0F5BE0] underline cursor-pointer text-sm" onClick={() => setAsTable(!asTable)}>{asTable ? 'Voir le graphique' : 'Voir en tableau'}</button>
      </div>
      {asTable ? (
        <div className="overflow-x-auto max-h-80"><table className="data">
          <thead><tr><th>Jour</th><th className="text-right">Ventes</th><th className="text-right">Montant</th></tr></thead>
          <tbody>{data.filter((d) => d.count).map((d) => <tr key={d.day}><td className="num">{dayFmt.format(new Date(`${d.day}T00:00:00Z`))}</td><td className="num text-right">{d.count}</td><td className="num text-right">{formatFCFA(d.amount)}</td></tr>)}</tbody>
        </table></div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Chiffre d'affaires par jour du ${from} au ${to}`} onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#E6EAF0" strokeWidth="1" />
                <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#4A5568" className="num">{short(t)}</text>
              </g>
            ))}
            {data.map((d, i) => {
              const x = PAD.left + i * slot + (slot - bw) / 2;
              const top = y(d.amount);
              const height = PAD.top + ih - top;
              const r = Math.min(4, bw / 2, height);
              return (
                <g key={d.day}>
                  {d.amount > 0 && <path d={`M${x},${PAD.top + ih} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${PAD.top + ih} Z`} fill="#176BFF" opacity={hover == null || hover === i ? 1 : 0.45} />}
                  {i % labelEvery === 0 && <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#4A5568">{dayFmt.format(new Date(`${d.day}T00:00:00Z`))}</text>}
                  {/* Zone de survol plus large que la barre */}
                  <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
                </g>
              );
            })}
            <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + ih} y2={PAD.top + ih} stroke="#C9D1DD" />
          </svg>
          {h && (
            <div className="absolute top-0 pointer-events-none bg-white border border-[#DDE3EC] rounded-md px-3 py-2 text-[13px] shadow-sm"
              style={{ left: `${Math.min(80, ((PAD.left + hover * slot) / W) * 100)}%` }}>
              <div className="font-semibold">{dayFmt.format(new Date(`${h.day}T00:00:00Z`))}</div>
              <div className="num">{formatFCFA(h.amount)}</div>
              <div className="num muted">{h.count} vente{h.count > 1 ? 's' : ''}</div>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
