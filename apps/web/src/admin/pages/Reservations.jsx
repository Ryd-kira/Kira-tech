import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { formatFCFA } from '../../lib/format.js';
import { useApi } from '../../lib/useApi.js';
import { useAuth } from '../auth.jsx';
import { customerPayload, CustomerPicker, MethodChips, RES_STATUS } from '../commerce.jsx';
import { dateTime, post, ProductPicker, useIdempotencyKey } from '../pickers.jsx';
import { ConfirmDialog, Field, Notice, PageHeader, Pager } from '../ui.jsx';

const n = (v) => Number(String(v ?? '').replace(/\s/g, '')) || 0;

export function ReservationList() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('active');
  const { data } = useApi(`/admin/reservations?limit=30&page=${page}${status === 'active' ? '&active=1' : status ? `&status=${status}` : ''}`);
  return (
    <div className="max-w-[1100px] flex flex-col gap-4">
      <PageHeader title="Réservations" subtitle="Une réservation bloque le stock disponible sans le sortir de la boutique." actions={<Link className="btn btn-primary" to="/admin/reservations/nouvelle">Nouvelle réservation</Link>} />
      <label className="label max-w-[260px]">Afficher<select className="field" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
        <option value="active">Actives (en attente, confirmées)</option><option value="">Toutes</option>{Object.entries(RES_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <div className="panel overflow-x-auto">
        <table className="data">
          <thead><tr><th>Numéro</th><th>Client</th><th>Articles</th><th>Échéance</th><th className="text-right">Acompte</th><th>Statut</th></tr></thead>
          <tbody>
            {data?.items.length === 0 && <tr><td colSpan={6} className="muted">Aucune réservation.</td></tr>}
            {data?.items.map((r) => (
              <tr key={r.id}>
                <td><Link to={`/admin/reservations/${r.id}`} className="num font-semibold">{r.number}</Link></td>
                <td>{r.customer?.name ?? <span className="muted">Non renseigné</span>}</td>
                <td>{r.items.map((i) => `${i.quantity} × ${i.product.name}`).join(', ')}</td>
                <td className="num">{dateTime.format(new Date(r.expiresAt))}</td>
                <td className="num text-right">{r.payments.filter((p) => p.status === 'RECORDED').reduce((a, p) => a + p.amount, 0) ? formatFCFA(r.payments.filter((p) => p.status === 'RECORDED').reduce((a, p) => a + p.amount, 0)) : '-'}</td>
                <td>{RES_STATUS[r.status]}{r.sale && <div className="text-[12px]"><Link to={`/admin/ventes/${r.sale.id}`}>{r.sale.number}</Link></div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager data={data} page={page} onPage={setPage} />
      </div>
    </div>
  );
}

export function NewReservation() {
  const navigate = useNavigate();
  const [key, renewKey] = useIdempotencyKey();
  const { data: locs } = useApi('/admin/stock/locations');
  const stores = (locs?.items ?? []).filter((l) => l.isSellable);
  const [locationId, setLocationId] = useState('');
  const loc = locationId || stores[0]?.id;
  const [lines, setLines] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [expiresAt, setExpiresAt] = useState('');
  const [deposit, setDeposit] = useState({ on: false, amount: '', method: 'MOBILE_MONEY', reference: '' });
  const [error, setError] = useState(null);
  async function submit(e) {
    e.preventDefault();
    setError(null);
    try {
      const r = await post('/admin/reservations', {
        locationId: loc, ...customerPayload(customer), ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
        items: lines.map((l) => ({ productId: l.product.id, quantity: n(l.qty), quotedPrice: l.product.price })),
        ...(deposit.on && n(deposit.amount) > 0 ? { deposit: { amount: n(deposit.amount), methodCode: deposit.method, ...(deposit.reference ? { externalReference: deposit.reference } : {}) } } : {}),
      }, key);
      renewKey(); navigate(`/admin/reservations/${r.id}`);
    } catch (err) { setError(err); }
  }
  return (
    <form onSubmit={submit} className="max-w-[900px] flex flex-col gap-4">
      <PageHeader title="Nouvelle réservation" subtitle="Le prix affiché aujourd'hui est conservé pour la vente." />
      {error && <Notice kind="error">{error.message}</Notice>}
      <section className="panel p-5 flex flex-col gap-3">
        <Field label="Boutique"><select className="field" value={loc ?? ''} onChange={(e) => { setLocationId(e.target.value); setLines([]); }}>{stores.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        <ProductPicker label="Ajouter un produit" onPick={(p) => !lines.some((l) => l.product.id === p.id) && setLines([...lines, { product: p, qty: '1' }])} />
        {lines.map((l, i) => (
          <div key={l.product.id} className="flex items-center gap-3 flex-wrap text-sm">
            <span className="flex-1 min-w-[180px] font-semibold">{l.product.name}<span className="block muted font-normal num">{formatFCFA(l.product.price)}, {l.product.levels.find((x) => x.locationId === loc)?.available ?? 0} disponible(s) ici</span></span>
            <input className="field num !w-20" inputMode="numeric" value={l.qty} aria-label={`Quantité de ${l.product.name}`} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
            <button type="button" className="btn btn-ghost !min-h-9" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Retirer</button>
          </div>
        ))}
      </section>
      <section className="panel p-5 flex flex-col gap-3">
        <CustomerPicker value={customer} onChange={setCustomer} />
        <Field label="Échéance" hint="Par défaut : la durée définie dans les paramètres"><input className="field" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-[15px]"><input type="checkbox" className="size-4 accent-[#176BFF]" checked={deposit.on} onChange={(e) => setDeposit({ ...deposit, on: e.target.checked })} />Acompte versé</label>
        {deposit.on && <>
          <MethodChips value={deposit.method} onChange={(m) => setDeposit({ ...deposit, method: m })} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Montant de l'acompte"><input className="field num" inputMode="numeric" value={deposit.amount} onChange={(e) => setDeposit({ ...deposit, amount: e.target.value })} /></Field>
            <Field label="Référence (facultatif)"><input className="field" value={deposit.reference} onChange={(e) => setDeposit({ ...deposit, reference: e.target.value })} /></Field>
          </div>
        </>}
      </section>
      <div className="flex gap-2"><button type="submit" className="btn btn-primary" disabled={!lines.length}>Réserver</button><Link className="btn btn-ghost" to="/admin/reservations">Annuler</Link></div>
    </form>
  );
}

export function ReservationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { data: r, retry, error: loadError } = useApi(`/admin/reservations/${id}`);
  const [key, renewKey] = useIdempotencyKey();
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [reason, setReason] = useState('');
  const [extend, setExtend] = useState('');
  const [pay, setPay] = useState({ amount: '', method: 'MOBILE_MONEY' });
  if (loadError) return <Notice kind="error">{loadError.message}</Notice>;
  if (!r) return <p className="muted">Chargement…</p>;
  const active = ['PENDING', 'CONFIRMED'].includes(r.status);
  const total = r.items.reduce((a, i) => a + i.quantity * (i.quotedPrice ?? i.product.price), 0);
  const deposits = r.payments.filter((p) => p.status === 'RECORDED').reduce((a, p) => a + p.amount, 0);
  const run = async (path, body) => { setError(null); try { const res = await post(path, body ?? {}, key); renewKey(); retry(); return res; } catch (err) { setError(err); return null; } };

  return (
    <div className="max-w-[900px] flex flex-col gap-4">
      <PageHeader title={`Réservation ${r.number}`} subtitle={`${RES_STATUS[r.status]}, ${r.location.name}, échéance ${dateTime.format(new Date(r.expiresAt))}`}
        actions={active && <>
          {can('sales:write') && <button type="button" className="btn btn-primary" onClick={async () => { const s = await run(`/admin/reservations/${id}/convert`); if (s) navigate(`/admin/ventes/${s.saleId}`, { state: { created: true } }); }}>Convertir en vente</button>}
          {r.status === 'PENDING' && <button type="button" className="btn btn-ghost" onClick={() => run(`/admin/reservations/${id}/confirm`)}>Confirmer</button>}
          <button type="button" className="btn btn-danger" onClick={() => { setReason(''); setDialog('cancel'); }}>Annuler</button>
        </>} />
      {error && <Notice kind="error">{error.message}</Notice>}
      {r.sale && <Notice kind="success">Convertie en vente <Link to={`/admin/ventes/${r.sale.id}`}>{r.sale.number}</Link>.</Notice>}
      <section className="panel p-5 flex flex-col gap-2">
        <div className="text-sm">Client : {r.customer ? `${r.customer.name}, ${r.customer.phone}` : 'non renseigné'}</div>
        <table className="data"><tbody>{r.items.map((i) => <tr key={i.id}><td>{i.quantity} × {i.product.name}</td><td className="num text-right">{formatFCFA(i.quantity * (i.quotedPrice ?? i.product.price))}</td></tr>)}</tbody></table>
        <div className="num text-right">Total prévu {formatFCFA(total)}, acompte {formatFCFA(deposits)}</div>
      </section>
      {active && (
        <div className="grid gap-4 sm:grid-cols-2">
          <form className="panel p-5 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (extend) run(`/admin/reservations/${id}/extend`, { expiresAt: new Date(extend).toISOString() }); }}>
            <h2 className="text-lg">Prolonger</h2>
            <Field label="Nouvelle échéance"><input className="field" type="datetime-local" value={extend} onChange={(e) => setExtend(e.target.value)} /></Field>
            <button type="submit" className="btn btn-ghost self-start">Prolonger</button>
          </form>
          {can('payments:write') && (
            <form className="panel p-5 flex flex-col gap-2" onSubmit={async (e) => { e.preventDefault(); if (n(pay.amount) > 0 && await run(`/admin/reservations/${id}/payments`, { amount: n(pay.amount), methodCode: pay.method })) setPay({ ...pay, amount: '' }); }}>
              <h2 className="text-lg">Encaisser un acompte</h2>
              <MethodChips value={pay.method} onChange={(m) => setPay({ ...pay, method: m })} />
              <input className="field num" inputMode="numeric" aria-label="Montant" placeholder="Montant" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
              <button type="submit" className="btn btn-ghost self-start">Enregistrer l'acompte</button>
            </form>
          )}
        </div>
      )}
      <section className="panel p-5">
        <h2 className="text-lg mb-2">Historique</h2>
        <ol className="m-0 pl-5 text-sm flex flex-col gap-1">
          {r.statusChanges.map((s) => <li key={s.id}><span className="num">{dateTime.format(new Date(s.createdAt))}</span> : {RES_STATUS[s.toStatus]}{s.reason ? ` (${s.reason})` : ''}, par {s.adminUser.name}</li>)}
          {r.payments.map((p) => <li key={p.id}><span className="num">{dateTime.format(new Date(p.receivedAt))}</span> : acompte {p.reference}, {formatFCFA(p.amount)}, {p.paymentMethod.label}</li>)}
        </ol>
      </section>
      <ConfirmDialog open={dialog === 'cancel'} title={`Annuler la réservation ${r.number} ?`} confirmLabel="Annuler la réservation" onCancel={() => setDialog(null)}
        onConfirm={() => { if (reason.trim().length >= 3) { setDialog(null); run(`/admin/reservations/${id}/cancel`, { reason }); } }}>
        <p className="m-0 mb-3">Le stock réservé redevient disponible. {deposits ? `L'acompte (${formatFCFA(deposits)}) reste enregistré jusqu'à son remboursement.` : ''}</p>
        <Field label="Motif (obligatoire)"><input className="field" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </ConfirmDialog>
    </div>
  );
}
