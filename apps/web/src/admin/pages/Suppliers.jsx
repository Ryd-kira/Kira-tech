import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { useAuth } from '../auth.jsx';
import { ConfirmDialog, Field, fieldErrors, Notice, PageHeader } from '../ui.jsx';

const EMPTY = { name: '', contactName: '', phone: '', email: '', address: '', notes: '' };

function SupplierForm({ initial, onSaved, onCancel }) {
  const [form, setForm] = useState(initial ? { ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, initial[k] ?? ''])) } : EMPTY);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [error, setError] = useState(null);
  const errs = fieldErrors(error);
  async function submit(e) {
    e.preventDefault();
    setError(null);
    try {
      if (initial) await api(`/admin/suppliers/${initial.id}`, { method: 'PATCH', body: { ...form, isActive } });
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
      {initial && (
        <label className="flex items-start gap-2.5 text-[15px] sm:col-span-2">
          <input type="checkbox" className="mt-1 size-4 accent-[#176BFF]" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          <span>Fournisseur actif<span className="block muted text-[13px]">Décochez pour ne plus le proposer dans les nouvelles commandes ; son historique est conservé.</span></span>
        </label>
      )}
      <div className="flex gap-2"><button type="submit" className="btn btn-primary">Enregistrer</button>{onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button>}</div>
    </form>
  );
}

export default function Suppliers() {
  const { can } = useAuth();
  const { data, retry } = useApi('/admin/suppliers');
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [state, setState] = useState({});
  async function remove() {
    setState({ busy: true });
    try { await api(`/admin/suppliers/${toDelete.id}`, { method: 'DELETE' }); setState({ ok: `${toDelete.name} supprimé.` }); retry(); }
    catch (error) { setState({ error }); }
    setToDelete(null);
  }
  return (
    <div className="max-w-[1000px] flex flex-col gap-4">
      <PageHeader title="Fournisseurs" actions={can('suppliers:write') && editing === null && <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>Nouveau fournisseur</button>} />
      {editing && <SupplierForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} onSaved={() => { setEditing(null); retry(); }} onCancel={() => setEditing(null)} />}
      {state.ok && <Notice kind="success">{state.ok}</Notice>}
      {state.error && <Notice kind="error">{state.error.message}</Notice>}
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
                <td className="text-right whitespace-nowrap">
                  {can('suppliers:write') && <button type="button" className="btn btn-ghost !min-h-9" onClick={() => setEditing(s)}>Modifier</button>}
                  {can('suppliers:delete') && s.purchaseCount === 0 && <button type="button" className="btn btn-danger !min-h-9 ml-2" onClick={() => { setState({}); setToDelete(s); }}>Supprimer</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog open={!!toDelete} title={`Supprimer le fournisseur « ${toDelete?.name} » ?`} confirmLabel="Supprimer le fournisseur" busy={state.busy}
        onCancel={() => setToDelete(null)} onConfirm={remove}>
        Sa fiche est supprimée définitivement. Un fournisseur avec des commandes ne peut pas être supprimé : modifiez-le et marquez-le inactif.
      </ConfirmDialog>
    </div>
  );
}
