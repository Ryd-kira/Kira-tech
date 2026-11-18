import { useState } from 'react';
import { toQuery } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { dateTime } from '../pickers.jsx';
import { PageHeader, Pager } from '../ui.jsx';
import { AUDIT_LABELS } from './Overview.jsx';

const ENTITIES = ['Product', 'Sale', 'Payment', 'Refund', 'StockReservation', 'SaleFulfillment', 'Return', 'Purchase', 'StockTransfer', 'AdminUser', 'SiteSetting', 'Category', 'Customer', 'Supplier', 'Report'];

function Values({ v }) {
  if (v == null) return null;
  return <code className="text-[12px] break-all whitespace-pre-wrap">{JSON.stringify(v)}</code>;
}

export default function AuditLog() {
  const [f, setF] = useState({ action: '', entityType: '', from: '', to: '', page: 1 });
  const { data } = useApi(`/admin/audit-logs${toQuery({ ...f, to: f.to ? `${f.to}T23:59:59` : '', limit: 50 })}`);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value, page: 1 });
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Journal d'activité" subtitle="Toutes les actions sensibles, avec leur auteur. Personne ne peut modifier ni effacer ce journal." />
      <div className="flex flex-wrap gap-3 items-end">
        <label className="label">Action commence par<input className="field" value={f.action} onChange={set('action')} placeholder="Ex. sale, payment, auth" /></label>
        <label className="label">Élément<select className="field" value={f.entityType} onChange={set('entityType')}><option value="">Tous</option>{ENTITIES.map((e) => <option key={e}>{e}</option>)}</select></label>
        <label className="label">Du<input className="field" type="date" value={f.from} onChange={set('from')} /></label>
        <label className="label">Au<input className="field" type="date" value={f.to} onChange={set('to')} /></label>
      </div>
      <div className="panel overflow-x-auto">
        <table className="data">
          <thead><tr><th>Date</th><th>Par</th><th>Action</th><th>Élément</th><th>Avant</th><th>Après</th><th>Motif</th></tr></thead>
          <tbody>
            {data?.items.length === 0 && <tr><td colSpan={7} className="muted">Aucune entrée.</td></tr>}
            {data?.items.map((a) => (
              <tr key={a.id} className="align-top">
                <td className="num whitespace-nowrap">{dateTime.format(new Date(a.createdAt))}</td>
                <td>{a.adminUser?.name ?? <span className="muted">Inconnu</span>}{a.ip && <div className="muted text-[12px] num">{a.ip}</div>}</td>
                <td>{AUDIT_LABELS[a.action] ?? a.action}<div className="muted num text-[11px]">{a.action}</div></td>
                <td className="text-[13px]">{a.entityType}<div className="muted num text-[11px]">{a.entityId}</div></td>
                <td className="max-w-[260px]"><Values v={a.oldValues} /></td>
                <td className="max-w-[260px]"><Values v={a.newValues} /></td>
                <td className="text-[13px]">{a.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager data={data} page={f.page} onPage={(page) => setF({ ...f, page })} />
      </div>
    </div>
  );
}
