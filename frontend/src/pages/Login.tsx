import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';

export default function Login() {
  const { token, login } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  if (token) return <Navigate to={from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-hero">
        <img src="/logo.svg" alt="" width={65} height={119} />
        <h1 className="brand">
          <b>TGB</b> Tracking
        </h1>
      </div>
      <form className="card brand-top" onSubmit={submit}>
        <p className="muted">Bitte mit dem Team-Passwort anmelden.</p>
        <label htmlFor="password">Passwort</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {error && <p className="error" style={{ marginTop: '0.5rem' }}>{error}</p>}
        <button type="submit" className="primary" style={{ marginTop: '1rem', width: '100%' }} disabled={busy}>
          Anmelden
        </button>
      </form>
    </div>
  );
}
