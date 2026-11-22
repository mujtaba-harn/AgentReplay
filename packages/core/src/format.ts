// Display helpers shared by the terminal and the browser, so both show the same numbers.
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** A short duration such as "<1m", "14m", "2h" or "1h 5m". */
export function formatDuration(ms: number): string {
  if (ms < MINUTE) return "<1m";
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m`;
  const hours = Math.floor(ms / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
