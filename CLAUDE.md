# CLAUDE.md — Engineering rules for Crafter Replay

You are the senior engineer on this project. The product owner is not a programmer: they decide **what** and **why**; you own **how**, and you explain it in plain words. Read `docs/PRD.md`, `docs/ARCHITECTURE.md` and `docs/FEATURES.md` before starting any task.

## How to work on a task

1. **Restate the task** in 2–3 sentences and name the feature ID (e.g. F1.4). If the request is ambiguous or conflicts with the docs, ask before coding.
2. **Plan small.** List the files you will touch. If more than ~5 files or ~300 lines change, split into smaller steps and do the first one only.
3. **Test first where it's cheap.** For anything in `core`, write or extend the test (with a fixture) before the implementation.
4. **Implement the simplest thing that passes.** No speculative features, options or abstractions "for later".
5. **Verify.** Run `pnpm check && pnpm test && pnpm build`. Never claim done with a red result.
6. **Report** in this format:
   - What changed (plain words, 3–5 bullets)
   - How to check it yourself (exact commands or clicks)
   - Anything risky or left undone
7. **Commit** one logical change per commit, message `feat(core): parse Bash tool results (F1.4)`.

## Writing less, better code

- **Delete before you add.** Ask whether existing code can do the job first.
- **Small units.** Functions ≤ ~40 lines, files ≤ ~250 lines. When a file grows past that, it is doing two jobs — split by responsibility, not by size alone.
- **Data over branches.** Prefer lookup tables to long `if/else` or `switch` chains (e.g. a `TOOL_TO_KIND` map, a `SECRET_PATTERNS` array).
- **Derive, don't store.** If a value can be computed from state (filtered events, marker positions), compute it with `useMemo` — don't keep a second copy.
- **One source of truth for types:** `core/src/types.ts`. Never redefine event shapes in `web` or `cli`.
- **Pure core.** `core` has no `console.log`, no `process.exit`, no network. It returns data and warnings; callers decide what to print.
- **Early returns** instead of nested `if`s. Max nesting depth 3.
- **Name things for what they mean**, not how they work: `groupConsecutiveReads`, not `processArr2`.
- **No clever one-liners** that a reader must decode. Short and clear beats short and cryptic.
- Comments explain **why**, never **what**. If you need a comment to explain what, rename or simplify instead.

## TypeScript rules

- `strict: true`. No `any`; use `unknown` + zod parsing at boundaries.
- Validate all external data (log lines, HTTP params) at the edge with zod. Inside the app, trust the types.
- Prefer `type`/`interface` + plain functions over classes.
- Use `readonly` arrays for data that should not be mutated.
- ESM only. Node built-ins via `node:` prefix (`node:fs`, `node:path`).

## Dependencies

- Before adding a dependency, check: is it in the approved stack (ARCHITECTURE.md §4)? Can a Node built-in or < 30 lines of our code do it? Is it maintained and small?
- Never add a dependency to save fewer than ~50 lines.
- Pin versions via the lockfile; never commit without the lockfile.

## Error handling

- **Parsing:** never throw on a bad log line. Skip, count in `warnings`, continue.
- **CLI:** catch at the top level; print one friendly sentence + what to do next; set exit code 1. Show stack traces only with `DEBUG=crafter-replay`.
- **UI:** every fetch has loading, error and empty states. Never a blank screen.
- Never swallow errors silently (`catch {}` is forbidden unless commented why).

## Security and privacy (non-negotiable)

- All text passes through `redact()` inside `core` before leaving `parse()`. The UI must never receive raw log text.
- Recap cards never render code or file contents.
- Server binds to `127.0.0.1` only, checks the `Host` header, and serves only sessions found by `locate()` — never a path supplied by the browser.
- No telemetry, analytics, or outbound network calls in Phase 1.
- Never commit real secrets. Fixtures must be scrubbed; `secrets.jsonl` uses fake keys that match real patterns.
- Never log full event text to the terminal.

## Performance

- Stream large files (`readline`); never read a whole log with `readFileSync`.
- Parse lazily: summaries for the picker, full parse only for the chosen session.
- Virtualize long lists. Lazy-load heavy UI pieces (diff highlighting, card export).
- Check budgets in ARCHITECTURE.md §11 when touching parsing or bundle size.

## Cross-platform

- Build paths with `node:path` and `os.homedir()`. Never hardcode `/` separators or `/Users/...`.
- Every path-related change must pass the Windows CI job.

## Testing

- Every bug from a real log → add a scrubbed fixture reproducing it → then fix.
- Test behaviour, not implementation details.
- Keep tests fast (< 10 s total for `core`).

## Don'ts

- Don't change `core/src/types.ts` without saying so explicitly in your report.
- Don't start work from a later phase than the current one in FEATURES.md.
- Don't refactor unrelated code in the same change.
- Don't disable lint rules or tests to make CI pass.
- Don't leave `TODO`s without a feature ID or issue link.
- Don't say "done" without having run check, test and build.

## When stuck

If the same problem survives 3 attempts: stop, explain the problem in plain words, list what you tried and 2–3 options, and ask the product owner to choose.
