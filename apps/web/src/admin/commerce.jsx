import { useEffect, useState } from 'react';
import { api, toQuery } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { Field } from './ui.jsx';

export const SALE_STATUS = { VALIDATED: 'Validée', CANCELLED: 'Annulée' };
export const PAY_STATUS = { UNPAID: 'Impayée', PARTIALLY_PAID: 'Partiellement payée', PAID: 'Soldée' };
export const PAY_COLORS = { UNPAID: '#B42318', PARTIALLY_PAID: '#8A5A00', PAID: '#0B7A47' };
export const HANDOVER = { NOT_HANDED: 'Non remise', PARTIAL: 'Remise partielle', HANDED: 'Remise effectuée', CANCELLED: 'Annulée' };
export const RES_STATUS = { PENDING: 'En attente', CONFIRMED: 'Confirmée', EXPIRED: 'Expirée', CANCELLED: 'Annulée', CONVERTED: 'Convertie en vente' };
export const FUL_STATUS = { PREPARING: 'En préparation', READY: 'Prête', IN_TRANSIT: 'En cours de livraison', COMPLETED: 'Remise / livrée', FAILED: 'Livraison échouée', RETURNED_TO_STORE: 'Retour en boutique', CANCELLED: 'Annulée' };
export const CHANNEL = { IN_STORE: 'Boutique', DELIVERY: 'Livraison' };
export const RETURN_REASON = { CUSTOMER_RETURN: 'Retour client', DEFECTIVE: 'Produit défectueux', EXCHANGE: 'Échange' };
export const CONDITION = { RESTOCKED: 'Remis en stock', QUARANTINE: 'En quarantaine', DAMAGED: 'Endommagé', NOT_REINTEGRABLE: 'Non réintégrable' };

export function usePaymentMethods() {
  const { data } = useApi('/admin/payments/methods');
  return data?.items ?? [];
}

export function MethodChips({ value, onChange }) {
  const methods = usePaymentMethods();
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Moyen de paiement">
      {methods.map((m) => (
        <button key={m.code} type="button" role="radio" aria-checked={value === m.code} className="chip !min-h-9 !text-sm" aria-pressed={value === m.code} onClick={() => onChange(m.code)}>{m.label}</button>
      ))}
    </div>
  );
}

/** Client : recherche, nouvelle fiche minimale, ou client occasionnel (aucune fiche imposée). */
export function CustomerPicker({ value, onChange }) {
  const [mode, setMode] = useState(value?.newCustomer ? 'new' : value?.customer ? 'existing' : 'walkin');
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  useEffect(() => {
    if (mode !== 'existing' || q.trim().length < 2) { setResults([]); return undefined; }
    const ctrl = new AbortController();
    const t = setTimeout(() => api(`/admin/customers${toQuery({ q, limit: 6 })}`, { signal: ctrl.signal }).then((d) => setResults(d.items)).catch(() => {}), 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, mode]);
  const nc = value?.newCustomer ?? { name: '', phone: '' };
  const setMode2 = (m) => { setMode(m); onChange(m === 'new' ? { newCustomer: { name: '', phone: '' } } : null); };
  return (
    <fieldset className="border-0 p-0 m-0 flex flex-col gap-2">
      <legend className="label mb-2">Client</legend>
      <div className="flex flex-wrap gap-1.5">
        {[['walkin', 'Client occasionnel'], ['existing', 'Client existant'], ['new', 'Nouveau client']].map(([m, l]) => (
          <button key={m} type="button" className="chip !min-h-9 !text-sm" aria-pressed={mode === m} onClick={() => setMode2(m)}>{l}</button>
        ))}
      </div>
      {mode === 'existing' && (value?.customer
        ? <div className="text-sm flex gap-2 items-center"><strong>{value.customer.name}</strong> <span className="num muted">{value.customer.phone}</span>
            <button type="button" className="bg-transparent border-0 text-[#0F5BE0] underline cursor-pointer text-sm" onClick={() => onChange(null)}>changer</button></div>
        : <div className="relative">
            <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom ou téléphone" aria-label="Rechercher un client" />
            {results.length > 0 && (
              <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[#C9D1DD] rounded-md list-none p-1 m-0">
                {results.map((c) => <li key={c.id}><button type="button" className="w-full text-left px-3 py-2 rounded hover:bg-[#F0F4FA] bg-transparent border-0 cursor-pointer" onClick={() => { onChange({ customer: c }); setQ(''); }}>{c.name} <span className="num muted text-[13px]">{c.phone}</span></button></li>)}
              </ul>
            )}
          </div>)}
      {mode === 'new' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Nom"><input className="field" value={nc.name} onChange={(e) => onChange({ newCustomer: { ...nc, name: e.target.value } })} /></Field>
          <Field label="Téléphone"><input className="field" type="tel" value={nc.phone} onChange={(e) => onChange({ newCustomer: { ...nc, phone: e.target.value } })} placeholder="+229…" /></Field>
        </div>
      )}
    </fieldset>
  );
}

export const customerPayload = (v) => (v?.customer ? { customerId: v.customer.id } : v?.newCustomer?.name ? { newCustomer: v.newCustomer } : {});

export function DeliveryFields({ value, onChange }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Field label="Destinataire"><input className="field" value={value.recipientName ?? ''} onChange={set('recipientName')} /></Field>
      <Field label="Téléphone du destinataire"><input className="field" type="tel" value={value.recipientPhone ?? ''} onChange={set('recipientPhone')} /></Field>
      <Field label="Ville"><input className="field" value={value.city ?? ''} onChange={set('city')} /></Field>
      <Field label="Quartier"><input className="field" value={value.district ?? ''} onChange={set('district')} /></Field>
      <div className="sm:col-span-2"><Field label="Adresse et repères"><input className="field" value={value.address ?? ''} onChange={set('address')} /></Field></div>
      <Field label="Livreur ou prestataire (facultatif)"><input className="field" value={value.courierName ?? ''} onChange={set('courierName')} /></Field>
      <Field label="Date prévue (facultatif)"><input className="field" type="date" value={value.scheduledAt ?? ''} onChange={set('scheduledAt')} /></Field>
    </div>
  );
}

export const cleanDelivery = (d) => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== '' && v != null));
