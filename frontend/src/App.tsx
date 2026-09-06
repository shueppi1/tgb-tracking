import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import Archive from './pages/Archive';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import NewMatch from './pages/NewMatch';
import Result from './pages/Result';
import Roster from './pages/Roster';
import SeasonStats from './pages/SeasonStats';
import Track from './pages/Track';
import { useAuth } from './store/auth';

function RequireAuth() {
  const token = useAuth((s) => s.token);
  const location = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth />}>
          <Route path="/spiel/:id" element={<Track />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/kader" element={<Roster />} />
            <Route path="/spiel/neu" element={<NewMatch />} />
            <Route path="/spiel/:id/auswertung" element={<Result />} />
            <Route path="/archiv" element={<Archive />} />
            <Route path="/statistik" element={<SeasonStats />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
