import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { formatFCFA } from '../../lib/format.js';
import { useApi } from '../../lib/useApi.js';
import { useAuth } from '../auth.jsx';
import { dateOnly, dateTime, post, ProductPicker, useIdempotencyKey } from '../pickers.jsx';
import { ConfirmDialog, Field, fieldErrors, Notice, PageHeader, Pager } from '../ui.jsx';

export const PURCHASE_STATUS = { ORDERED: 'Commandé', PARTIALLY_RECEIVED: 'Partiellement reçu', RECEIVED: 'Reçu', CANCELLED: 'Annulé' };
const n = (v) => Number(String(v).replace(/\s/g, '')) || 0;

export function PurchaseList() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const { data } = useApi(`/admin/purchases?limit=30&page=${page}${status ? `&status=${status}` : ''}`);
  const costs = can('dashboard:costs');
  return (
    <div className="max-w-[1100px] flex flex-col gap-4">
      <PageHeader title="Achats et approvisionnements" subtitle="Le stock n'augmente qu'à la réception effective des marchandises."
        actions={can('purchases:write') && <Link className="btn btn-primary" to="/admin/achats/nouveau">Nouvel achat</Link>} />
      <label className="label max-w-[240px]">Statut<select className="field" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
        <option value="">Tous</option>{Object.entries(PURCHASE_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <div className="panel overflow-x-auto">
        <table className="data">
          <thead><tr><th>Numéro</th><th>Date</th><th>Fournisseur</th><th>Réception à</th><th>Progression</th>{costs && <th className="text-right">Montant</th>}<th>Statut</th></tr></thead>
          <tbody>
            {data?.items.length === 0 && <tr><td colSpan={7} className="muted">Aucun achat.</td></tr>}
            {data?.items.map((p) => {
              const ordered = p.items.reduce((s, i) => s + i.quantityOrdered, 0);
              const received = p.items.reduce((s, i) => s + i.quantityReceived, 0);
              return (
                <tr key={p.id}>
                  <td><Link to={`/admin/achats/${p.id}`} className="num font-semibold">{p.number}</Link>{p.supplierReference && <div className="muted text-[12px]">{p.supplierReference}</div>}</td>
                  <td className="num">{dateOnly.format(new Date(p.purchaseDate))}</td>
                  <td>{p.supplier.name}</td>
                  <td>{p.location.name}</td>
                  <td className="num">{received} / {ordered}</td>
                  {costs && <td className="num text-right whitespace-nowrap">{formatFCFA(p.totalAmount)}</td>}
                  <td>{PURCHASE_STATUS[p.status]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pager data={data} page={page} onPage={setPage} />
      </div>
    </div>
  );
}

export function NewPurchase() {
  const navigate = useNavigate();
  const [key, renewKey] = useIdempotencyKey();
  const { data: suppliers } = useApi('/admin/suppliers');
  const { data: locs } = useApi('/admin/stock/locations');
  const [form, setForm] = useState({ supplierId: '', locationId: '', supplierReference: '', purchaseDate: new Date().toISOString().slice(0, 10), additionalCosts: '0', notes: '' });
  const [lines, setLines] = useState([]);
  const [error, setError] = useState(null);
  const errs = fieldErrors(error);
  const stores = (locs?.items ?? []).filter((l) => l.type !== 'TRANSIT');
  const itemsTotal = lines.reduce((s, l) => s + n(l.quantity) * n(l.unitCost), 0);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    try {
      const r = await post('/admin/purchases', {
        supplierId: form.supplierId, locationId: form.locationId || stores[0]?.id, purchaseDate: form.purchaseDate,
        supplierReference: form.supplierReference || undefined, notes: form.notes || undefined, additionalCosts: n(form.additionalCosts),
        items: lines.map((l) => ({ productId: l.product.id, quantityOrdered: n(l.quantity), unitCost: n(l.unitCost) })),
      }, key);
      renewKey(); navigate(`/admin/achats/${r.id}`);
    } catch (err) { setError(err); }
  }
  const setLine = (i, k) => (e) => setLines(lines.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)));
  return (
    <form onSubmit={submit} className="max-w-[1000px] flex flex-col gap-4">
      <PageHeader title="Nouvel achat" subtitle="Enregistrez la commande ; le stock augmentera à chaque réception." />
      {error && !error.details?.some?.((d) => d.field) && <Notice kind="error">{error.message}</Notice>}
      <section className="panel p-5 grid gap-3 sm:grid-cols-2">
        <Field label="Fournisseur" error={errs.supplierId} hint={suppliers?.items.length === 0 ? 'Créez d’abord un fournisseur.' : undefined}>
          <select className="field" value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} required>
            <option value="">Choisir…</option>{suppliers?.items.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Réception prévue à"><select className="field" value={form.locationId || stores[0]?.id || ''} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>{stores.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        <Field label="Date d'achat"><input className="field" type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} /></Field>
        <Field label="Référence du document fournisseur"><input className="field" value={form.supplierReference} onChange={(e) => setForm({ ...form, supplierReference: e.target.value })} placeholder="N° de facture ou de bon" /></Field>
      </section>
      <section className="panel p-5 flex flex-col gap-3">
        <h2 className="text-lg">Produits</h2>
        <ProductPicker label="Ajouter un produit" onPick={(p) => !lines.some((l) => l.product.id === p.id) && setLines([...lines, { product: p, quantity: '1', unitCost: '' }])} />
        {lines.length > 0 && (
          <table className="data">
            <thead><tr><th>Produit</th><th className="text-right">Quantité</th><th className="text-right">Prix d'achat unitaire (FCFA)</th><th className="text-right">Total</th><th /></tr></thead>
            <tbody>{lines.map((l, i) => (
              <tr key={l.product.id}>
                <td>{l.product.name}</td>
                <td className="text-right"><input className="field num !w-24 text-right" inputMode="numeric" aria-label={`Quantité de ${l.product.name}`} value={l.quantity} onChange={setLine(i, 'quantity')} /></td>
                <td className="text-right"><input className="field num !w-36 text-right" inputMode="numeric" aria-label={`Prix d'achat de ${l.product.name}`} value={l.unitCost} onChange={setLine(i, 'unitCost')} /></td>
                <td className="num text-right whitespace-nowrap">{formatFCFA(n(l.quantity) * n(l.unitCost))}</td>
                <td className="text-right"><button type="button" className="btn btn-ghost !min-h-9" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Retirer</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <div className="grid gap-3 sm:grid-cols-2 items-end">
          <Field label="Frais supplémentaires (transport, douane…)" hint="Répartis sur le coût des produits au prorata de leur valeur.">
            <input className="field num" inputMode="numeric" value={form.additionalCosts} onChange={(e) => setForm({ ...form, additionalCosts: e.target.value })} />
          </Field>
          <dl className="num m-0 text-right">
            <div>Produits : {formatFCFA(itemsTotal)}</div>
            <div className="text-xl font-bold mt-1" style={{ fontStretch: '112%' }}>Total : {formatFCFA(itemsTotal + n(form.additionalCosts))}</div>
          </dl>
        </div>
      </section>
      <Field label="Notes"><input className="field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      <div className="flex gap-2"><button type="submit" className="btn btn-primary" disabled={!lines.length || !form.supplierId}>Enregistrer l'achat</button><Link className="btn btn-ghost" to="/admin/achats">Annuler</Link></div>
    </form>
  );
}

export function PurchaseDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const { data: p, retry, error: loadError } = useApi(`/admin/purchases/${id}`);
  const { data: locs } = useApi('/admin/stock/locations');
  const [key, renewKey] = useIdempotencyKey();
  const [qty, setQty] = useState({});
  const [sns, setSns] = useState({});
  const [locationId, setLocationId] = useState('');
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [reason, setReason] = useState('');
  if (loadError) return <Notice kind="error">{loadError.message}</Notice>;
  if (!p) return <p className="muted">Chargement…</p>;
  const costs = can('dashboard:costs');
  const open = ['ORDERED', 'PARTIALLY_RECEIVED'].includes(p.status);
  const lines = p.items.filter((i) => n(qty[i.id]) > 0);

  async function receive(e) {
    e.preventDefault();
    setError(null); setDone(null);
    try {
      const r = await post(`/admin/purchases/${id}/receipts`, {
        locationId: locationId || undefined,
        items: lines.map((i) => ({ purchaseItemId: i.id, quantity: n(qty[i.id]), ...(i.product.isSerialized ? { serialNumbers: (sns[i.id] ?? '').split(/\n|,/).map((s) => s.trim()).filter(Boolean) } : {}) })),
      }, key);
      renewKey(); setQty({}); setSns({}); setDone(`Réception ${r.number} enregistrée : le stock est à jour.`); retry();
    } catch (err) { setError(err); }
  }
  async function finish(kind) {
    if (reason.trim().length < 3) return;
    setDialog(null); setError(null);
    try { await post(`/admin/purchases/${id}/${kind}`, { reason }, key); renewKey(); retry(); } catch (err) { setError(err); }
  }

  return (
    <div className="max-w-[1100px] flex flex-col gap-4">
      <PageHeader title={`Achat ${p.number}`} subtitle={`${p.supplier.name}, ${dateOnly.format(new Date(p.purchaseDate))}, ${PURCHASE_STATUS[p.status].toLowerCase()}${p.supplierReference ? `, document ${p.supplierReference}` : ''}`}
        actions={can('purchases:write') && <>
          {p.status === 'ORDERED' && <button type="button" className="btn btn-danger" onClick={() => { setReason(''); setDialog('cancel'); }}>Annuler l'achat</button>}
          {p.status === 'PARTIALLY_RECEIVED' && <button type="button" className="btn btn-ghost" onClick={() => { setReason(''); setDialog('close'); }}>Clôturer le reliquat</button>}
        </>} />
      {done && <Notice kind="success">{done}</Notice>}
      {error && <Notice kind="error">{error.message}</Notice>}
      <form onSubmit={receive} className="panel overflow-x-auto">
        <table className="data">
          <thead><tr><th>Produit</th><th className="text-right">Commandé</th><th className="text-right">Reçu</th>{costs && <th className="text-right">Coût unitaire</th>}{costs && <th className="text-right">Coût rendu</th>}{open && <th>À réceptionner maintenant</th>}</tr></thead>
          <tbody>{p.items.map((i) => {
            const remaining = i.quantityOrdered - i.quantityReceived;
            return (
              <tr key={i.id}>
                <td>{i.product.name}<div className="num muted text-[13px]">{i.product.sku}{i.product.isSerialized && ', suivi par n° de série'}</div></td>
                <td className="num text-right">{i.quantityOrdered}</td>
                <td className="num text-right">{i.quantityReceived}</td>
                {costs && <td className="num text-right whitespace-nowrap">{formatFCFA(i.unitCost)}</td>}
                {costs && <td className="num text-right whitespace-nowrap" title="Frais inclus">{formatFCFA(Math.round(i.landedUnitCost))}</td>}
                {open && (
                  <td>
                    {remaining > 0 ? (
                      <div className="flex flex-col gap-2">
                        <input className="field num !w-24" inputMode="numeric" placeholder={`max ${remaining}`} aria-label={`Quantité reçue de ${i.product.name}`} value={qty[i.id] ?? ''} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} />
                        {i.product.isSerialized && n(qty[i.id]) > 0 && (
                          <textarea className="field num !min-h-20 !py-2 text-[13px]" aria-label={`Numéros de série de ${i.product.name}`} placeholder={`${n(qty[i.id])} numéro(s) de série, un par ligne`} value={sns[i.id] ?? ''} onChange={(e) => setSns({ ...sns, [i.id]: e.target.value })} />
                        )}
                      </div>
                    ) : <span className="muted">Complet</span>}
                  </td>
                )}
              </tr>
            );
          })}</tbody>
        </table>
        {open && can('purchases:receive') && (
          <div className="p-4 flex gap-3 items-end flex-wrap border-t border-[#EEF1F5]">
            <Field label="Réceptionné à"><select className="field" value={locationId || p.location.id} onChange={(e) => setLocationId(e.target.value)}>
              {(locs?.items ?? []).filter((l) => l.type !== 'TRANSIT').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
            <button type="submit" className="btn btn-primary" disabled={!lines.length}>Enregistrer la réception</button>
          </div>
        )}
      </form>
      {costs && <p className="m-0 num text-sm muted">Produits {formatFCFA(p.itemsTotal)}, frais {formatFCFA(p.additionalCosts)}, total {formatFCFA(p.totalAmount)}.</p>}
      {p.receipts.length > 0 && (
        <section className="panel p-5">
          <h2 className="text-lg mb-2">Réceptions</h2>
          <ul className="m-0 pl-5 text-sm flex flex-col gap-1">
            {p.receipts.map((r) => (
              <li key={r.id}><span className="num font-semibold">{r.number}</span>, {dateTime.format(new Date(r.receivedAt))}, à {r.location.name}, par {r.receivedBy.name} : {r.items.reduce((s, i) => s + i.quantity, 0)} article(s)
                {r.items.some((i) => i.serialNumbers.length) && <span className="num muted"> ({r.items.flatMap((i) => i.serialNumbers.map((s) => s.serialNumber)).join(', ')})</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="panel p-5">
        <h2 className="text-lg mb-2">Historique</h2>
        <ol className="m-0 pl-5 text-sm flex flex-col gap-1">
          {p.statusChanges.map((s) => <li key={s.id}><span className="num">{dateTime.format(new Date(s.createdAt))}</span> : {PURCHASE_STATUS[s.toStatus]} par {s.adminUser.name}{s.reason ? ` (${s.reason})` : ''}</li>)}
        </ol>
      </section>
      <Link to="/admin/achats">Tous les achats</Link>
      <ConfirmDialog open={!!dialog} title={dialog === 'cancel' ? `Annuler l'achat ${p.number} ?` : `Clôturer l'achat ${p.number} ?`}
        confirmLabel={dialog === 'cancel' ? "Annuler l'achat" : 'Clôturer le reliquat'} onCancel={() => setDialog(null)} onConfirm={() => finish(dialog)}>
        <p className="m-0 mb-3">{dialog === 'cancel' ? 'Rien n’a été reçu : aucun stock ne bouge.' : 'Les quantités non reçues ne seront plus attendues.'}</p>
        <Field label="Motif (obligatoire)"><input className="field" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </ConfirmDialog>
    </div>
  );
}
