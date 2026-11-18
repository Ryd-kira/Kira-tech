import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../lib/api.js';
import { useAuth } from '../auth.jsx';
import { Field, fieldErrors, Notice, PageHeader } from '../ui.jsx';

export default function ChangePassword() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const errs = fieldErrors(error);
  const mismatch = form.confirm && form.confirm !== form.newPassword;

  async function submit(e) {
    e.preventDefault();
    if (mismatch) return;
    setError(null);
    try {
      await api('/admin/auth/password', { method: 'POST', body: { currentPassword: form.currentPassword, newPassword: form.newPassword } });
      setDone(true);
      const wasForced = user.mustChangePassword;
      await refresh();
      if (wasForced) navigate('/admin', { replace: true });
    } catch (err) { setError(err); }
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div className="max-w-[460px]">
      <PageHeader title="Changer mon mot de passe" subtitle={user.mustChangePassword ? 'Choisissez votre propre mot de passe avant de continuer.' : 'Vos autres sessions ouvertes seront fermées.'} />
      <form onSubmit={submit} className="panel p-6 flex flex-col gap-4">
        {done && <Notice kind="success">Mot de passe modifié.</Notice>}
        {error && !error.details && <Notice kind="error">{error.message}</Notice>}
        <Field label="Mot de passe actuel"><input className="field" type="password" autoComplete="current-password" required value={form.currentPassword} onChange={set('currentPassword')} /></Field>
        <Field label="Nouveau mot de passe" hint="12 caractères minimum" error={errs.newPassword}><input className="field" type="password" autoComplete="new-password" minLength={12} required value={form.newPassword} onChange={set('newPassword')} aria-invalid={!!errs.newPassword} /></Field>
        <Field label="Confirmer le nouveau mot de passe" error={mismatch ? 'Les deux mots de passe ne correspondent pas.' : null}><input className="field" type="password" autoComplete="new-password" required value={form.confirm} onChange={set('confirm')} aria-invalid={!!mismatch} /></Field>
        <button type="submit" className="btn btn-primary self-start">Enregistrer le mot de passe</button>
      </form>
    </div>
  );
}
