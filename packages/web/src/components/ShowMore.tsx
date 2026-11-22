import { type ReactNode, useState } from "react";

interface ShowMoreProps<T> {
  items: readonly T[];
  limit: number;
  /** What a "show all" button counts, e.g. "lines". */
  noun: string;
  children: (visible: readonly T[]) => ReactNode;
}

/** Shows the first `limit` items, with a button for the rest (PRD US-3: output cut at 200 lines). */
export function ShowMore<T>({ items, limit, noun, children }: ShowMoreProps<T>) {
  const [expanded, setExpanded] = useState(false);
  const cut = !expanded && items.length > limit;
  return (
    <>
      {children(cut ? items.slice(0, limit) : items)}
      {cut && (
        <button type="button" className="show-more" onClick={() => setExpanded(true)}>
          Show all {items.length} {noun}
        </button>
      )}
    </>
  );
}
