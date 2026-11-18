import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { formatFCFA } from '../../lib/format.js';
import { useApi } from '../../lib/useApi.js';
import { useAuth } from '../auth.jsx';
import { cleanDelivery, customerPayload, CustomerPicker, DeliveryFields, MethodChips } from '../commerce.jsx';
import { post, ProductPicker, SerialPicker, useIdempotencyKey } from '../pickers.jsx';
import { Field, fieldErrors, Notice, PageHeader } from '../ui.jsx';

const n = (v) => Number(String(v ?? '').replace(/\s/g, '')) || 0;

// Caisse : la vente, le paiement et la remise sont saisis ensemble mais enregistrés séparément.
export default function Pos() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const exchangeReturnId = useLocation().state?.exchangeReturnId;
  const { data: locs } = useApi('/admin/stock/locations');
  const stores = (locs?.items ?? []).filter((l) => l.isSellable);
  const [locationId, setLocationId] = useState('');
  const loc = locationId || stores[0]?.id;
  const [lines, setLines] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [handover, setHandover] = useState('now');
  const [receivedBy, setReceivedBy] = useState('');
  const [delivery, setDelivery] = useState({});
  const [deliveryFee, setDeliveryFee] = useState('');
  const [payNow, setPayNow] = useState(true);
  const [method, setMethod] = useState('CASH');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [key, renewKey] = useIdempotencyKey();
  const errs = fieldErrors(error);

  const availableAt = (p) => p.levels.find((l) => l.locationId === loc)?.available ?? 0;
  const subtotal = lines.reduce((s, l) => s + l.qty * l.product.price, 0);
  const discount = lines.reduce((s, l) => s + n(l.discount), 0);
  const fee = handover === 'delivery' ? n(deliveryFee) : 0;
  const total = subtotal - discount + fee;
  const paid = payNow ? (amount === '' ? total : n(amount)) : 0;

  function add(p) {
    if (lines.some((l) => l.product.id === p.id)) return setLines(lines.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l)));
    setLines([...lines, { product: p, qty: 1, discount: '', serials: [] }]);
  }
  const update = (i, patch) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    const body = {
      channel: handover === 'delivery' ? 'DELIVERY' : 'IN_STORE', locationId: loc, ...customerPayload(customer), ...(exchangeReturnId ? { exchangeReturnId } : {}),
      items: lines.map((l) => ({ productId: l.product.id, quantity: l.qty, discountAmount: n(l.discount) })),
      ...(handover === 'delivery' ? { deliveryFee: fee } : {}),
      ...(payNow && paid > 0 ? { payment: { amount: paid, methodCode: method, ...(reference ? { externalReference: reference } : {}) } } : {}),
      handover: handover === 'now'
        ? { mode: 'now', receivedByName: receivedBy || customer?.customer?.name || customer?.newCustomer?.name || 'Client', serials: Object.fromEntries(lines.filter((l) => l.product.isSerialized).map((l) => [l.product.id, l.serials])) }
        : handover === 'delivery' ? { mode: 'delivery', delivery: cleanDelivery(delivery) } : { mode: 'later' },
    };
    try {
      const r = await post('/admin/sales', body, key);
      renewKey();
      navigate(`/admin/ventes/${r.id}`, { state: { created: true } });
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  if (!can('sales:write')) return <p className="muted">La caisse n'est pas accessible avec votre rôle.</p>;
  const serialsReady = handover !== 'now' || lines.every((l) => !l.product.isSerialized || l.serials.length === l.qty);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <PageHeader title="Caisse" subtitle="Nouvelle vente en boutique ou avec livraison"
        actions={<label className="label min-w-[220px]">Boutique<select className="field" value={loc ?? ''} onChange={(e) => { setLocationId(e.target.value); setLines([]); }}>{stores.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>} />
      {exchangeReturnId && <Notice kind="warning">Vente d'échange : elle sera liée au retour enregistré. La différence de prix se règle par un paiement ou un remboursement.</Notice>}
      {error && <Notice kind="error">{error.message}{error.details?.length ? ` (${error.details.map((d) => d.message ?? d.field).filter(Boolean).join(', ')})` : ''}</Notice>}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)] items-start">
        <section className="panel p-5 flex flex-col gap-4">
          <ProductPicker label="Rechercher un produit" placeholder="Nom, marque ou référence" onPick={add} />
          {lines.length === 0 && <p className="muted m-0 py-6 text-center">Ajoutez un produit pour commencer la vente.</p>}
          {lines.map((l, i) => {
            const avail = availableAt(l.product);
            return (
              <div key={l.product.id} className="border-b border-[#EEF1F5] pb-3 flex flex-col gap-2">
                <div className="flex gap-3 items-center flex-wrap">
                  <div className="flex-1 min-w-[180px]"><div className="font-semibold">{l.product.name}</div>
                    <div className="num muted text-[13px]">{formatFCFA(l.product.price)} l'unité, {avail} disponible(s) ici</div></div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" className="btn btn-ghost !px-0 w-9 !min-h-9" aria-label={`Diminuer ${l.product.name}`} onClick={() => (l.qty > 1 ? update(i, { qty: l.qty - 1, serials: [] }) : setLines(lines.filter((_, j) => j !== i)))}>-</button>
                    <span className="num w-7 text-center font-semibold">{l.qty}</span>
                    <button type="button" className="btn btn-ghost !px-0 w-9 !min-h-9" aria-label={`Augmenter ${l.product.name}`} disabled={l.qty >= avail} onClick={() => update(i, { qty: l.qty + 1 })}>+</button>
                  </div>
                  <label className="label !text-[12px] w-28">Remise (FCFA)<input className="field num !min-h-9" inputMode="numeric" value={l.discount} onChange={(e) => update(i, { discount: e.target.value })} /></label>
                  <div className="num font-semibold w-32 text-right">{formatFCFA(l.qty * l.product.price - n(l.discount))}</div>
                </div>
                {l.qty > avail && (
                  <span className="text-[13px] text-[#B42318]">
                    Stock insuffisant dans cette boutique.
                    {(() => {
                      const elsewhere = l.product.levels.filter((x) => x.locationId !== loc && x.available > 0).map((x) => `${stores.find((s2) => s2.id === x.locationId)?.name ?? 'autre emplacement'} : ${x.available}`);
                      return elsewhere.length ? ` Disponible ailleurs (${elsewhere.join(', ')}) : changez de boutique ou faites un transfert.` : '';
                    })()}
                  </span>
                )}
                {handover === 'now' && l.product.isSerialized && <SerialPicker productId={l.product.id} locationId={loc} count={l.qty} value={l.serials} onChange={(v) => update(i, { serials: v })} />}
              </div>
            );
          })}
        </section>

        <section className="panel p-5 flex flex-col gap-4">
          <CustomerPicker value={customer} onChange={setCustomer} />
          <fieldset className="border-0 p-0 m-0 flex flex-col gap-2">
            <legend className="label mb-2">Remise du produit</legend>
            <div className="flex flex-wrap gap-1.5">
              {[['now', 'Remis maintenant'], ['later', 'Retrait différé'], ['delivery', 'Livraison']].map(([v, lab]) => (
                <button key={v} type="button" className="chip !min-h-9 !text-sm" aria-pressed={handover === v} onClick={() => setHandover(v)}>{lab}</button>
              ))}
            </div>
            {handover === 'now' && <Field label="Remis à" hint="Nom de la personne qui repart avec le produit"><input className="field" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder={customer?.customer?.name || customer?.newCustomer?.name || 'Client'} /></Field>}
            {handover === 'delivery' && <>
              <DeliveryFields value={delivery} onChange={setDelivery} />
              <Field label="Frais de livraison (FCFA)"><input className="field num" inputMode="numeric" value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} /></Field>
            </>}
          </fieldset>
          <dl className="num m-0 flex flex-col gap-1 text-[15px] border-t border-[#EEF1F5] pt-3">
            <div className="flex justify-between"><dt className="muted">Sous-total</dt><dd className="m-0">{formatFCFA(subtotal)}</dd></div>
            {discount > 0 && <div className="flex justify-between"><dt className="muted">Remises</dt><dd className="m-0">- {formatFCFA(discount)}</dd></div>}
            {fee > 0 && <div className="flex justify-between"><dt className="muted">Livraison</dt><dd className="m-0">{formatFCFA(fee)}</dd></div>}
            <div className="flex justify-between text-[22px] font-bold pt-1" style={{ fontStretch: '112%' }}><dt>Total</dt><dd className="m-0">{formatFCFA(total)}</dd></div>
          </dl>
          <fieldset className="border-0 p-0 m-0 flex flex-col gap-2">
            <legend className="label mb-2">Paiement</legend>
            <label className="flex items-center gap-2 text-[15px]"><input type="checkbox" className="size-4 accent-[#176BFF]" checked={payNow} onChange={(e) => setPayNow(e.target.checked)} />Encaisser maintenant</label>
            {payNow && <>
              <MethodChips value={method} onChange={setMethod} />
              <div className="grid gap-2 grid-cols-2">
                <Field label="Montant reçu" error={errs['payment.amount']} hint={paid < total ? `Reste à payer : ${formatFCFA(total - paid)}` : undefined}>
                  <input className="field num" inputMode="numeric" value={amount} placeholder={String(total)} onChange={(e) => setAmount(e.target.value)} /></Field>
                <Field label="Référence (facultatif)"><input className="field" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="N° Mobile Money" /></Field>
              </div>
            </>}
          </fieldset>
          <button type="submit" className="btn btn-primary !min-h-[52px] !text-base" disabled={busy || !lines.length || !serialsReady || lines.some((l) => l.qty > availableAt(l.product))}>
            {busy ? 'Validation…' : `Valider la vente (${formatFCFA(total)})`}
          </button>
          <p className="muted m-0 text-[13px]">La validation, le paiement et la remise sont enregistrés comme trois événements distincts. Le paiement Mobile Money est déclaré, pas vérifié automatiquement.</p>
          <Link to="/admin/reservations/nouvelle" className="text-sm">Réserver plutôt que vendre</Link>
        </section>
      </div>
    </form>
  );
}
