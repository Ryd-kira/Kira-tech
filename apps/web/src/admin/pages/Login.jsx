import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth.jsx';
import { Field, Notice } from '../ui.jsx';

export default function Login() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  if (status === 'in') return <Navigate to={location.state?.from ?? '/admin'} replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await login(email, password);
      navigate(me.user.mustChangePassword ? '/admin/mot-de-passe' : (location.state?.from ?? '/admin'), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={submit} className="panel w-full max-w-[400px] p-7 flex flex-col gap-4">
        <div>
          <div className="font-extrabold text-xl" style={{ fontStretch: '125%' }}>KIRA TECH</div>
          <h1 className="text-[22px] mt-2">Connexion à l'administration</h1>
        </div>
        {error && <Notice kind="error">{error.message}</Notice>}
        <Field label="E-mail"><input className="field" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Mot de passe"><input className="field" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
        <p className="muted text-[13px] m-0">Mot de passe oublié : demandez un lien de réinitialisation à un super administrateur.</p>
      </form>
    </div>
  );
}
