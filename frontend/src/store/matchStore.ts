import { create } from 'zustand';
import { api, ApiError, isNetworkError } from '../api/client';
import type { ClockAction } from '../domain/clock';
import { applyOp, applyOps, newId, type Op } from '../domain/ops';
import type { Half, Match, MatchEvent } from '../domain/types';
import { Outbox } from './outbox';
import { readJson, safeStorage, writeJson } from './storage';

export type SyncStatus = 'synced' | 'pending' | 'offline' | 'error';

const SNAPSHOT_PREFIX = 'tgb.match.';
const BATCH_SIZE = 50;
const MIN_RETRY_MS = 2_000;
const MAX_RETRY_MS = 30_000;

interface OpsResponse {
  applied: string[];
  rejected: { opId: string; error: string }[];
  match: Match;
}

interface MatchStore {
  matchId: string | null;
  match: Match | null;
  loading: boolean;
  loadError: string | null;
  sync: SyncStatus;
  pendingCount: number;
  /** Last server-side rejection or sync error, for the UI to show once. */
  notice: string | null;

  load(matchId: string): Promise<void>;
  addEvent(type: string, playerId: string | null, half: Half, clockSeconds: number): void;
  deleteEvent(eventId: string): void;
  undo(): MatchEvent | null;
  clock(action: ClockAction, seconds?: number, half?: Half): void;
  flush(): Promise<void>;
  finish(): Promise<Match>;
  dismissNotice(): void;
  reset(): void;
}

let outbox: Outbox | null = null;
let flushing = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = MIN_RETRY_MS;

function snapshotKey(matchId: string): string {
  return `${SNAPSHOT_PREFIX}${matchId}`;
}

function saveSnapshot(match: Match): void {
  writeJson(safeStorage(), snapshotKey(match.id), match);
}

export function loadSnapshot(matchId: string): Match | null {
  return readJson<Match>(safeStorage(), snapshotKey(matchId));
}

function clearLocal(matchId: string): void {
  safeStorage().removeItem(snapshotKey(matchId));
  outbox?.clear();
}

/** Running matches cached on this device — lets the dashboard resume while offline. */
export function localRunningMatches(): Match[] {
  const storage = safeStorage();
  const out: Match[] = [];
  for (const key of storage.keys()) {
    if (!key.startsWith(SNAPSHOT_PREFIX)) continue;
    const match = readJson<Match>(storage, key);
    if (match?.status === 'running') out.push(match);
  }
  return out.sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff));
}

function scheduleRetry(flush: () => Promise<void>): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flush();
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
}

