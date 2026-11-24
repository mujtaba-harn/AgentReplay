// PRD US-3: what happened in one step. Shows only fields core already redacted.
import type { EventKind, ReplayEvent } from "@crafter-replay/core";
import { lazy, Suspense } from "react";
import { fixedBy } from "../errors";
import { formatClock } from "../format";
import { ShowMore } from "./ShowMore";

const DiffView = lazy(() => import("./DiffView"));

/** PRD US-3: command output is cut at 200 lines with "show more"; long text gets the same. */
const MAX_TEXT_LINES = 200;

const KIND_LABEL: Readonly<Record<EventKind, string>> = {
  user: "Your prompt",
  assistant: "Claude",
  read: "Read",
  edit: "Edit",
  write: "Write",
  command: "Command",
  search: "Search",
  task: "Task",
  subagent: "Subagent",
  error: "Error",
};

const TEXT_LABEL: Readonly<Partial<Record<EventKind, string>>> = {
  user: "Prompt",
  assistant: "Reply",
  read: "Files",
  command: "Command",
  search: "Search",
  task: "Task",
  subagent: "Task",
  error: "Error message",
};

function TextBlock({ label, text }: { label: string; text: string }) {
  return (
    <section className="detail-block">
      <h3>{label}</h3>
      <ShowMore items={text.split("\n")} limit={MAX_TEXT_LINES} noun="lines">
        {(lines) => <pre className="detail-text">{lines.join("\n")}</pre>}
      </ShowMore>
    </section>
  );
}

function Changes({ diff }: { diff: NonNullable<ReplayEvent["diff"]> }) {
  // core replaces both sides of a sensitive file's diff with the same notice, so they match.
  if (diff.before === diff.after) {
    return <p className="detail-note">Contents hidden: this looks like a sensitive file.</p>;
  }
  return (
    <section className="detail-block">
      <h3>Changes</h3>
      <Suspense fallback={<p className="detail-note">Loading changes…</p>}>
        <DiffView diff={diff} />
      </Suspense>
    </section>
  );
}

interface ResolutionProps {
  events: readonly ReplayEvent[];
  index: number;
  onJump: (index: number) => void;
}

function Resolution({ events, index, onJump }: ResolutionProps) {
  const fix = fixedBy(events, index);
  const fixStep = fix === undefined ? undefined : events[fix];
  if (fix === undefined || !fixStep) {
    return <p className="detail-note">Not fixed later in this session.</p>;
  }
  return (
    <p className="detail-note">
      Fixed at{" "}
      <button type="button" className="link-button" onClick={() => onJump(fix)}>
        step {fix + 1}: {fixStep.title}
      </button>
    </p>
  );
}

interface StepDetailProps {
  events: readonly ReplayEvent[];
  index: number;
  onJump: (index: number) => void;
}

export function StepDetail({ events, index, onJump }: StepDetailProps) {
  const event = events[index];
  if (!event) return null;
  const meta = [KIND_LABEL[event.kind], formatClock(event.t), event.file].filter(Boolean);
  return (
    <article className="step-detail" aria-label="Step details">
      <h2>{event.title}</h2>
      <p className="detail-meta">
        {meta.join(" · ")}
        {event.diff && (
          <span className="diff-counts">
            {" "}
            <span className="diff-add">+{event.diff.added}</span>{" "}
            <span className="diff-remove">−{event.diff.removed}</span>
          </span>
        )}
      </p>
      {event.diff && <Changes diff={event.diff} />}
      {event.text && <TextBlock label={TEXT_LABEL[event.kind] ?? "Details"} text={event.text} />}
      {event.kind === "error" && <Resolution events={events} index={index} onJump={onJump} />}
      {event.output && <TextBlock label="Output" text={event.output} />}
    </article>
  );
}
