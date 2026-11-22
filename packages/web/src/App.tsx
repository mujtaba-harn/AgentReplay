import { useEffect } from "react";
import { reportCardDone } from "./api";
import { CardExport } from "./components/CardExport";
import { Notice, PROBLEM_TEXT } from "./components/Notice";
import { Replay } from "./components/Replay";
import { SessionHeader } from "./components/SessionHeader";
import { StatsPanel } from "./components/StatsPanel";
import { type ReplayState, useReplay } from "./useReplay";

interface ReplayScreenProps {
  state: ReplayState;
  /** `--card` mode: only draw and download the card. */
  cardOnly?: boolean;
}

/** What to show for each loading state; kept apart from the hook so it can be tested on its own. */
export function ReplayScreen({ state, cardOnly = false }: ReplayScreenProps) {
  if (state.status === "loading") return <Notice title="Loading your session…" />;
  if (state.status === "failed") return <Notice tone="problem" {...PROBLEM_TEXT[state.problem]} />;
  const { session } = state;
  if (cardOnly) return <CardExport session={session} />;
  return (
    <>
      <SessionHeader session={session} />
      <StatsPanel session={session} />
      {session.events.length === 0 ? (
        <Notice
          title="This session has no steps to replay."
          hint="It ended before Claude did anything."
        />
      ) : (
        <Replay session={session} />
      )}
    </>
  );
}

export function App() {
  const search = window.location.search;
  const state = useReplay(search);
  const cardOnly = new URLSearchParams(search).get("card") === "1";

  // A card that can't even load must still let `--card` finish instead of waiting forever.
  useEffect(() => {
    if (cardOnly && state.status === "failed") reportCardDone(false);
  }, [cardOnly, state.status]);

  return (
    <main className="app">
      <ReplayScreen state={state} cardOnly={cardOnly} />
      <footer className="app-footer">AgentReplay · Data never leaves your computer.</footer>
    </main>
  );
}
