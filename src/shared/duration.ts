/**
 * A duration as a listener scans for it — "45 min", "1 h 5 min", "40 s" —
 * not as a timestamp. Shared by the public player and the editor's audio
 * picker so the two never describe the same file differently.
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  const hours = Math.floor(minutes / 60);
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