export const useMatchStore = create<MatchStore>((set, get) => {
  function commitLocal(match: Match): void {
    saveSnapshot(match);
    set({ match, pendingCount: outbox?.size() ?? 0 });
  }

  function enqueue(op: Op): void {
    const { match } = get();
    if (!match || !outbox) return;
    if (match.status !== 'running') {
      set({ notice: 'Das Spiel ist bereits beendet.' });
      return;
    }
    const next = applyOp(match, op);
    outbox.push(op);
    commitLocal(next);
    set({ sync: get().sync === 'offline' ? 'offline' : 'pending' });
    void get().flush();
  }

  return {
    matchId: null,
    match: null,
    loading: false,
    loadError: null,
    sync: 'synced',
    pendingCount: 0,
    notice: null,

    async load(matchId) {
      get().reset();
      outbox = new Outbox(matchId);
      const snapshot = loadSnapshot(matchId);
      set({
        matchId,
        match: snapshot,
        loading: true,
        loadError: null,
        pendingCount: outbox.size(),
        sync: outbox.size() ? 'pending' : 'synced',
      });
      try {
        const res = await api<{ match: Match }>(`/matches/${matchId}`);
        if (get().matchId !== matchId) return; // navigated away meanwhile
        const merged = applyOps(res.match, outbox.load());
        commitLocal(merged);
        set({ loading: false, sync: outbox.size() ? 'pending' : 'synced' });
        void get().flush();
      } catch (err) {
        if (get().matchId !== matchId) return;
        if (isNetworkError(err)) {
          set({
            loading: false,
            sync: 'offline',
            loadError: snapshot ? null : 'Keine Verbindung und keine lokale Kopie des Spiels.',
          });
          if (snapshot) scheduleRetry(get().flush);
        } else {
          set({
            loading: false,
            sync: 'error',
            loadError: err instanceof Error ? err.message : 'Spiel konnte nicht geladen werden.',
          });
        }
      }
    },

    addEvent(type, playerId, half, clockSeconds) {
      enqueue({
        opId: newId(),
        kind: 'add_event',
        event: {
          eventId: newId(),
          type,
          half,
          clockSeconds,
          playerId,
          recordedAt: new Date().toISOString(),
        },
      });
    },

    deleteEvent(eventId) {
      enqueue({ opId: newId(), kind: 'delete_event', eventId });
    },

    undo() {
      const { match } = get();
      const last = match?.events.at(-1);
      if (!last) return null;
      get().deleteEvent(last.eventId);
      return last;
    },

    clock(action, seconds, half) {
      enqueue({ opId: newId(), kind: 'clock', action, at: new Date().toISOString(), seconds, half });
    },

    async flush() {
      const { matchId } = get();
      if (!outbox || !matchId || flushing) return;
      if (outbox.size() === 0) {
        set({ sync: 'synced', pendingCount: 0 });
        return;
      }
      flushing = true;
      try {
        while (outbox.size() > 0 && get().matchId === matchId) {
          const ops = outbox.peek(BATCH_SIZE);
          const res = await api<OpsResponse>(`/matches/${matchId}/ops`, {
            method: 'POST',
            body: { ops },
          });
          outbox.ack([...res.applied, ...res.rejected.map((r) => r.opId)]);
          if (res.rejected.length) {
            set({ notice: `Vom Server abgelehnt: ${res.rejected[0].error}` });
          }
          commitLocal(applyOps(res.match, outbox.load()));
        }
        retryDelay = MIN_RETRY_MS;
        set({ sync: outbox.size() ? 'pending' : 'synced', pendingCount: outbox.size() });
      } catch (err) {
        if (isNetworkError(err)) {
          set({ sync: 'offline' });
          scheduleRetry(get().flush);
        } else if (err instanceof ApiError && err.status === 409) {
          // Match was finished elsewhere: drop the queue, reload the server state.
          outbox.clear();
          set({ sync: 'error', notice: err.message, pendingCount: 0 });
          void get().load(matchId);
        } else {
          set({ sync: 'error', notice: err instanceof Error ? err.message : 'Sync-Fehler.' });
          scheduleRetry(get().flush);
        }
      } finally {
        flushing = false;
      }
    },

    async finish() {
      const { matchId } = get();
      if (!matchId) throw new Error('Kein Spiel geladen.');
      await get().flush();
      if (outbox && outbox.size() > 0) {
        throw new Error(
          'Es gibt noch nicht synchronisierte Ereignisse. Bitte Verbindung prüfen und erneut versuchen.',
        );
      }
      const res = await api<{ match: Match }>(`/matches/${matchId}/finish`, { method: 'POST' });
      clearLocal(matchId);
      set({ match: res.match, sync: 'synced', pendingCount: 0 });
      return res.match;
    },

    dismissNotice() {
      set({ notice: null });
    },

    reset() {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      retryDelay = MIN_RETRY_MS;
      outbox = null;
      set({
        matchId: null,
        match: null,
        loading: false,
        loadError: null,
        sync: 'synced',
        pendingCount: 0,
        notice: null,
      });
    },
  };
});

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    retryDelay = MIN_RETRY_MS;
    void useMatchStore.getState().flush();
  });
}
