import { Notice, PROBLEM_TEXT } from "./components/Notice";
import { Replay } from "./components/Replay";
import { SessionHeader } from "./components/SessionHeader";
import { type ReplayState, useReplay } from "./useReplay";

/** What to show for each loading state; kept apart from the hook so it can be tested on its own. */
export function ReplayScreen({ state }: { state: ReplayState }) {
  if (state.status === "loading") return <Notice title="Loading your session…" />;
  if (state.status === "failed") return <Notice tone="problem" {...PROBLEM_TEXT[state.problem]} />;
  const { session } = state;
  return (
    <>
      <SessionHeader session={session} />
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
  const state = useReplay(window.location.search);
  return (
    <main className="app">
      <ReplayScreen state={state} />
      <footer className="app-footer">AgentReplay · Data never leaves your computer.</footer>
    </main>
  );
}
