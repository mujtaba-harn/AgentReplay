import type { ReplaySession } from "@agentreplay/core";
import { useEffect, useState } from "react";
import { loadReplay, type Problem, sessionIdFrom } from "./api";

export type ReplayState =
  | { status: "loading" }
  | { status: "failed"; problem: Problem }
  | { status: "ready"; session: ReplaySession };

/** Loads the session named in the page address, once. */
export function useReplay(search: string): ReplayState {
  const id = sessionIdFrom(search);
  const [state, setState] = useState<ReplayState>(
    id === undefined ? { status: "failed", problem: "noSession" } : { status: "loading" },
  );

  useEffect(() => {
    if (id === undefined) return;
    let current = true; // ignore a late answer after the page has moved on (React StrictMode)
    void loadReplay(id).then((result) => {
      if (!current) return;
      setState(
        result.ok
          ? { status: "ready", session: result.session }
          : { status: "failed", problem: result.problem },
      );
    });
    return () => {
      current = false;
    };
  }, [id]);

  return state;
}
