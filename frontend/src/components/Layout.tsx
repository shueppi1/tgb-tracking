import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';

export default function Layout() {
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  return (
    <>
      <header className="shell-header">
        <NavLink to="/" className="brand">
          <img src="/logo.svg" alt="" width={30} height={55} />
          <span>
            <b>TGB</b> Tracking
          </span>
        </NavLink>
        <nav className="shell-nav">
          <NavLink to="/" end>
            Übersicht
          </NavLink>
          <NavLink to="/spiel/neu">Neues Spiel</NavLink>
          <NavLink to="/kader">Kader</NavLink>
          <NavLink to="/archiv">Archiv</NavLink>
          <NavLink to="/statistik">Statistik</NavLink>
          <a
            href="/login"
            onClick={(e) => {
              e.preventDefault();
              logout();
              navigate('/login');
            }}
          >
            Abmelden
          </a>
        </nav>
      </header>
      <main className="page">
        <Outlet />
      </main>
      <footer className="shell-footer">
        <a href="https://tgb-handball.online" target="_blank" rel="noreferrer">
          TGB Darmstadt Handball
        </a>
      </footer>
    </>
  );
}
