import type { ReplaySession } from "@agentreplay/core";
import { formatDuration } from "@agentreplay/core/format";

const steps = (count: number): string => (count === 1 ? "1 step" : `${count} steps`);

export function SessionHeader({ session }: { session: ReplaySession }) {
  const details = [
    session.project,
    formatDuration(session.stats.durationMs),
    steps(session.events.length),
  ];
  return (
    <header className="session-header">
      <h1>{session.title}</h1>
      <p className="session-details">{details.join(" · ")}</p>
    </header>
  );
}
