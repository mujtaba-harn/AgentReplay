import type { ReplaySession } from "@agentreplay/core";
import { useState } from "react";
import { CardEditor } from "./CardEditor";
import { type CardOptions, defaultCardOptions, RecapCard } from "./RecapCard";

interface CardViewProps {
  session: ReplaySession;
  onClose: () => void;
}

/** The recap card at a third of its real size, next to its settings. */
export function CardView({ session, onClose }: CardViewProps) {
  const [options, setOptions] = useState<CardOptions>(defaultCardOptions);
  return (
    <section className="card-view" aria-label="Recap card">
      <button type="button" className="link-button card-back" onClick={onClose}>
        ← Back to replay
      </button>
      <div className="card-layout">
        <CardEditor options={options} sessionTitle={session.title} onChange={setOptions} />
        <div className="card-frame">
          <RecapCard session={session} options={options} />
        </div>
      </div>
    </section>
  );
}
