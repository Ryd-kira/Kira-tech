import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toQuery } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { useAuth } from '../auth.jsx';
import { post, SerialPicker, useIdempotencyKey } from '../pickers.jsx';
import { Field, fieldErrors, Notice, PageHeader, Pager, STOCK_COLORS } from '../ui.jsx';

const KINDS = [['IN', 'Entrée (ajustement positif)'], ['OUT', 'Sortie (ajustement négatif)'], ['DAMAGE', 'Produit endommagé'], ['LOSS', 'Perte']];

function AdjustDialog({ target, locations, onClose, onDone }) {
  const ref = useRef(null);
  const [key, renewKey] = useIdempotencyKey();
  const [form, setForm] = useState({ locationId: '', kind: 'IN', quantity: 1, reason: '', serialNumbers: '', serialIds: [] });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (target && !ref.current.open) {
      setForm({ locationId: locations[0]?.id ?? '', kind: 'IN', quantity: 1, reason: '', serialNumbers: '', serialIds: [] });
      setError(null);
      ref.current.showModal();
    }
    if (!target && ref.current?.open) ref.current.close();
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!target) return <dialog ref={ref} />;
  const errs = fieldErrors(error);
  const serialized = target.isSerialized;
  const qty = Number(form.quantity) || 0;

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    const body = { productId: target.id, locationId: form.locationId, kind: form.kind, quantity: qty, reason: form.reason };
    if (serialized && form.kind === 'IN') body.serialNumbers = form.serialNumbers.split(/\n|,/).map((s) => s.trim()).filter(Boolean);
    if (serialized && form.kind !== 'IN') body.serialIds = form.serialIds;
    try { await post('/admin/stock/adjustments', body, key); renewKey(); onDone(); } catch (err) { setError(err); } finally { setBusy(false); }
  }
  return (
    <dialog ref={ref} onCancel={(e) => { e.preventDefault(); onClose(); }} className="admin rounded-[10px] border border-[#DDE3EC] p-0 w-[min(560px,94vw)] m-auto backdrop:bg-black/40">
      <form onSubmit={submit} className="p-6 flex flex-col gap-4">
        <h2 className="text-xl">Ajuster le stock</h2>
        <p className="m-0 muted text-sm">{target.name}. Toute correction est enregistrée comme un mouvement, avec son motif ; rien n'est effacé.</p>
        {error && !error.details?.some?.((d) => d.field) && <Notice kind="error">{error.message}</Notice>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Emplacement"><select className="field" value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value, serialIds: [] })}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
          <Field label="Type"><select className="field" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value, serialIds: [] })}>
            {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Quantité" error={errs.quantity}><input className="field num" inputMode="numeric" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field>
        </div>
        {serialized && form.kind === 'IN' && (
          <Field label="Numéros de série" hint="Un par ligne, autant que la quantité"><textarea className="field num !min-h-24 !py-2" value={form.serialNumbers} onChange={(e) => setForm({ ...form, serialNumbers: e.target.value })} /></Field>
        )}
        {serialized && form.kind !== 'IN' && <SerialPicker productId={target.id} locationId={form.locationId} count={qty} value={form.serialIds} onChange={(serialIds) => setForm({ ...form, serialIds })} />}
        <Field label="Motif (obligatoire)" error={errs.reason}><input className="field" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Ex. inventaire du 18/11, carton abîmé" /></Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={busy || form.reason.trim().length < 3 || qty < 1}>{busy ? 'Enregistrement…' : "Enregistrer l'ajustement"}</button>
        </div>
      </form>
    </dialog>
  );
}

export default function Stocks() {
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const f = { q: sp.get('q') ?? '', status: sp.get('status') ?? '', page: Number(sp.get('page')) || 1 };
  const { data: locs } = useApi('/admin/stock/locations');
  const { data, retry } = useApi(`/admin/stock/levels${toQuery({ ...f, limit: 50 })}`);
  const [target, setTarget] = useState(null);
  const [done, setDone] = useState(null);
  const columns = locs?.items ?? [];
  const adjustable = columns.filter((l) => l.type !== 'TRANSIT');
  const set = (k, v) => setSp((prev) => { const n = new URLSearchParams(prev); if (v) n.set(k, v); else n.delete(k); n.delete('page'); return n; }, { replace: true });

  return (
    <>
      <PageHeader title="Stocks" subtitle="Disponible = physique moins réservé moins affecté aux ventes non remises." />
      {done && <Notice kind="success">{done}</Notice>}
      <div className="flex flex-wrap gap-3 my-4">
        <label className="label flex-[2_1_240px]">Rechercher<input className="field" type="search" defaultValue={f.q} placeholder="Nom, marque ou référence"
          onKeyDown={(e) => e.key === 'Enter' && set('q', e.target.value)} onBlur={(e) => set('q', e.target.value)} /></label>
        <label className="label flex-[1_1_180px]">Niveau<select className="field" value={f.status} onChange={(e) => set('status', e.target.value)}>
          <option value="">Tous</option><option value="IN_STOCK">Disponible</option><option value="LOW_STOCK">Stock faible</option><option value="OUT_OF_STOCK">Rupture</option>
        </select></label>
      </div>
      <div className="panel overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th>Produit</th>
              {columns.map((l) => <th key={l.id} className="text-right">{l.name}<span className="block font-normal text-[12px]">dispo. / physique</span></th>)}
              <th className="text-right">Vendable</th>
              {can('stock:adjust') && <th><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {data?.items.length === 0 && <tr><td colSpan={columns.length + 3} className="muted">Aucun produit.</td></tr>}
            {data?.items.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/admin/mouvements?productId=${p.id}`} className="font-semibold">{p.name}</Link>
                  <div className="num muted text-[13px]">{p.sku}{p.isSerialized && ', suivi par n° de série'}</div>
                </td>
                {columns.map((l) => {
                  const lv = p.levels.find((x) => x.locationId === l.id);
                  return (
                    <td key={l.id} className="num text-right whitespace-nowrap">
                      {lv ? <><strong>{lv.available}</strong> / {lv.physical}</> : <span className="muted">0</span>}
                      {lv?.reserved > 0 && <div className="text-[12px] muted">{lv.reserved} réservé(s)</div>}
                      {lv?.allocated > 0 && <div className="text-[12px] muted">{lv.allocated} affecté(s)</div>}
                      {lv?.quarantine > 0 && <div className="text-[12px] text-[#8A5A00]">{lv.quarantine} en quarantaine</div>}
                      {lv?.damaged > 0 && <div className="text-[12px] text-[#B42318]">{lv.damaged} endommagé(s)</div>}
                    </td>
                  );
                })}
                <td className="num text-right font-bold" style={{ color: STOCK_COLORS[p.stockStatus] }}>{p.sellable}</td>
                {can('stock:adjust') && <td className="text-right"><button type="button" className="btn btn-ghost !min-h-9" onClick={() => setTarget(p)}>Ajuster</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
        <Pager data={data} page={f.page} onPage={(n) => setSp((prev) => { const s = new URLSearchParams(prev); s.set('page', n); return s; })} />
      </div>
      <AdjustDialog target={target} locations={adjustable} onClose={() => setTarget(null)}
        onDone={() => { setDone(`Ajustement enregistré pour ${target.name}.`); setTarget(null); retry(); }} />
    </>
  );
}
