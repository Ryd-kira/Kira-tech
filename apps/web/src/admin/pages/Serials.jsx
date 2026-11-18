import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toQuery } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { BUCKET_LABELS, dateOnly, dateTime, MOVEMENT_LABELS } from '../pickers.jsx';
import { Notice, PageHeader } from '../ui.jsx';

export const SERIAL_STATUS = { IN_STOCK: 'En stock', RESERVED: 'Réservé', ALLOCATED: 'Affecté à une vente', IN_TRANSIT: 'En transit', DELIVERED: 'Remis au client', QUARANTINE: 'En quarantaine', DAMAGED: 'Endommagé', LOST: 'Perdu' };

export function SerialSearch() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const { data } = useApi(`/admin/stock/serials${toQuery({ q: query, limit: 100 })}`);
  return (
    <div className="max-w-[1000px] flex flex-col gap-4">
      <PageHeader title="Numéros de série" subtitle="Retrouver un appareil : d'où il vient, où il est, à qui il a été vendu." />
      <form onSubmit={(e) => { e.preventDefault(); setQuery(q); }} className="flex gap-2 items-end">
        <label className="label flex-1 max-w-[420px]">Numéro de série<input className="field num" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <button type="submit" className="btn btn-primary">Rechercher</button>
      </form>
      <div className="panel overflow-x-auto">
        <table className="data">
          <thead><tr><th>Numéro</th><th>Produit</th><th>Statut</th><th>Emplacement</th><th>Entré le</th></tr></thead>
          <tbody>
            {data?.items.length === 0 && <tr><td colSpan={5} className="muted">Aucun appareil trouvé.</td></tr>}
            {data?.items.map((s) => (
              <tr key={s.id}>
                <td><Link to={`/admin/series/${s.id}`} className="num font-semibold">{s.serialNumber}</Link></td>
                <td>{s.product.name}</td><td>{SERIAL_STATUS[s.status]}</td><td>{s.location?.name ?? '-'}</td>
                <td className="num">{dateOnly.format(new Date(s.receivedAt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SerialDetail() {
  const { id } = useParams();
  const { data: s, error } = useApi(`/admin/stock/serials/${id}`);
  if (error) return <Notice kind="error">{error.message}</Notice>;
  if (!s) return <p className="muted">Chargement…</p>;
  const facts = [
    ['Produit', `${s.product.name} (${s.product.sku})`], ['Statut', SERIAL_STATUS[s.status]], ['Emplacement', s.location?.name ?? '-'],
    ['Fournisseur', s.supplier?.name ?? '-'], ['Entré le', dateOnly.format(new Date(s.receivedAt))],
    ['Client', s.customer ? `${s.customer.name}, ${s.customer.phone}` : '-'], ['Fin de garantie', s.warrantyEndsAt ? dateOnly.format(new Date(s.warrantyEndsAt)) : '-'],
  ];
  return (
    <div className="max-w-[900px] flex flex-col gap-4">
      <PageHeader title={`Appareil ${s.serialNumber}`} />
      <dl className="panel p-5 m-0 grid gap-x-6 gap-y-2 grid-cols-[auto_1fr] text-[15px]">
        {facts.map(([k, v]) => <div key={k} className="contents"><dt className="muted">{k}</dt><dd className="m-0">{v}</dd></div>)}
      </dl>
      <section className="panel overflow-x-auto">
        <h2 className="text-lg px-5 pt-4">Historique des mouvements</h2>
        <table className="data">
          <thead><tr><th>Date</th><th>Mouvement</th><th>Emplacement</th><th>Compteur</th><th>Par</th></tr></thead>
          <tbody>{s.movements.map((m) => (
            <tr key={m.id}><td className="num">{dateTime.format(new Date(m.createdAt))}</td><td>{MOVEMENT_LABELS[m.type]}</td><td>{m.location.name}</td>
              <td>{BUCKET_LABELS[m.bucket]} {m.quantityDelta > 0 ? '+1' : '-1'}</td><td>{m.adminUser.name}</td></tr>
          ))}</tbody>
        </table>
      </section>
      <Link to="/admin/series">Tous les numéros de série</Link>
    </div>
  );
}
