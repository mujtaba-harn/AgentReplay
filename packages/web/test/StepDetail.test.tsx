// @vitest-environment jsdom
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse, type ReplayEvent } from "@crafter-replay/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
// Fake keys are built at runtime, so the repo never stores key-shaped strings.
import { FAKE_SECRETS, restoreFakeSecrets } from "../../core/test/support/public-fixtures";
import { diffRows } from "../src/components/DiffView";
import { StepDetail } from "../src/components/StepDetail";

const FIXTURES = join(import.meta.dirname, "..", "..", "core", "test", "fixtures");

afterEach(cleanup);

const show = (events: ReplayEvent[], index = 0, onJump = vi.fn()) =>
  render(<StepDetail events={events} index={index} onJump={onJump} />);

describe("diffRows", () => {
  it("marks removed and added lines", () => {
    const rows = diffRows({ before: "a\nb\n", after: "a\nc\n", added: 1, removed: 1 });

    expect(rows.map((r) => `${r.sign}${r.text}`)).toEqual([" a", "-b", "+c"]);
  });
});

describe("StepDetail", () => {
  it("shows an edit's file, counts and red/green lines", async () => {
    show([
      {
        id: "e",
        kind: "edit",
        t: 65_000,
        title: "Edited src/app.ts",
        file: "src/app.ts",
        diff: { before: "old line\n", after: "new line\n", added: 1, removed: 1 },
      },
    ]);

    expect(screen.getByText(/Edit · 1:05 · src\/app.ts/)).toBeTruthy();
    expect(screen.getByText("+1")).toBeTruthy();
    expect(screen.getByText("−1")).toBeTruthy();
    const removed = await screen.findByText(/- old line/);
    expect(removed.className).toContain("diff-remove");
    expect(screen.getByText(/\+ new line/).className).toContain("diff-add");
  });

  it("never shows a sensitive file's contents", () => {
    const hidden = "[hidden: sensitive file]";
    show([
      {
        id: "e",
        kind: "write",
        t: 0,
        title: "Wrote .env",
        file: ".env",
        diff: { before: hidden, after: hidden, added: 2, removed: 0 },
      },
    ]);

    expect(screen.getByText("Contents hidden: this looks like a sensitive file.")).toBeTruthy();
  });

  it("cuts command output at 200 lines, with a button for the rest", () => {
    const output = Array.from({ length: 250 }, (_, i) => `line ${i + 1}`).join("\n");
    show([{ id: "c", kind: "command", t: 0, title: "Ran npm test", text: "npm test", output }]);

    expect(screen.getByText(/line 200$/m)).toBeTruthy();
    expect(screen.queryByText(/line 201/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show all 250 lines" }));

    expect(screen.getByText(/line 250/)).toBeTruthy();
  });

  it("shows an error and jumps to the step that fixed it", () => {
    const onJump = vi.fn();
    const events: ReplayEvent[] = [
      { id: "c1", kind: "command", t: 0, title: "Ran npm test" },
      { id: "c1-error", kind: "error", t: 1, title: "Error: 2 tests failed", text: "2 failed" },
      { id: "c2", kind: "command", t: 2, title: "Ran npm test again" },
    ];
    show(events, 1, onJump);

    expect(screen.getByText("2 failed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "step 3: Ran npm test again" }));

    expect(onJump).toHaveBeenCalledWith(2);
  });

  it("says when an error was never fixed", () => {
    show(
      [
        { id: "c1", kind: "command", t: 0, title: "Ran npm test" },
        { id: "c1-error", kind: "error", t: 1, title: "Error", text: "failed" },
      ],
      1,
    );

    expect(screen.getByText("Not fixed later in this session.")).toBeTruthy();
  });

  it("shows prompts and replies as plain text", () => {
    show([{ id: "u", kind: "user", t: 0, title: "Fix it", text: "Fix the <b>login</b> bug" }]);

    expect(screen.getByText("Fix the <b>login</b> bug")).toBeTruthy();
  });
});

describe("StepDetail with the secrets session", () => {
  it("never shows a secret in any step", async () => {
    const dir = mkdtempSync(join(tmpdir(), "crafter-replay-detail-"));
    try {
      const path = join(dir, "secrets.jsonl");
      const raw = readFileSync(join(FIXTURES, "08-secrets-fake.jsonl"), "utf8");
      writeFileSync(path, restoreFakeSecrets(raw));
      const session = await parse(path);
      const events = [...session.events];

      for (let i = 0; i < events.length; i++) {
        const { container, unmount } = show(events, i);
        for (const button of screen.queryAllByRole("button", { name: /^Show all/ })) {
          fireEvent.click(button);
        }
        await screen.findAllByRole("article");
        for (const secret of FAKE_SECRETS)
          expect(container.textContent).not.toContain(secret.value);
        unmount();
      }
      expect(session.warnings.redactions).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
