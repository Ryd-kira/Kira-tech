import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { useAuth } from '../auth.jsx';
import { Field, fieldErrors, Notice, PageHeader } from '../ui.jsx';

const EMPTY = { name: '', contactName: '', phone: '', email: '', address: '', notes: '' };

function SupplierForm({ initial, onSaved, onCancel }) {
  const [form, setForm] = useState(initial ? { ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, initial[k] ?? ''])) } : EMPTY);
  const [error, setError] = useState(null);
  const errs = fieldErrors(error);
  async function submit(e) {
    e.preventDefault();
    setError(null);
    try {
      if (initial) await api(`/admin/suppliers/${initial.id}`, { method: 'PATCH', body: form });
      else await api('/admin/suppliers', { method: 'POST', body: form });
      onSaved();
    } catch (err) { setError(err); }
  }
  const input = (k, label, props) => <Field label={label} error={errs[k]}><input className="field" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} {...props} /></Field>;
  return (
    <form onSubmit={submit} className="panel p-5 grid gap-3 sm:grid-cols-2">
      <h2 className="text-lg sm:col-span-2">{initial ? `Modifier ${initial.name}` : 'Nouveau fournisseur'}</h2>
      {error && !error.details && <div className="sm:col-span-2"><Notice kind="error">{error.message}</Notice></div>}
      {input('name', 'Nom', { required: true })}
      {input('contactName', 'Contact')}
      {input('phone', 'Téléphone', { type: 'tel' })}
      {input('email', 'E-mail', { type: 'email' })}
      <div className="sm:col-span-2">{input('address', 'Adresse')}</div>
      <div className="sm:col-span-2">{input('notes', 'Notes')}</div>
      <div className="flex gap-2"><button type="submit" className="btn btn-primary">Enregistrer</button>{onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button>}</div>
    </form>
  );
}

export default function Suppliers() {
  const { can } = useAuth();
  const { data, retry } = useApi('/admin/suppliers');
  const [editing, setEditing] = useState(null);
  return (
    <div className="max-w-[1000px] flex flex-col gap-4">
      <PageHeader title="Fournisseurs" actions={can('suppliers:write') && editing === null && <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>Nouveau fournisseur</button>} />
      {editing && <SupplierForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} onSaved={() => { setEditing(null); retry(); }} onCancel={() => setEditing(null)} />}
      <div className="panel overflow-x-auto">
        <table className="data">
          <thead><tr><th>Nom</th><th>Contact</th><th>Téléphone</th><th className="text-right">Achats</th><th /></tr></thead>
          <tbody>
            {data?.items.length === 0 && <tr><td colSpan={5} className="muted">Aucun fournisseur.</td></tr>}
            {data?.items.map((s) => (
              <tr key={s.id}>
                <td className="font-semibold">{s.name}{!s.isActive && <span className="muted font-normal"> (inactif)</span>}</td>
                <td>{s.contactName}</td>
                <td>{s.phone && <a href={`tel:${s.phone}`}>{s.phone}</a>}</td>
                <td className="num text-right">{s.purchaseCount}</td>
                <td className="text-right">{can('suppliers:write') && <button type="button" className="btn btn-ghost !min-h-9" onClick={() => setEditing(s)}>Modifier</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
