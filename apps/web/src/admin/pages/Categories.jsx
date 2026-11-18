import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { ConfirmDialog, Field, fieldErrors, Notice, PageHeader } from '../ui.jsx';

function CategoryRow({ cat, onSaved, onDelete }) {
  const [form, setForm] = useState({ name: cat.name, description: cat.description ?? '', sortOrder: cat.sortOrder, isActive: cat.isActive });
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(false);
  const errs = fieldErrors(error);
  async function save(e) {
    e.preventDefault();
    setError(null); setOk(false);
    try {
      await api(`/admin/categories/${cat.id}`, { method: 'PATCH', body: { ...form, sortOrder: Number(form.sortOrder) || 0, description: form.description || null } });
      setOk(true); onSaved();
    } catch (err) { setError(err); }
  }
  return (
    <form onSubmit={save} className="panel p-4 grid gap-3 md:grid-cols-[2fr_3fr_90px_auto_auto] items-end">
      <Field label="Nom" error={errs.name}><input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Description courte"><input className="field" value={form.description} maxLength={300} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <Field label="Ordre"><input className="field num" inputMode="numeric" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></Field>
      <label className="flex items-center gap-2 min-h-11 text-[15px]"><input type="checkbox" className="size-4 accent-[#176BFF]" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />Visible</label>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">Enregistrer</button>
        <button type="button" className="btn btn-danger" onClick={() => onDelete(cat)}>Supprimer</button>
      </div>
      <div className="md:col-span-5 text-[13px] muted">{cat.productCount} produit(s), adresse /categories/{cat.slug}{ok && ' : enregistré.'}</div>
      {error && !error.details && <div className="md:col-span-5"><Notice kind="error">{error.message}</Notice></div>}
    </form>
  );
}

export default function Categories() {
  const { data, retry } = useApi('/admin/categories');
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  async function create(e) {
    e.preventDefault();
    setError(null);
    try { await api('/admin/categories', { method: 'POST', body: { name } }); setName(''); retry(); } catch (err) { setError(err); }
  }
  async function remove() {
    setBusy(true);
    try { await api(`/admin/categories/${toDelete.id}`, { method: 'DELETE' }); retry(); } catch (err) { setError(err); }
    setBusy(false); setToDelete(null);
  }
  return (
    <div className="max-w-[1100px] flex flex-col gap-4">
      <PageHeader title="Catégories" subtitle="Elles structurent le catalogue et les filtres du site." />
      <form onSubmit={create} className="panel p-4 flex gap-3 items-end flex-wrap">
        <Field label="Nouvelle catégorie" error={fieldErrors(error).name}><input className="field min-w-[260px]" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <button type="submit" className="btn btn-primary">Ajouter la catégorie</button>
      </form>
      {error && !error.details && <Notice kind="error">{error.message}</Notice>}
      {data?.items.map((c) => <CategoryRow key={c.id + c.name + c.isActive + c.sortOrder} cat={c} onSaved={retry} onDelete={setToDelete} />)}
      <ConfirmDialog open={!!toDelete} title={`Supprimer la catégorie « ${toDelete?.name} » ?`} confirmLabel="Supprimer la catégorie" busy={busy}
        onCancel={() => setToDelete(null)} onConfirm={remove}>
        Possible seulement si elle ne contient aucun produit. Sinon, décochez « Visible ».
      </ConfirmDialog>
    </div>
  );
}
