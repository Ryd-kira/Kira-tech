import { useState } from 'react';
import { BASE, toQuery } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { useAuth } from '../auth.jsx';
import { presetRange, PRESETS } from '../period.js';
import { PageHeader } from '../ui.jsx';

export default function Reports() {
  const { can } = useAuth();
  const [preset, setPreset] = useState('month');
  const [range, setRange] = useState(presetRange('month'));
  const [locationId, setLocationId] = useState('');
  const { data: locs } = useApi('/admin/stock/locations');
  const qs = toQuery({ ...range, locationId });
  const reports = [
    ['sales', 'Ventes de la période', 'Une ligne par vente : montants, remises, encaissé, remboursé, reste à payer.', `${BASE}/admin/reports/sales.csv${qs}`, can('dashboard:commercial')],
    ['payments', 'Paiements de la période', 'Une ligne par paiement, avec son moyen et sa référence déclarée.', `${BASE}/admin/reports/payments.csv${toQuery(range)}`, can('dashboard:commercial')],
    ['stock', 'Stock valorisé (à ce jour)', 'Quantités par emplacement et valeur au coût moyen d’achat.', `${BASE}/admin/reports/stock.csv`, can('dashboard:costs')],
  ].filter((r) => r[4]);
  return (
    <div className="max-w-[900px] flex flex-col gap-4">
      <PageHeader title="Rapports" subtitle="Fichiers CSV qui s'ouvrent directement dans Excel. Chaque export est inscrit au journal d'activité." />
      <div className="panel p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-wrap gap-1.5">{PRESETS.map(([v, l]) => <button key={v} type="button" className="chip !min-h-9 !text-sm" aria-pressed={preset === v} onClick={() => { setPreset(v); if (v !== 'custom') setRange(presetRange(v)); }}>{l}</button>)}</div>
        {preset === 'custom' && <>
          <label className="label">Du<input className="field" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
          <label className="label">Au<input className="field" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
        </>}
        <label className="label">Boutique<select className="field" value={locationId} onChange={(e) => setLocationId(e.target.value)}><option value="">Toutes</option>{(locs?.items ?? []).filter((l) => l.type !== 'TRANSIT').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      </div>
      {reports.map(([key, title, text, href]) => (
        <section key={key} className="panel p-5 flex justify-between items-center gap-4 flex-wrap">
          <div><h2 className="text-lg">{title}</h2><p className="muted m-0 text-sm mt-1">{text}</p></div>
          <a className="btn btn-primary" href={href} download>Télécharger</a>
        </section>
      ))}
    </div>
  );
}
