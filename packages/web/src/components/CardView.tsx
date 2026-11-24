import type { SharedSession } from "@crafter-replay/core";
import { useRef, useState } from "react";
import { copyCard, downloadCard } from "../export";
import { CardEditor } from "./CardEditor";
import { type CardOptions, defaultCardOptions, RecapCard } from "./RecapCard";

interface CardViewProps {
  session: SharedSession;
  onClose: () => void;
}

type Status = { busy: boolean; message: string; failed?: boolean };

const IDLE: Status = { busy: false, message: "" };

/** The recap card at a third of its real size, next to its settings and export buttons. */
export function CardView({ session, onClose }: CardViewProps) {
  const [options, setOptions] = useState<CardOptions>(defaultCardOptions);
  const [status, setStatus] = useState<Status>(IDLE);
  const card = useRef<HTMLDivElement>(null);

  const run = async (action: (node: HTMLElement) => Promise<string>) => {
    if (!card.current) return;
    setStatus({ busy: true, message: "Drawing your card…" });
    try {
      setStatus({ busy: false, message: await action(card.current) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      setStatus({ busy: false, message, failed: true });
    }
  };

  return (
    <section className="card-view" aria-label="Recap card">
      <button type="button" className="link-button card-back" onClick={onClose}>
        ← Back to replay
      </button>
      <div className="card-layout">
        <div className="card-side">
          <CardEditor options={options} sessionTitle={session.title} onChange={setOptions} />
          <div className="card-actions">
            <button
              type="button"
              className="card-button"
              disabled={status.busy}
              onClick={() => run(async (node) => `Saved ${await downloadCard(node)}`)}
            >
              Download PNG
            </button>
            <button
              type="button"
              className="card-button"
              disabled={status.busy}
              onClick={() =>
                run(async (node) => {
                  await copyCard(node);
                  return "Copied. Paste it anywhere.";
                })
              }
            >
              Copy image
            </button>
          </div>
          <p className={status.failed ? "card-status is-failed" : "card-status"} aria-live="polite">
            {status.message}
          </p>
        </div>
        <div className="card-frame">
          <RecapCard ref={card} session={session} options={options} />
        </div>
      </div>
    </section>
  );
}
