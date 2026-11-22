import type { Problem } from "../api";

interface NoticeProps {
  title: string;
  hint?: string;
  tone?: "calm" | "problem";
}

/** A centred message: used for loading, errors and empty sessions, so the page is never blank. */
export function Notice({ title, hint, tone = "calm" }: NoticeProps) {
  return (
    <div className={`notice notice-${tone}`} role={tone === "problem" ? "alert" : "status"}>
      <p className="notice-title">{title}</p>
      {hint && <p className="notice-hint">{hint}</p>}
    </div>
  );
}

const RUN_AGAIN = "Run npx agentreplay again in your terminal and pick the session.";

export const PROBLEM_TEXT: Readonly<Record<Problem, { title: string; hint: string }>> = {
  noSession: {
    title: "No session chosen.",
    hint: "Start AgentReplay from your terminal with npx agentreplay, then pick a session.",
  },
  unreachable: {
    title: "Can't reach AgentReplay.",
    hint: `The terminal running it was probably closed or stopped. ${RUN_AGAIN}`,
  },
  notFound: { title: "This session isn't available.", hint: RUN_AGAIN },
  unreadable: {
    title: "This session couldn't be read.",
    hint: "The log may be damaged, or written by a Claude Code version AgentReplay doesn't know yet.",
  },
  unexpected: {
    title: "Something unexpected came back.",
    hint: `${RUN_AGAIN} If it keeps happening, please report it.`,
  },
};
