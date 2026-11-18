import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useApi } from '../../lib/useApi.js';
import { useAuth } from '../auth.jsx';
import { dateTime, post, ProductPicker, SerialPicker, useIdempotencyKey } from '../pickers.jsx';
import { ConfirmDialog, Field, Notice, PageHeader, Pager } from '../ui.jsx';

export const TRANSFER_STATUS = { PENDING: 'En attente', IN_TRANSIT: 'En transit', RECEIVED: 'Reçu', CANCELLED: 'Annulé' };

function NewTransfer({ locations, onCreated }) {
  const [key, renewKey] = useIdempotencyKey();
  const stores = locations.filter((l) => l.type !== 'TRANSIT');
  const [form, setForm] = useState({ sourceLocationId: stores[0]?.id ?? '', destinationLocationId: stores[1]?.id ?? '', reason: '' });
  const [lines, setLines] = useState([]);
  const [error, setError] = useState(null);
  const availableAt = (p) => p.levels.find((l) => l.locationId === form.sourceLocationId)?.available ?? 0;

  async function submit(e) {
    e.preventDefault();
    setError(null);
    try {
      const r = await post('/admin/transfers', { ...form, reason: form.reason || undefined, items: lines.map((l) => ({ productId: l.product.id, quantity: Number(l.quantity) })) }, key);
      renewKey(); onCreated(r.id);
    } catch (err) { setError(err); }
  }
  return (
    <form onSubmit={submit} className="panel p-5 flex flex-col gap-4">
      <h2 className="text-lg">Nouveau transfert</h2>
      {error && <Notice kind="error">{error.message}</Notice>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Depuis"><select className="field" value={form.sourceLocationId} onChange={(e) => setForm({ ...form, sourceLocationId: e.target.value })}>{stores.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        <Field label="Vers"><select className="field" value={form.destinationLocationId} onChange={(e) => setForm({ ...form, destinationLocationId: e.target.value })}>{stores.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
      </div>
      <ProductPicker label="Ajouter un produit" onPick={(p) => !lines.some((l) => l.product.id === p.id) && setLines([...lines, { product: p, quantity: 1 }])} />
      {lines.length > 0 && (
        <table className="data">
          <thead><tr><th>Produit</th><th className="text-right">Disponible au départ</th><th className="text-right">Quantité</th><th /></tr></thead>
          <tbody>{lines.map((l, i) => (
            <tr key={l.product.id}>
              <td>{l.product.name}</td>
              <td className="num text-right">{availableAt(l.product)}</td>
              <td className="text-right"><input className="field num !w-24 text-right" inputMode="numeric" aria-label={`Quantité de ${l.product.name}`} value={l.quantity}
                onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} /></td>
              <td className="text-right"><button type="button" className="btn btn-ghost !min-h-9" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Retirer</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <Field label="Motif (facultatif)"><input className="field" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
      <button type="submit" className="btn btn-primary self-start" disabled={!lines.length || form.sourceLocationId === form.destinationLocationId}>Créer le transfert</button>
    </form>
  );
}

export function TransferList() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const { data: locs } = useApi('/admin/stock/locations');
  const { data } = useApi(`/admin/transfers?limit=30&page=${page}`);
  return (
    <div className="max-w-[1100px] flex flex-col gap-4">
      <PageHeader title="Transferts" subtitle="Déplacer du stock entre Cotonou, Calavi et l'entrepôt."
        actions={can('transfers:write') && !creating && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>Nouveau transfert</button>} />
      {creating && locs && <NewTransfer locations={locs.items} onCreated={(id) => navigate(`/admin/transferts/${id}`)} />}
      <div className="panel overflow-x-auto">
        <table className="data">
          <thead><tr><th>Numéro</th><th>Trajet</th><th>Articles</th><th>Statut</th><th>Créé le</th></tr></thead>
          <tbody>
            {data?.items.length === 0 && <tr><td colSpan={5} className="muted">Aucun transfert.</td></tr>}
            {data?.items.map((t) => (
              <tr key={t.id}>
                <td><Link to={`/admin/transferts/${t.id}`} className="num font-semibold">{t.number}</Link></td>
                <td>{t.source.name} vers {t.destination.name}</td>
                <td>{t.items.map((i) => `${i.quantity} × ${i.product.name}`).join(', ')}</td>
                <td>{TRANSFER_STATUS[t.status]}</td>
                <td className="num">{dateTime.format(new Date(t.createdAt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager data={data} page={page} onPage={setPage} />
      </div>
    </div>
  );
}

export function TransferDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const { data: t, retry, error: loadError } = useApi(`/admin/transfers/${id}`);
  const [key, renewKey] = useIdempotencyKey();
  const [serials, setSerials] = useState({});
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  if (loadError) return <Notice kind="error">{loadError.message}</Notice>;
  if (!t) return <p className="muted">Chargement…</p>;
  const act = async (path, body) => {
    setError(null);
    try { await post(`/admin/transfers/${id}/${path}`, body, key); renewKey(); retry(); } catch (err) { setError(err); }
  };
  const serialized = t.items.filter((i) => i.product.isSerialized);
  const ready = serialized.every((i) => (serials[i.productId] ?? []).length === i.quantity);

  return (
    <div className="max-w-[900px] flex flex-col gap-4">
      <PageHeader title={`Transfert ${t.number}`} subtitle={`${t.source.name} vers ${t.destination.name}, ${TRANSFER_STATUS[t.status].toLowerCase()}`} />
      {error && <Notice kind="error">{error.message}</Notice>}
      <div className="panel overflow-x-auto">
        <table className="data">
          <thead><tr><th>Produit</th><th className="text-right">Quantité</th><th>Numéros de série</th></tr></thead>
          <tbody>{t.items.map((i) => (
            <tr key={i.id}>
              <td>{i.product.name}<div className="num muted text-[13px]">{i.product.sku}</div></td>
              <td className="num text-right">{i.quantity}</td>
              <td className="num text-[13px]">
                {t.serials.filter((s) => s.productId === i.productId).map((s) => s.serialNumber).join(', ')}
                {t.status === 'PENDING' && i.product.isSerialized && (
                  <SerialPicker productId={i.productId} locationId={t.source.id} count={i.quantity} value={serials[i.productId] ?? []} onChange={(v) => setSerials({ ...serials, [i.productId]: v })} />
                )}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {can('transfers:write') && (
        <div className="flex gap-2 flex-wrap">
          {t.status === 'PENDING' && <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => act('ship', { serials })}>Expédier (sortie de {t.source.name})</button>}
          {t.status === 'IN_TRANSIT' && <button type="button" className="btn btn-primary" onClick={() => act('receive', {})}>Confirmer la réception à {t.destination.name}</button>}
          {['PENDING', 'IN_TRANSIT'].includes(t.status) && <button type="button" className="btn btn-danger" onClick={() => setCancelling(true)}>Annuler le transfert</button>}
        </div>
      )}
      <section className="panel p-5">
        <h2 className="text-lg mb-2">Historique</h2>
        <ol className="m-0 pl-5 flex flex-col gap-1 text-sm">
          {t.statusChanges.map((s) => <li key={s.id}><span className="num">{dateTime.format(new Date(s.createdAt))}</span> : {TRANSFER_STATUS[s.toStatus]} par {s.adminUser.name}{s.reason ? ` (${s.reason})` : ''}</li>)}
        </ol>
      </section>
      <Link to="/admin/transferts">Tous les transferts</Link>
      <ConfirmDialog open={cancelling} title={`Annuler le transfert ${t.number} ?`} confirmLabel="Annuler le transfert"
        onCancel={() => setCancelling(false)} onConfirm={() => { if (reason.trim().length >= 3) { setCancelling(false); act('cancel', { reason }); } }}>
        <p className="m-0 mb-3">{t.status === 'IN_TRANSIT' ? `La marchandise est remise en stock à ${t.source.name}.` : 'Aucun stock n’a encore bougé.'}</p>
        <Field label="Motif (obligatoire)"><input className="field" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </ConfirmDialog>
    </div>
  );
}
