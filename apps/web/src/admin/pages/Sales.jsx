import { useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import { toQuery } from '../../lib/api.js';
import { formatFCFA } from '../../lib/format.js';
import { useApi } from '../../lib/useApi.js';
import { useAuth } from '../auth.jsx';
import { CHANNEL, cleanDelivery, CONDITION, DeliveryFields, FUL_STATUS, HANDOVER, MethodChips, PAY_COLORS, PAY_STATUS, RETURN_REASON, SALE_STATUS } from '../commerce.jsx';
import { dateTime, post, SerialPicker, useIdempotencyKey } from '../pickers.jsx';
import { ConfirmDialog, Field, Notice, PageHeader, Pager } from '../ui.jsx';

const n = (v) => Number(String(v ?? '').replace(/\s/g, '')) || 0;

export function SaleList() {
  const [sp, setSp] = useSearchParams();
  const f = { q: sp.get('q') ?? '', status: sp.get('status') ?? '', channel: sp.get('channel') ?? '', paymentStatus: sp.get('paymentStatus') ?? '', from: sp.get('from') ?? '', to: sp.get('to') ?? '', page: Number(sp.get('page')) || 1 };
  const { data } = useApi(`/admin/sales${toQuery({ ...f, to: f.to ? `${f.to}T23:59:59` : '', limit: 50 })}`);
  const set = (k, v) => setSp((prev) => { const s = new URLSearchParams(prev); if (v) s.set(k, v); else s.delete(k); s.delete('page'); return s; }, { replace: true });
  return (
    <>
      <PageHeader title="Ventes" subtitle="Chaque vente validée est conservée, même annulée." actions={<Link className="btn btn-primary" to="/admin/caisse">Nouvelle vente</Link>} />
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <label className="label flex-[2_1_220px]">Rechercher<input className="field" type="search" defaultValue={f.q} placeholder="Numéro, client ou téléphone" onKeyDown={(e) => e.key === 'Enter' && set('q', e.target.value)} onBlur={(e) => set('q', e.target.value)} /></label>
        <label className="label">Paiement<select className="field" value={f.paymentStatus} onChange={(e) => set('paymentStatus', e.target.value)}><option value="">Tous</option>{Object.entries(PAY_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="label">Canal<select className="field" value={f.channel} onChange={(e) => set('channel', e.target.value)}><option value="">Tous</option>{Object.entries(CHANNEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="label">Statut<select className="field" value={f.status} onChange={(e) => set('status', e.target.value)}><option value="">Tous</option>{Object.entries(SALE_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="label">Du<input className="field" type="date" value={f.from} onChange={(e) => set('from', e.target.value)} /></label>
        <label className="label">Au<input className="field" type="date" value={f.to} onChange={(e) => set('to', e.target.value)} /></label>
      </div>
      <div className="panel overflow-x-auto">
        <table className="data">
          <thead><tr><th>Numéro</th><th>Date</th><th>Client</th><th>Canal</th><th className="text-right">Total</th><th>Paiement</th><th>Remise</th></tr></thead>
          <tbody>
            {data?.items.length === 0 && <tr><td colSpan={7} className="muted">Aucune vente.</td></tr>}
            {data?.items.map((s) => {
              const qty = s.items.reduce((a, i) => a + i.quantity, 0);
              const handed = s.items.reduce((a, i) => a + i.quantityHandedOver, 0);
              return (
                <tr key={s.id}>
                  <td><Link to={`/admin/ventes/${s.id}`} className="num font-semibold">{s.number}</Link>{s.status === 'CANCELLED' && <div className="text-[12px] text-[#B42318]">Annulée</div>}</td>
                  <td className="num whitespace-nowrap">{dateTime.format(new Date(s.validatedAt))}</td>
                  <td>{s.customer?.name ?? <span className="muted">Occasionnel</span>}</td>
                  <td>{CHANNEL[s.channel]}<div className="muted text-[12px]">{s.location.name}</div></td>
                  <td className="num text-right whitespace-nowrap">{formatFCFA(s.total)}</td>
                  <td style={{ color: PAY_COLORS[s.balance?.paymentStatus] }} className="font-semibold text-[13px]">{PAY_STATUS[s.balance?.paymentStatus]}{s.balance?.amountDue > 0 && <div className="num font-normal muted">reste {formatFCFA(s.balance.amountDue)}</div>}</td>
                  <td className="text-[13px]">{s.status === 'CANCELLED' ? '-' : handed === 0 ? 'Non remise' : handed < qty ? `${handed} / ${qty}` : 'Remise'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pager data={data} page={f.page} onPage={(p) => setSp((prev) => { const s = new URLSearchParams(prev); s.set('page', p); return s; })} />
      </div>
    </>
  );
}

function Track({ title, status, color, children }) {
  return (
    <section className="panel p-5 flex flex-col gap-3 flex-[1_1_300px] min-w-0">
      <h2 className="text-[15px] muted font-semibold" style={{ fontStretch: '100%' }}>{title}</h2>
      <div className="flex items-center gap-2 text-lg font-bold" style={{ fontStretch: '108%' }}><span className="size-2.5 rounded-full inline-block" style={{ background: color }} />{status}</div>
      {children}
    </section>
  );
}

function FulfillmentCard({ f, sale, act }) {
  const [form, setForm] = useState({ receivedByName: sale.customer?.name ?? '', proofNote: '', note: '', courierName: f.courierName ?? '' });
  const [serials, setSerials] = useState({});
  const [failing, setFailing] = useState(false);
  const items = f.items.map((fi) => ({ ...fi, saleItem: sale.items.find((i) => i.id === fi.saleItemId) }));
  const needsSerials = (f.mode === 'PICKUP' && ['PREPARING', 'READY'].includes(f.status)) || (f.mode === 'DELIVERY' && ['PREPARING', 'READY'].includes(f.status));
  const serialOk = items.every((fi) => !fi.saleItem.product.isSerialized || (serials[fi.saleItemId] ?? []).length === fi.quantity);
  const lastEvent = f.events.at(-1);
  return (
    <div className="border border-[#DDE3EC] rounded-lg p-4 flex flex-col gap-3">
      <div className="flex justify-between gap-3 flex-wrap">
        <div><span className="num font-semibold">{f.number}</span> <span className="muted">{f.mode === 'PICKUP' ? 'Retrait en boutique' : 'Livraison'}</span></div>
        <span className="font-semibold text-sm">{FUL_STATUS[f.status]}</span>
      </div>
      <div className="text-sm">{items.map((fi) => `${fi.quantity} × ${fi.saleItem.productName}`).join(', ')}</div>
      {f.mode === 'DELIVERY' && <div className="text-sm muted">{f.recipientName}, {f.recipientPhone}, {f.address}, {f.district ? `${f.district}, ` : ''}{f.city}{f.courierName ? `. Livreur : ${f.courierName}` : ''}</div>}
      {f.status === 'COMPLETED' && <div className="text-sm">Reçu par <strong>{f.receivedByName}</strong> le {dateTime.format(new Date(f.completedAt))}{f.proofNote ? `. Preuve : ${f.proofNote}` : ''}</div>}
      {lastEvent?.note && <div className="text-sm muted">Dernière note : {lastEvent.note}</div>}
      {needsSerials && items.filter((fi) => fi.saleItem.product.isSerialized).map((fi) => (
        <SerialPicker key={fi.saleItemId} productId={fi.saleItem.product.id} locationId={sale.location.id} count={fi.quantity} value={serials[fi.saleItemId] ?? []} onChange={(v) => setSerials({ ...serials, [fi.saleItemId]: v })} />
      ))}
      {['PREPARING', 'READY', 'IN_TRANSIT'].includes(f.status) && !(f.mode === 'DELIVERY' && f.status !== 'IN_TRANSIT') && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Reçu par"><input className="field" value={form.receivedByName} onChange={(e) => setForm({ ...form, receivedByName: e.target.value })} /></Field>
          <Field label="Preuve (facultatif)"><input className="field" value={form.proofNote} onChange={(e) => setForm({ ...form, proofNote: e.target.value })} placeholder="Ex. signature sur le bon" /></Field>
        </div>
      )}
      {f.mode === 'DELIVERY' && ['PREPARING', 'READY'].includes(f.status) && <Field label="Livreur"><input className="field" value={form.courierName} onChange={(e) => setForm({ ...form, courierName: e.target.value })} /></Field>}
      <div className="flex gap-2 flex-wrap">
        {f.status === 'PREPARING' && <button type="button" className="btn btn-ghost" onClick={() => act(f.id, 'ready')}>Marquer prête</button>}
        {f.mode === 'DELIVERY' && ['PREPARING', 'READY'].includes(f.status) && <button type="button" className="btn btn-primary" disabled={!serialOk} onClick={() => act(f.id, 'dispatch', { courierName: form.courierName || undefined, serials })}>Remettre au livreur</button>}
        {f.mode === 'PICKUP' && ['PREPARING', 'READY'].includes(f.status) && <button type="button" className="btn btn-primary" disabled={!serialOk || form.receivedByName.trim().length < 2} onClick={() => act(f.id, 'complete', { receivedByName: form.receivedByName, proofNote: form.proofNote || undefined, serials })}>Confirmer la remise</button>}
        {f.status === 'IN_TRANSIT' && <button type="button" className="btn btn-primary" disabled={form.receivedByName.trim().length < 2} onClick={() => act(f.id, 'complete', { receivedByName: form.receivedByName, proofNote: form.proofNote || undefined })}>Confirmer la réception</button>}
        {f.status === 'IN_TRANSIT' && <button type="button" className="btn btn-danger" onClick={() => setFailing(true)}>Signaler un échec</button>}
        {f.status === 'FAILED' && <button type="button" className="btn btn-primary" onClick={() => act(f.id, 'retry')}>Nouvelle tentative</button>}
        {f.status === 'FAILED' && <button type="button" className="btn btn-ghost" onClick={() => act(f.id, 'return-to-store')}>Retour en boutique</button>}
        {['PREPARING', 'READY'].includes(f.status) && <button type="button" className="btn btn-ghost" onClick={() => act(f.id, 'cancel', { note: 'Remise annulée depuis la fiche vente' })}>Annuler cette remise</button>}
      </div>
      <ConfirmDialog open={failing} title="Signaler un échec de livraison ?" confirmLabel="Enregistrer l'échec" onCancel={() => setFailing(false)}
        onConfirm={() => { if (form.note.trim().length >= 3) { setFailing(false); act(f.id, 'fail', { note: form.note }); } }}>
        <p className="m-0 mb-3">La marchandise reste « en transit » jusqu'à une nouvelle tentative ou son retour en boutique.</p>
        <Field label="Motif (obligatoire)"><input className="field" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Ex. client injoignable" /></Field>
      </ConfirmDialog>
    </div>
  );
}

export function SaleDetail() {
  const { id } = useParams();
  const location = useLocation();
  const { can } = useAuth();
  const { data: s, retry, error: loadError } = useApi(`/admin/sales/${id}`);
  const { data: locs } = useApi('/admin/stock/locations');
  const [key, renewKey] = useIdempotencyKey();
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(location.state?.created ? 'Vente validée.' : null);
  const [pay, setPay] = useState({ amount: '', method: 'CASH', reference: '' });
  const [newF, setNewF] = useState(null);
  const [ret, setRet] = useState(null);
  const [refund, setRefund] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  if (loadError) return <Notice kind="error">{loadError.message}</Notice>;
  if (!s) return <p className="muted">Chargement…</p>;

  const run = async (path, body, ok) => {
    setError(null); setNotice(null);
    try { await post(path, body, key); renewKey(); setNotice(ok); retry(); return true; } catch (err) { setError(err); return false; }
  };
  const act = (fid, action, body) => run(`/admin/fulfillments/${fid}/${action}`, body ?? {}, 'Remise mise à jour.');
  const b = s.balance;
  const active = s.status === 'VALIDATED';
  const openQty = s.items.map((i) => ({ item: i, free: i.quantityAllocated - s.fulfillments.filter((f) => ['PREPARING', 'READY', 'IN_TRANSIT', 'FAILED'].includes(f.status)).flatMap((f) => f.items).filter((fi) => fi.saleItemId === i.id).reduce((a, fi) => a + fi.quantity, 0) }));
  const canNewFulfillment = active && openQty.some((o) => o.free > 0);
  const returnable = s.items.filter((i) => i.quantityHandedOver - i.quantityReturned > 0);
  const history = [
    ...s.statusChanges.map((c) => ({ at: c.createdAt, text: `Vente ${SALE_STATUS[c.toStatus]?.toLowerCase() ?? c.toStatus}${c.reason ? ` (${c.reason})` : ''}`, by: c.adminUser.name })),
    ...s.payments.map((p) => ({ at: p.createdAt, text: `Paiement ${p.reference} : ${formatFCFA(p.amount)}, ${p.paymentMethod.label}${p.status === 'VOIDED' ? ' (saisie annulée)' : ''}`, by: p.recordedBy.name })),
    ...s.refunds.map((r) => ({ at: r.createdAt, text: `Remboursement ${r.reference} : ${formatFCFA(r.amount)} (${r.reason})` })),
    ...s.fulfillments.flatMap((f) => f.events.map((e) => ({ at: e.createdAt, text: `${f.number} : ${FUL_STATUS[e.toStatus]}${e.note ? ` (${e.note})` : ''}` }))),
    ...s.returns.map((r) => ({ at: r.receivedAt, text: `Retour ${r.number} : ${RETURN_REASON[r.reason]}` })),
  ].sort((a, b2) => new Date(a.at) - new Date(b2.at));

  return (
    <div className="max-w-[1200px] flex flex-col gap-4">
      <PageHeader title={`Vente ${s.number}`}
        subtitle={`${CHANNEL[s.channel]}, ${s.location.name}, ${dateTime.format(new Date(s.validatedAt))}. Client : ${s.customer ? `${s.customer.name} (${s.customer.phone})` : 'occasionnel'}`}
        actions={<>
          <Link className="btn btn-ghost" to={`/admin/ventes/${s.id}/ticket`}>Ticket de vente</Link>
          {active && can('sales:write') && s.handoverStatus === 'NOT_HANDED' && <button type="button" className="btn btn-danger" onClick={() => { setReason(''); setCancelling(true); }}>Annuler la vente</button>}
        </>} />
      {notice && <Notice kind="success">{notice}</Notice>}
      {error && <Notice kind="error">{error.message}</Notice>}
      {s.status === 'CANCELLED' && <Notice kind="warning">Vente annulée le {dateTime.format(new Date(s.cancelledAt))} : {s.cancelReason}</Notice>}

      <div className="flex flex-wrap gap-4">
        <Track title="Validation commerciale" status={SALE_STATUS[s.status]} color={active ? '#0B7A47' : '#B42318'}>
          <p className="m-0 text-sm muted">Par {s.validatedBy.name}{s.reservation ? `, depuis la réservation ${s.reservation.number}` : ''}{s.exchangeReturn ? `, échange du retour ${s.exchangeReturn.number}` : ''}.</p>
        </Track>
        <Track title="Paiement" status={PAY_STATUS[b.paymentStatus]} color={PAY_COLORS[b.paymentStatus]}>
          <dl className="num m-0 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
            <dt className="muted">Total</dt><dd className="m-0">{formatFCFA(b.total)}</dd>
            {b.netTotal !== b.total && <><dt className="muted">Après retours</dt><dd className="m-0">{formatFCFA(b.netTotal)}</dd></>}
            <dt className="muted">Encaissé</dt><dd className="m-0">{formatFCFA(b.collected)}</dd>
            {b.refunded > 0 && <><dt className="muted">Remboursé</dt><dd className="m-0">{formatFCFA(b.refunded)}</dd></>}
            <dt className="font-semibold">{b.amountDue < 0 ? 'À rembourser' : 'Reste à payer'}</dt><dd className="m-0 font-bold">{formatFCFA(Math.abs(b.amountDue))}</dd>
          </dl>
          {active && b.amountDue > 0 && can('payments:write') && (
            <form className="flex flex-col gap-2 border-t border-[#EEF1F5] pt-3" onSubmit={async (e) => { e.preventDefault(); if (await run(`/admin/sales/${id}/payments`, { amount: n(pay.amount) || b.amountDue, methodCode: pay.method, ...(pay.reference ? { externalReference: pay.reference } : {}) }, 'Paiement enregistré.')) setPay({ amount: '', method: pay.method, reference: '' }); }}>
              <MethodChips value={pay.method} onChange={(m) => setPay({ ...pay, method: m })} />
              <div className="flex gap-2">
                <input className="field num" inputMode="numeric" aria-label="Montant" placeholder={String(b.amountDue)} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
                <input className="field" aria-label="Référence" placeholder="Référence" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
              </div>
              <button type="submit" className="btn btn-primary">Enregistrer un paiement</button>
            </form>
          )}
        </Track>
        <Track title="Remise au client" status={HANDOVER[s.handoverStatus]} color={s.handoverStatus === 'HANDED' ? '#0B7A47' : s.handoverStatus === 'PARTIAL' ? '#8A5A00' : '#176BFF'}>
          <p className="m-0 text-sm muted">{s.items.reduce((a, i) => a + i.quantityHandedOver, 0)} article(s) remis sur {s.items.reduce((a, i) => a + i.quantity, 0)}.</p>
          {active && s.items.some((i) => i.quantityBackordered > 0) && <button type="button" className="btn btn-ghost self-start" onClick={() => run(`/admin/sales/${id}/allocate-backorders`, {}, 'Stock arrivé affecté à la vente.')}>Affecter le stock arrivé</button>}
          {canNewFulfillment && can('fulfillments:write') && !newF && <button type="button" className="btn btn-ghost self-start" onClick={() => setNewF({ mode: 'PICKUP', qty: Object.fromEntries(openQty.map((o) => [o.item.id, o.free])), delivery: {} })}>Préparer une remise</button>}
        </Track>
      </div>

      {newF && (
        <section className="panel p-5 flex flex-col gap-3">
          <h2 className="text-lg">Nouvelle remise</h2>
          <div className="flex gap-1.5">{[['PICKUP', 'Retrait en boutique'], ['DELIVERY', 'Livraison']].map(([m, l]) => <button key={m} type="button" className="chip !min-h-9 !text-sm" aria-pressed={newF.mode === m} onClick={() => setNewF({ ...newF, mode: m })}>{l}</button>)}</div>
          {openQty.filter((o) => o.free > 0).map((o) => (
            <label key={o.item.id} className="flex items-center gap-3 text-sm">{o.item.productName}
              <input className="field num !w-20 !min-h-9" inputMode="numeric" value={newF.qty[o.item.id]} onChange={(e) => setNewF({ ...newF, qty: { ...newF.qty, [o.item.id]: e.target.value } })} aria-label={`Quantité à remettre de ${o.item.productName}`} />
              <span className="muted">sur {o.free}</span></label>
          ))}
          {newF.mode === 'DELIVERY' && <DeliveryFields value={newF.delivery} onChange={(d) => setNewF({ ...newF, delivery: d })} />}
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" onClick={async () => {
              const items = Object.entries(newF.qty).map(([saleItemId, q]) => ({ saleItemId, quantity: n(q) })).filter((x) => x.quantity > 0);
              if (await run(`/admin/sales/${id}/fulfillments`, { mode: newF.mode, items, ...(newF.mode === 'DELIVERY' ? { delivery: cleanDelivery(newF.delivery) } : {}) }, 'Remise créée.')) setNewF(null);
            }}>Créer la remise</button>
            <button type="button" className="btn btn-ghost" onClick={() => setNewF(null)}>Annuler</button>
          </div>
        </section>
      )}

      <section className="panel overflow-x-auto">
        <h2 className="text-lg px-5 pt-4">Articles</h2>
        <table className="data">
          <thead><tr><th>Produit</th><th className="text-right">Qté</th><th className="text-right">Prix appliqué</th><th className="text-right">Remise</th><th className="text-right">Total</th><th>Suivi</th></tr></thead>
          <tbody>
            {s.items.map((i) => (
              <tr key={i.id}>
                <td>{i.productName}<div className="num muted text-[12px]">{i.product.sku}{i.serialNumbers.length ? `, n° ${i.serialNumbers.map((x) => x.serialNumber).join(', ')}` : ''}</div></td>
                <td className="num text-right">{i.quantity}</td>
                <td className="num text-right whitespace-nowrap">{formatFCFA(i.unitPrice)}</td>
                <td className="num text-right">{i.discountAmount ? formatFCFA(i.discountAmount) : '-'}</td>
                <td className="num text-right whitespace-nowrap">{formatFCFA(i.lineTotal)}</td>
                <td className="text-[13px] muted">{[i.quantityHandedOver && `${i.quantityHandedOver} remis`, i.quantityAllocated && `${i.quantityAllocated} réservé(s) en boutique`, i.quantityBackordered && `${i.quantityBackordered} en attente d'approvisionnement`, i.quantityReturned && `${i.quantityReturned} retourné(s)`, i.quantityCancelled && `${i.quantityCancelled} annulé(s)`].filter(Boolean).join(', ')}</td>
              </tr>
            ))}
            {s.deliveryFee > 0 && <tr><td colSpan={4} className="muted">Frais de livraison</td><td className="num text-right">{formatFCFA(s.deliveryFee)}</td><td /></tr>}
          </tbody>
        </table>
      </section>

      {s.fulfillments.length > 0 && (
        <section className="panel p-5 flex flex-col gap-3">
          <h2 className="text-lg">Remises et livraisons</h2>
          {s.fulfillments.map((f) => <FulfillmentCard key={f.id + f.status} f={f} sale={s} act={act} />)}
        </section>
      )}

      <section className="panel overflow-x-auto">
        <h2 className="text-lg px-5 pt-4">Paiements</h2>
        <table className="data">
          <thead><tr><th>Référence</th><th>Date</th><th>Moyen</th><th className="text-right">Montant</th><th>Remboursements</th><th /></tr></thead>
          <tbody>
            {s.payments.length === 0 && <tr><td colSpan={6} className="muted">Aucun paiement.</td></tr>}
            {s.payments.map((p) => {
              const refunded = p.refunds.filter((r) => r.status === 'RECORDED').reduce((a, r) => a + r.amount, 0);
              return (
                <tr key={p.id} className={p.status === 'VOIDED' ? 'opacity-60' : ''}>
                  <td className="num">{p.reference}{p.status === 'VOIDED' && <div className="text-[12px] text-[#B42318]">Saisie annulée : {p.voidReason}</div>}</td>
                  <td className="num">{dateTime.format(new Date(p.receivedAt))}</td>
                  <td>{p.paymentMethod.label}{p.externalReference && <div className="muted text-[12px]">Réf. déclarée {p.externalReference}</div>}{p.reservationId && <div className="muted text-[12px]">Acompte de réservation</div>}</td>
                  <td className="num text-right">{formatFCFA(p.amount)}</td>
                  <td className="num text-[13px]">{refunded ? formatFCFA(refunded) : '-'}</td>
                  <td className="text-right">{p.status === 'RECORDED' && refunded < p.amount && can('refunds:write') && <button type="button" className="btn btn-ghost !min-h-9" onClick={() => setRefund({ payment: p, max: p.amount - refunded, amount: '', method: p.paymentMethod.code, reason: '', returnId: s.returns.at(-1)?.id ?? '' })}>Rembourser</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="panel p-5 flex flex-col gap-3">
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <h2 className="text-lg">Retours</h2>
          {returnable.length > 0 && can('returns:write') && !ret && <button type="button" className="btn btn-ghost" onClick={() => setRet({ reason: 'CUSTOMER_RETURN', locationId: s.location.id, notes: '', lines: Object.fromEntries(returnable.map((i) => [i.id, { quantity: '', condition: 'RESTOCKED', serialIds: [] }])) })}>Enregistrer un retour</button>}
        </div>
        {s.returns.length === 0 && !ret && <p className="muted m-0 text-sm">Aucun retour.</p>}
        {s.returns.map((r) => (
          <div key={r.id} className="text-sm"><span className="num font-semibold">{r.number}</span>, {dateTime.format(new Date(r.receivedAt))}, {RETURN_REASON[r.reason]} : {r.items.map((ri) => `${ri.quantity} × ${s.items.find((i) => i.id === ri.saleItemId)?.productName} (${CONDITION[ri.condition].toLowerCase()})`).join(', ')}
            {r.exchangeSale ? <> ; échange : <Link to={`/admin/ventes/${r.exchangeSale.id}`}>{r.exchangeSale.number}</Link></> : r.reason === 'EXCHANGE' && <> ; <Link to="/admin/caisse" state={{ exchangeReturnId: r.id }}>créer la vente d'échange</Link></>}</div>
        ))}
        {ret && (
          <div className="border border-[#DDE3EC] rounded-lg p-4 flex flex-col gap-3">
            <p className="m-0 text-sm muted">Saisissez l'état de chaque article à sa réception physique : seul « Remis en stock » le rend de nouveau vendable. Le remboursement est une opération séparée.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Motif"><select className="field" value={ret.reason} onChange={(e) => setRet({ ...ret, reason: e.target.value })}>{Object.entries(RETURN_REASON).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
              <Field label="Reçu à"><select className="field" value={ret.locationId} onChange={(e) => setRet({ ...ret, locationId: e.target.value })}>{(locs?.items ?? []).filter((l) => l.type !== 'TRANSIT').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
            </div>
            {returnable.map((i) => {
              const line = ret.lines[i.id];
              const setLine = (patch) => setRet({ ...ret, lines: { ...ret.lines, [i.id]: { ...line, ...patch } } });
              return (
                <div key={i.id} className="flex flex-wrap gap-3 items-end">
                  <div className="flex-1 min-w-[160px] text-sm">{i.productName}<div className="muted text-[12px]">{i.quantityHandedOver - i.quantityReturned} retournable(s)</div></div>
                  <label className="label">Quantité<input className="field num !w-20" inputMode="numeric" value={line.quantity} onChange={(e) => setLine({ quantity: e.target.value })} /></label>
                  <label className="label">État<select className="field" value={line.condition} onChange={(e) => setLine({ condition: e.target.value })}>{Object.entries(CONDITION).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
                  {i.product.isSerialized && n(line.quantity) > 0 && (
                    <fieldset className="border border-[#DDE3EC] rounded-md p-2 m-0 w-full"><legend className="text-[13px] px-1">Appareils retournés</legend>
                      <div className="flex flex-wrap gap-2">{i.serialNumbers.filter((x) => x.status === 'DELIVERED').map((x) => (
                        <label key={x.id} className="chip !min-h-9 !text-sm cursor-pointer" style={line.serialIds.includes(x.id) ? { background: '#176BFF', color: '#fff' } : undefined}>
                          <input type="checkbox" className="sr-only" checked={line.serialIds.includes(x.id)} onChange={() => setLine({ serialIds: line.serialIds.includes(x.id) ? line.serialIds.filter((v) => v !== x.id) : [...line.serialIds, x.id] })} />{x.serialNumber}</label>
                      ))}</div>
                    </fieldset>
                  )}
                </div>
              );
            })}
            <Field label="Observations"><input className="field" value={ret.notes} onChange={(e) => setRet({ ...ret, notes: e.target.value })} placeholder="Ex. ne démarre plus" /></Field>
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary" onClick={async () => {
                const items = Object.entries(ret.lines).map(([saleItemId, l]) => ({ saleItemId, quantity: n(l.quantity), condition: l.condition, ...(l.serialIds.length ? { serialIds: l.serialIds } : {}) })).filter((x) => x.quantity > 0);
                if (await run(`/admin/sales/${id}/returns`, { reason: ret.reason, locationId: ret.locationId, notes: ret.notes || undefined, items }, 'Retour enregistré. Le stock est à jour ; enregistrez le remboursement si besoin.')) setRet(null);
              }}>Enregistrer le retour</button>
              <button type="button" className="btn btn-ghost" onClick={() => setRet(null)}>Annuler</button>
            </div>
          </div>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="text-lg mb-2">Historique</h2>
        <ol className="m-0 pl-5 text-sm flex flex-col gap-1">
          {history.map((h, i) => <li key={i}><span className="num">{dateTime.format(new Date(h.at))}</span> : {h.text}{h.by ? `, par ${h.by}` : ''}</li>)}
        </ol>
      </section>
      <Link to="/admin/ventes">Toutes les ventes</Link>

      <ConfirmDialog open={cancelling} title={`Annuler la vente ${s.number} ?`} confirmLabel="Annuler la vente" onCancel={() => setCancelling(false)}
        onConfirm={async () => { if (reason.trim().length >= 3) { setCancelling(false); await run(`/admin/sales/${id}/cancel`, { reason }, 'Vente annulée : le stock affecté est libéré.'); } }}>
        <p className="m-0 mb-3">Le stock affecté redevient disponible. La vente reste dans l'historique. Les paiements encaissés restent : remboursez-les séparément.</p>
        <Field label="Motif (obligatoire)"><input className="field" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </ConfirmDialog>
      <ConfirmDialog open={!!refund} title={`Rembourser sur le paiement ${refund?.payment.reference} ?`} confirmLabel="Enregistrer le remboursement" onCancel={() => setRefund(null)}
        onConfirm={async () => { if (refund.reason.trim().length >= 3 && n(refund.amount) > 0) { const r = refund; setRefund(null); await run(`/admin/payments/${r.payment.id}/refunds`, { amount: n(r.amount), methodCode: r.method, reason: r.reason, ...(r.returnId ? { returnId: r.returnId } : {}) }, 'Remboursement enregistré.'); } }}>
        {refund && <div className="flex flex-col gap-3">
          <p className="m-0">Au plus {formatFCFA(refund.max)}. Un remboursement ne remet jamais de produit en stock : enregistrez d'abord le retour.</p>
          <Field label="Montant"><input className="field num" inputMode="numeric" value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} placeholder={String(refund.max)} /></Field>
          <MethodChips value={refund.method} onChange={(m) => setRefund({ ...refund, method: m })} />
          {s.returns.length > 0 && <Field label="Retour lié"><select className="field" value={refund.returnId} onChange={(e) => setRefund({ ...refund, returnId: e.target.value })}><option value="">Aucun</option>{s.returns.map((r) => <option key={r.id} value={r.id}>{r.number}</option>)}</select></Field>}
          <Field label="Motif (obligatoire)"><input className="field" value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} /></Field>
        </div>}
      </ConfirmDialog>
    </div>
  );
}
