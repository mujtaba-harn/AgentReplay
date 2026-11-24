import type { ReplayEvent } from "@crafter-replay/core";
import { useMemo } from "react";
import { FILTERS, type Filter, isVisible } from "../state";

interface FilterBarProps {
  events: readonly ReplayEvent[];
  filter: Filter;
  onChange: (filter: Filter) => void;
}

/** PRD US-2: All · Edits · Commands · Errors, each with how many steps it matches. */
export function FilterBar({ events, filter, onChange }: FilterBarProps) {
  const counts = useMemo(
    () => FILTERS.map(({ value }) => events.filter((e) => isVisible(e.kind, value)).length),
    [events],
  );
  return (
    <fieldset className="filter-bar" aria-label="Filter steps">
      {FILTERS.map(({ value, label }, i) => (
        <button
          key={value}
          type="button"
          className="filter-button"
          aria-pressed={filter === value}
          onClick={() => onChange(value)}
        >
          {label}
          <span className="filter-count">{counts[i]}</span>
        </button>
      ))}
    </fieldset>
  );
}
