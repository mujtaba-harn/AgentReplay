// Number formats for the browser. Durations come from core so the terminal shows the same.
const pad = (n: number): string => String(n).padStart(2, "0");

/** Time since the session started, as m:ss or h:mm:ss. */
export function formatClock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const clock = `${pad(minutes)}:${pad(seconds % 60)}`;
  return hours > 0 ? `${hours}:${clock}` : clock.replace(/^0/, "");
}

const UNITS: readonly { size: number; suffix: string }[] = [
  { size: 1_000_000, suffix: "M" },
  { size: 1_000, suffix: "K" },
];

/** A short count such as 999, 1.2K or 12M: one decimal below 10, none above. */
export function formatCount(n: number): string {
  const unit = UNITS.find((u) => n >= u.size);
  if (!unit) return String(n);
  const value = n / unit.size;
  return `${value < 10 ? value.toFixed(1).replace(/\.0$/, "") : Math.round(value)}${unit.suffix}`;
}

export function formatCost(usd: number): string {
  if (usd > 0 && usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}
