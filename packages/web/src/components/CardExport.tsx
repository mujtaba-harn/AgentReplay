// `npx crafter-replay --card` opens this page: it draws the card, downloads it and tells the CLI.
import type { SharedSession } from "@agentreplay/core";
import { useEffect, useRef, useState } from "react";
import { reportCardDone } from "../api";
import { downloadCard } from "../export";
import { Notice } from "./Notice";
import { defaultCardOptions, RecapCard } from "./RecapCard";

type Outcome = { saved: true; file: string } | { saved: false; reason: string };

export function CardExport({ session }: { session: SharedSession }) {
  const card = useRef<HTMLDivElement>(null);
  const started = useRef(false); // React StrictMode runs effects twice in development
  const [outcome, setOutcome] = useState<Outcome>();

  useEffect(() => {
    if (started.current || !card.current) return;
    started.current = true;
    const node = card.current;
    downloadCard(node)
      .then((file) => setOutcome({ saved: true, file }))
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : "Something went wrong.";
        setOutcome({ saved: false, reason });
      });
  }, []);

  useEffect(() => {
    if (outcome) reportCardDone(outcome.saved);
  }, [outcome]);

  return (
    <section className="card-view" aria-label="Recap card">
      {!outcome && <Notice title="Drawing your recap card…" />}
      {outcome?.saved && (
        <Notice
          title={`Saved ${outcome.file} to your Downloads folder.`}
          hint="You can close this tab."
        />
      )}
      {outcome && !outcome.saved && (
        <Notice
          tone="problem"
          title="Your card couldn't be saved."
          hint={`${outcome.reason} Run npx crafter-replay and use Download PNG instead.`}
        />
      )}
      <div className="card-frame">
        <RecapCard ref={card} session={session} options={defaultCardOptions()} />
      </div>
    </section>
  );
}
