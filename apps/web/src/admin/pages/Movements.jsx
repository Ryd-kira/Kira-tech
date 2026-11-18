import { useSearchParams } from 'react-router';
import { toQuery } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { BUCKET_LABELS, dateTime, MOVEMENT_LABELS } from '../pickers.jsx';
import { PageHeader, Pager } from '../ui.jsx';

export default function Movements() {
  const [sp, setSp] = useSearchParams();
  const f = { productId: sp.get('productId') ?? '', locationId: sp.get('locationId') ?? '', type: sp.get('type') ?? '', from: sp.get('from') ?? '', to: sp.get('to') ?? '', page: Number(sp.get('page')) || 1 };
  const { data: locs } = useApi('/admin/stock/locations');
  const { data } = useApi(`/admin/stock/movements${toQuery({ ...f, to: f.to ? `${f.to}T23:59:59` : '', limit: 50 })}`);
  const set = (k, v) => setSp((prev) => { const n = new URLSearchParams(prev); if (v) n.set(k, v); else n.delete(k); n.delete('page'); return n; }, { replace: true });
  const product = f.productId && data?.items[0]?.product;

  return (
    <>
      <PageHeader title="Mouvements de stock" subtitle="Historique complet et non modifiable. Une correction apparaît comme un nouveau mouvement." />
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        {f.productId && <div className="text-sm">Produit : <strong>{product ? product.name : '…'}</strong> <button type="button" className="bg-transparent border-0 text-[#0F5BE0] underline cursor-pointer" onClick={() => set('productId', '')}>tous les produits</button></div>}
        <label className="label">Emplacement<select className="field" value={f.locationId} onChange={(e) => set('locationId', e.target.value)}>
          <option value="">Tous</option>{locs?.items.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="label">Type<select className="field" value={f.type} onChange={(e) => set('type', e.target.value)}>
          <option value="">Tous</option>{Object.entries(MOVEMENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="label">Du<input className="field" type="date" value={f.from} onChange={(e) => set('from', e.target.value)} /></label>
        <label className="label">Au<input className="field" type="date" value={f.to} onChange={(e) => set('to', e.target.value)} /></label>
      </div>
      <div className="panel overflow-x-auto">
        <table className="data">
          <thead><tr><th>Date</th><th>Produit</th><th>Emplacement</th><th>Mouvement</th><th>Compteur</th><th className="text-right">Avant</th><th className="text-right">Variation</th><th className="text-right">Après</th><th>Par</th><th>Motif / document</th></tr></thead>
          <tbody>
            {data?.items.length === 0 && <tr><td colSpan={10} className="muted">Aucun mouvement.</td></tr>}
            {data?.items.map((m) => (
              <tr key={m.id}>
                <td className="num whitespace-nowrap">{dateTime.format(new Date(m.createdAt))}</td>
                <td>{m.product.name}{m.serialNumber && <div className="num muted text-[12px]">n° {m.serialNumber.serialNumber}</div>}</td>
                <td>{m.location.name}</td>
                <td>{MOVEMENT_LABELS[m.type] ?? m.type}</td>
                <td className="muted">{BUCKET_LABELS[m.bucket]}</td>
                <td className="num text-right">{m.quantityBefore}</td>
                <td className={`num text-right font-semibold ${m.quantityDelta > 0 ? 'text-[#0B7A47]' : 'text-[#B42318]'}`}>{m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}</td>
                <td className="num text-right">{m.quantityAfter}</td>
                <td>{m.adminUser.name}</td>
                <td className="text-[13px]">{[...new Set([m.reason, m.transfer?.number, m.receipt?.number, m.documentRef].filter(Boolean))].join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager data={data} page={f.page} onPage={(n) => setSp((prev) => { const s = new URLSearchParams(prev); s.set('page', n); return s; })} />
      </div>
    </>
  );
}
