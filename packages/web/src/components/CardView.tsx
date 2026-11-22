import type { ReplaySession } from "@agentreplay/core";
import { useState } from "react";
import { CARD_THEMES, type CardTheme, RecapCard } from "./RecapCard";

interface CardViewProps {
  session: ReplaySession;
  onClose: () => void;
}

/** The recap card at a third of its real size, with the theme picker. */
export function CardView({ session, onClose }: CardViewProps) {
  const [theme, setTheme] = useState<CardTheme>("terminal");
  return (
    <section className="card-view" aria-label="Recap card">
      <div className="card-toolbar">
        <button type="button" className="link-button" onClick={onClose}>
          ← Back to replay
        </button>
        <fieldset className="card-themes" aria-label="Card theme">
          {CARD_THEMES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className="filter-button"
              aria-pressed={theme === value}
              onClick={() => setTheme(value)}
            >
              {label}
            </button>
          ))}
        </fieldset>
      </div>
      <div className="card-frame">
        <RecapCard session={session} theme={theme} />
      </div>
    </section>
  );
}
