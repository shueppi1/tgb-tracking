import type { SyncStatus } from '../store/matchStore';

const LABELS: Record<SyncStatus, string> = {
  synced: 'Synchron',
  pending: 'ausstehend',
  offline: 'Offline',
  error: 'Sync-Fehler',
};

export default function SyncBadge({ status, pending }: { status: SyncStatus; pending: number }) {
  const text =
    status === 'pending' || (status === 'offline' && pending > 0)
      ? `${pending} ${LABELS[status]}`
      : LABELS[status];
  return (
    <span className="sync" data-status={status} title="Synchronisierungsstatus">
      {text}
    </span>
  );
}
