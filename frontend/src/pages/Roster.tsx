import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type { Player, Position } from '../domain/types';

interface FormState {
  firstName: string;
  lastName: string;
  displayName: string;
  number: string;
  position: Position;
}

const EMPTY: FormState = { firstName: '', lastName: '', displayName: '', number: '', position: 'field' };

const POSITION_LABEL: Record<Position, string> = { field: 'Spieler', goalkeeper: 'Torwart' };

export default function Roster() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editing, setEditing] = useState<Player | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(
    () => api<{ players: Player[] }>('/players').then((res) => setPlayers(res.players)),
    [],
  );

  useEffect(() => {
    reload().catch((err: Error) => setError(err.message));
  }, [reload]);

  function startEdit(p: Player) {
    setEditing(p);
    setForm({
      firstName: p.firstName,
      lastName: p.lastName,
      displayName: p.displayName,
      number: String(p.number),
      position: p.position,
    });
    window.scrollTo({ top: 0 });
  }

  function cancelEdit() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = { ...form, number: Number(form.number) };
    try {
      if (editing) {
        await api(`/players/${editing.id}`, { method: 'PATCH', body: payload });
      } else {
        await api('/players', { method: 'POST', body: payload });
      }
      await reload();
      cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(p: Player) {
    setError(null);
    try {
      await api(`/players/${p.id}`, { method: 'PATCH', body: { active: !p.active } });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Änderung fehlgeschlagen.');
    }
  }

  const active = players.filter((p) => p.active);
  const inactive = players.filter((p) => !p.active);

  const field = (key: keyof FormState, label: string, extra: Record<string, unknown> = {}) => (
    <div>
      <label htmlFor={`f-${key}`}>{label}</label>
      <input
        id={`f-${key}`}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        required
        {...extra}
      />
    </div>
  );

  return (
    <>
      <h1>Kader</h1>
      <form className="card" onSubmit={submit}>
        <h2>{editing ? `Bearbeiten: ${editing.displayName}` : 'Neuer Spieler'}</h2>
        <div className="grid-form">
          {field('firstName', 'Vorname')}
          {field('lastName', 'Nachname')}
          {field('displayName', 'Anzeigename', { maxLength: 60 })}
          {field('number', 'Rückennummer', { inputMode: 'numeric', pattern: '[0-9]{1,2}' })}
          <div>
            <label htmlFor="f-position">Position</label>
            <select
              id="f-position"
              value={form.position}
              onChange={(e) => setForm({ ...form, position: e.target.value as Position })}
            >
              <option value="field">Spieler</option>
              <option value="goalkeeper">Torwart</option>
            </select>
          </div>
        </div>
        {error && <p className="error" style={{ marginTop: '0.75rem' }}>{error}</p>}
        <div className="row" style={{ marginTop: '0.75rem' }}>
          <button type="submit" className="primary" disabled={busy}>
            {editing ? 'Speichern' : 'Anlegen'}
          </button>
          {editing && (
            <button type="button" className="ghost" onClick={cancelEdit}>
              Abbrechen
            </button>
          )}
        </div>
      </form>

      <PlayerTable title="Aktiver Kader" players={active} onEdit={startEdit} onToggle={toggleActive} />
      {inactive.length > 0 && (
        <PlayerTable title="Inaktiv" players={inactive} onEdit={startEdit} onToggle={toggleActive} />
      )}
    </>
  );
}

function PlayerTable({
  title,
  players,
  onEdit,
  onToggle,
}: {
  title: string;
  players: Player[];
  onEdit(p: Player): void;
  onToggle(p: Player): void;
}) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {players.length === 0 ? (
        <p className="muted">Noch keine Spieler angelegt.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="left">Nr</th>
                <th className="left">Anzeigename</th>
                <th className="left">Name</th>
                <th className="left">Position</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id}>
                  <td className="left">{p.number}</td>
                  <td className="left">
                    <strong>{p.displayName}</strong>
                  </td>
                  <td className="left">
                    {p.firstName} {p.lastName}
                  </td>
                  <td className="left">{POSITION_LABEL[p.position]}</td>
                  <td>
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <button type="button" className="small" onClick={() => onEdit(p)}>
                        Bearbeiten
                      </button>
                      <button type="button" className={`small ${p.active ? 'danger' : ''}`} onClick={() => onToggle(p)}>
                        {p.active ? 'Deaktivieren' : 'Aktivieren'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
