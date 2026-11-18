import { useEffect, useState } from 'react';
import { api, toQuery } from '../lib/api.js';

// Clé d'idempotence : la même tant que l'opération n'a pas abouti (un double clic ou une
// nouvelle tentative après coupure réseau ne crée pas un deuxième mouvement).
export function useIdempotencyKey() {
  const [key, setKey] = useState(() => crypto.randomUUID());
  return [key, () => setKey(crypto.randomUUID())];
}

export function post(path, body, key) {
  return api(path, { method: 'POST', body: body ?? {}, idempotencyKey: key });
}

// Recherche d'un produit avec ses quantités par emplacement.
export function ProductPicker({ onPick, label = 'Produit', placeholder = 'Nom, marque ou référence' }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setItems([]); return undefined; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api(`/admin/stock/levels${toQuery({ q, limit: 8 })}`, { signal: ctrl.signal }).then((d) => { setItems(d.items); setOpen(true); }).catch(() => {});
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);
  return (
    <div className="relative">
      <label className="label">{label}
        <input className="field" value={q} placeholder={placeholder} onChange={(e) => setQ(e.target.value)} onFocus={() => items.length && setOpen(true)}
          role="combobox" aria-expanded={open} aria-controls="product-options" aria-autocomplete="list" />
      </label>
      {open && items.length > 0 && (
        <ul id="product-options" role="listbox" className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[#C9D1DD] rounded-md shadow-sm max-h-72 overflow-auto list-none p-1 m-0">
          {items.map((p) => (
            <li key={p.id} role="option" aria-selected="false">
              <button type="button" className="w-full text-left px-3 py-2 rounded hover:bg-[#F0F4FA] bg-transparent border-0 cursor-pointer"
                onClick={() => { onPick(p); setQ(''); setItems([]); setOpen(false); }}>
                <span className="font-semibold">{p.name}</span> <span className="num muted text-[13px]">{p.sku}</span>
                <span className="block muted text-[13px]">{p.sellable} disponible(s) à la vente{p.isSerialized ? ', suivi par numéro de série' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Sélection des appareils (numéros de série) présents à un emplacement.
export function SerialPicker({ productId, locationId, status = 'IN_STOCK', count, value, onChange }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (!productId || !locationId) return;
    api(`/admin/stock/serials${toQuery({ productId, locationId, status, limit: 200 })}`).then((d) => setItems(d.items)).catch(() => setItems([]));
  }, [productId, locationId, status]);
  if (!items) return <p className="muted text-sm m-0">Chargement des numéros de série…</p>;
  if (!items.length) return <p className="text-sm m-0 text-[#B42318]">Aucun appareil disponible à cet emplacement.</p>;
  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <fieldset className="border border-[#DDE3EC] rounded-md p-3 m-0">
      <legend className="text-[13px] font-semibold px-1">Appareils ({value.length} sur {count} sélectionné(s))</legend>
      <div className="flex flex-wrap gap-2">
        {items.map((s) => (
          <label key={s.id} className="chip !min-h-9 !text-sm cursor-pointer" style={value.includes(s.id) ? { background: '#176BFF', color: '#fff', borderColor: '#176BFF' } : undefined}>
            <input type="checkbox" className="sr-only" checked={value.includes(s.id)} onChange={() => toggle(s.id)} disabled={!value.includes(s.id) && value.length >= count} />
            <span className="num">{s.serialNumber}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export const MOVEMENT_LABELS = {
  PURCHASE_RECEIPT: 'Réception achat', RESERVATION: 'Réservation', RESERVATION_RELEASE: 'Fin de réservation', RESERVATION_TO_SALE: 'Réservation vers vente',
  SALE_ALLOCATION: 'Affectation à une vente', SALE_ALLOCATION_RELEASE: 'Annulation de vente', SALE_HANDOVER: 'Remise au client',
  DISPATCH_TO_TRANSIT: 'Remise au livreur', DELIVERY_COMPLETED: 'Livraison confirmée', DELIVERY_RETURNED: 'Retour de livraison',
  CUSTOMER_RETURN: 'Retour client', EXCHANGE: 'Échange', ADJUSTMENT_IN: 'Ajustement positif', ADJUSTMENT_OUT: 'Ajustement négatif',
  DAMAGE: 'Endommagé', LOSS: 'Perte', QUARANTINE_RELEASE: 'Sortie de quarantaine', TRANSFER_OUT: 'Transfert : départ', TRANSFER_IN: 'Transfert : arrivée',
};
export const BUCKET_LABELS = { ON_HAND: 'Physique', RESERVED: 'Réservé', ALLOCATED: 'Affecté', QUARANTINE: 'Quarantaine', DAMAGED: 'Endommagé' };
export const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Porto-Novo' });
export const dateOnly = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Africa/Porto-Novo' });
