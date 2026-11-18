import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { useAuth } from '../auth.jsx';
import { ConfirmDialog, Field, fieldErrors, Notice, PageHeader } from '../ui.jsx';

const ROLES = { SUPER_ADMIN: 'Super administrateur', ADMIN: 'Administrateur', GESTIONNAIRE: 'Gestionnaire' };
const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Porto-Novo' });

// Mot de passe provisoire tiré au hasard par le navigateur (jamais par défaut dans le code).
function randomPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function CreateUser({ onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', role: 'ADMIN', temporaryPassword: '' });
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);
  const errs = fieldErrors(error);
  async function submit(e) {
    e.preventDefault();
    setError(null);
    try {
      const u = await api('/admin/users', { method: 'POST', body: form });
      setCreated({ email: u.email, password: form.temporaryPassword });
      setForm({ name: '', email: '', role: 'ADMIN', temporaryPassword: '' });
      onCreated();
    } catch (err) { setError(err); }
  }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <form onSubmit={submit} className="panel p-5 grid gap-4 sm:grid-cols-2">
      <h2 className="text-lg sm:col-span-2">Nouveau compte</h2>
      {created && <div className="sm:col-span-2"><Notice kind="success">Compte créé pour {created.email}. Mot de passe provisoire : <strong className="num">{created.password}</strong>. Transmettez-le en main propre ; il devra être changé à la première connexion.</Notice></div>}
      {error && !error.details && <div className="sm:col-span-2"><Notice kind="error">{error.message}</Notice></div>}
      <Field label="Nom complet" error={errs.name}><input className="field" value={form.name} onChange={set('name')} required /></Field>
      <Field label="E-mail" error={errs.email}><input className="field" type="email" value={form.email} onChange={set('email')} required /></Field>
      <Field label="Rôle"><select className="field" value={form.role} onChange={set('role')}>{Object.entries(ROLES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      <Field label="Mot de passe provisoire" error={errs.temporaryPassword} hint="12 caractères minimum">
        <div className="flex gap-2"><input className="field num" value={form.temporaryPassword} onChange={set('temporaryPassword')} required minLength={12} />
          <button type="button" className="btn btn-ghost" onClick={() => setForm({ ...form, temporaryPassword: randomPassword() })}>Générer</button></div>
      </Field>
      <button type="submit" className="btn btn-primary self-start">Créer le compte</button>
    </form>
  );
}

export default function Users() {
  const { user: me } = useAuth();
  const { data, retry } = useApi('/admin/users');
  const [error, setError] = useState(null);
  const [link, setLink] = useState(null);

  async function act(fn) { setError(null); try { await fn(); retry(); } catch (err) { setError(err); } }
  const changeRole = (u, role) => act(() => api(`/admin/users/${u.id}`, { method: 'PATCH', body: { role } }));
  const [toDeactivate, setToDeactivate] = useState(null);
  const [reason, setReason] = useState('');
  const deactivate = (u) => { setReason(''); setToDeactivate(u); };
  const confirmDeactivate = () => {
    if (reason.trim().length < 3) return;
    const u = toDeactivate;
    setToDeactivate(null);
    act(() => api(`/admin/users/${u.id}/deactivate`, { method: 'POST', body: { reason } }));
  };
  const reactivate = (u) => act(() => api(`/admin/users/${u.id}/reactivate`, { method: 'POST', body: {} }));
  const resetLink = (u) => act(async () => { const r = await api(`/admin/users/${u.id}/reset-link`, { method: 'POST', body: {} }); setLink({ name: u.name, ...r }); });

  return (
    <div className="max-w-[1100px] flex flex-col gap-5">
      <PageHeader title="Administrateurs" subtitle="Chaque personne a son propre compte. Les permissions sont vérifiées par le serveur." />
      {error && <Notice kind="error">{error.message}</Notice>}
      {link && (
        <Notice kind="warning">
          Lien de réinitialisation pour {link.name}, valable 30 minutes et utilisable une seule fois. Il ne sera plus affiché :
          <input className="field num mt-2" readOnly value={link.url} onFocus={(e) => e.target.select()} aria-label="Lien de réinitialisation" />
        </Notice>
      )}
      <div className="panel overflow-x-auto">
        <table className="data">
          <thead><tr><th>Nom</th><th>Rôle</th><th>Statut</th><th>Dernière connexion</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {data?.items.map((u) => (
              <tr key={u.id}>
                <td><div className="font-semibold">{u.name}{u.id === me.id && <span className="muted font-normal"> (vous)</span>}</div><div className="muted text-[13px]">{u.email}</div></td>
                <td>
                  <select className="field !min-h-9 !w-auto" value={u.role} disabled={u.id === me.id} onChange={(e) => changeRole(u, e.target.value)} aria-label={`Rôle de ${u.name}`}>
                    {Object.entries(ROLES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </td>
                <td>{u.isActive ? (u.mustChangePassword ? 'Mot de passe à changer' : 'Actif') : <span className="text-[#B42318]">Désactivé</span>}</td>
                <td className="num muted">{u.lastLoginAt ? dateFmt.format(new Date(u.lastLoginAt)) : 'Jamais'}</td>
                <td className="whitespace-nowrap text-right">
                  {u.id !== me.id && (u.isActive
                    ? <><button type="button" className="btn btn-ghost !min-h-9 mr-2" onClick={() => resetLink(u)}>Lien de réinitialisation</button><button type="button" className="btn btn-danger !min-h-9" onClick={() => deactivate(u)}>Désactiver</button></>
                    : <button type="button" className="btn btn-ghost !min-h-9" onClick={() => reactivate(u)}>Réactiver</button>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CreateUser onCreated={retry} />
      <ConfirmDialog open={!!toDeactivate} title={`Désactiver le compte de ${toDeactivate?.name} ?`} confirmLabel="Désactiver le compte"
        onCancel={() => setToDeactivate(null)} onConfirm={confirmDeactivate}>
        <p className="m-0 mb-3">La personne est déconnectée immédiatement. Le compte peut être réactivé plus tard.</p>
        <Field label="Motif (obligatoire)"><input className="field" value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} /></Field>
      </ConfirmDialog>
    </div>
  );
}
