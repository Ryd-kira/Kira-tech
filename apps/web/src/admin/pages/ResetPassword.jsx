import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../lib/api.js';
import { Field, fieldErrors, Notice } from '../ui.jsx';

// Le jeton arrive après « # » : il n'est jamais envoyé au serveur web ni dans les journaux.
export default function ResetPassword() {
  const token = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const errs = fieldErrors(error);

  async function submit(e) {
    e.preventDefault();
    if (password !== confirm) return;
    setError(null);
    try {
      await api('/admin/auth/reset', { method: 'POST', body: { token, newPassword: password } });
      setDone(true);
      window.history.replaceState(null, '', window.location.pathname);
    } catch (err) { setError(err); }
  }
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={submit} className="panel w-full max-w-[420px] p-7 flex flex-col gap-4">
        <h1 className="text-[22px]">Nouveau mot de passe</h1>
        {!token && !done && <Notice kind="error">Ce lien est incomplet. Demandez un nouveau lien à un super administrateur.</Notice>}
        {done ? (
          <><Notice kind="success">Mot de passe enregistré.</Notice><Link className="btn btn-primary" to="/admin/connexion">Se connecter</Link></>
        ) : (
          <>
            {error && !error.details && <Notice kind="error">{error.message}</Notice>}
            <Field label="Nouveau mot de passe" hint="12 caractères minimum" error={errs.newPassword}><input className="field" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <Field label="Confirmer" error={confirm && confirm !== password ? 'Les deux mots de passe ne correspondent pas.' : null}><input className="field" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
            <button type="submit" className="btn btn-primary" disabled={!token}>Enregistrer</button>
          </>
        )}
      </form>
    </div>
  );
}
