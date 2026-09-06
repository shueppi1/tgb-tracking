/** Handball seasons run from summer to summer — mirror of serializers.season_for. */
export function seasonFor(date: Date): string {
  const y = date.getFullYear();
  const two = (n: number) => String(n % 100).padStart(2, '0');
  return date.getMonth() + 1 >= 7 ? `${y}/${two(y + 1)}` : `${y - 1}/${two(y)}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(iso)} ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Value for <input type="datetime-local"> in local time. */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
