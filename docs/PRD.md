# Crafter Replay — Product Requirements (Phase 1: Local MVP)

> Status: Draft v1 · Owner: Product · Scope: Phase 1 only. Later phases live in `FEATURES.md`.

## 1. Problem

AI coding agents (Claude Code first) now work for 10–60+ minutes per task. When they finish, the developer sees the end result but not the story: which files were read, what was changed, which commands ran, what broke, how it was fixed, and what it cost. The raw session log exists on disk, but it is an unreadable JSONL file in a hidden folder.

## 2. Solution (one sentence)

`npx crafter-replay` turns a local Claude Code session log into a replayable, scrubbable timeline in the browser, plus a shareable recap card image — all processed on the user's own machine.

## 3. Target users (Phase 1)

| Persona | Need | What they do with Crafter Replay |
|---|---|---|
| **Solo dev / indie hacker** (primary) | Understand and show what the agent did | Replays sessions, posts recap cards |
| **Learner / junior dev** | Learn *how* the agent solved a problem | Steps through reads, edits, errors |
| **Build-in-public creator** | Content for X / Instagram / LinkedIn | Exports recap PNGs weekly |

Out of scope for Phase 1: teams, managers, agencies, educators (Phase 2+).

## 4. Goals and non-goals

### Goals
1. Zero-config: one command, no account, no settings file.
2. Find Claude Code sessions automatically on macOS, Linux and Windows.
3. Show a session as a clear timeline with playback, filters and per-step detail (diffs, command output, errors).
4. Show accurate stats: duration, files changed, lines added/removed, tokens, estimated cost.
5. Export a recap card PNG (9:16 story) with no code on it.
6. Never send data off the machine. Hide likely secrets in everything displayed.

### Non-goals (explicitly not in Phase 1)
- Share links, accounts, payments, any backend.
- Agents other than Claude Code (architecture must allow them; we don't build them yet).
- Video export, VS Code extension, desktop app.
- Editing or re-running sessions.
- Telemetry or analytics of any kind.

## 5. User stories and acceptance criteria

**US-1 · Launch**
As a developer, I run `npx crafter-replay` and pick a session from a list.
- Lists sessions newest-first with title (first user prompt, ≤60 chars), project folder, duration, date.
- Arrow keys + Enter to pick; `--latest` skips the picker.
- If no sessions found: friendly message with the folder path we looked in, exit code 1.
- Time from command to browser open: < 3s for a 5 MB log (after first npx download).

**US-2 · Replay timeline**
As a developer, I see the session as a timeline I can play.
- Event track: one coloured marker per event, positioned by time.
- Step list: every event in order; consecutive file reads grouped ("Read 6 files").
- Controls: play/pause, speed (1×, 5×, 20×), scrubber, ←/→ step, Space play/pause.
- Idle gaps > 60s are compressed during playback.
- Filters: All · Edits · Commands · Errors.

**US-3 · Step detail**
As a developer, I click a step and see what happened.
- Edit/Write: unified diff (red/green), file path, +/− counts.
- Command: the command and its output (truncated at 200 lines with "show more").
- Error: error text and the next step that resolved it, if any.
- User/assistant text: rendered as plain text (Markdown rendering is Phase 2).

**US-4 · Stats**
As a developer, I see a summary for the session.
- Duration (first→last event), files changed (unique paths), lines added/removed, tool calls, tokens (input/output/cache), estimated cost in USD.
- Cost uses Claude Code's own total from the log when present (labelled "exact"); otherwise it is computed from a pricing table in config, per model, and labelled "estimate".

**US-5 · Recap card**
As a creator, I export a recap card.
- 1080×1920 PNG, 3 themes (Terminal, Violet, Clay).
- Shows: title (editable), agent + duration, event strip, 4 stats, "biggest moment", `crafter-replay` wordmark.
- Never shows code or file contents. File names hidden by default (toggle).
- `npx crafter-replay --card` exports the PNG for the latest session without opening the UI.

**US-6 · Privacy**
As a developer, I trust that my code stays local.
- Local server binds to `127.0.0.1` only. No outbound network calls at runtime.
- Secrets redacted before data reaches the UI (see `ARCHITECTURE.md` §7).
- Terminal prints: "Data never leaves your computer."

## 6. Success metrics (first 30 days after launch)

| Metric | Target |
|---|---|
| Unique `npx` runs (npm downloads as proxy) | 500 |
| Users who run it on ≥ 3 different days | 20% |
| Recap cards seen posted publicly | 25 |
| GitHub stars (if open-sourced) | 150 |
| Crash reports / parser failures on real logs | < 2% of sessions |

## 7. Constraints

- Node.js ≥ 22 (Node 20 reached end-of-life in April 2026). TypeScript everywhere.
- Claude Code's log format is **undocumented and may change** without notice — biggest product risk. Mitigation: adapter isolation + fixture tests + tolerant parsing (unknown events are skipped, never crash).
- Package size of the published CLI: < 5 MB unpacked.

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Log format changes | Product breaks overnight | Adapter layer, schema validation per line, fixture tests, fast patch releases |
| Secret leaks via recap or screenshots | Trust destroyed | Redaction in core, no code on cards, file names hidden by default |
| Similar open-source viewers exist | Low differentiation | Compete on replay UX + recap card + polish; check GitHub before launch |
| Huge logs (50 MB+) | Slow / crash | Streaming parser, virtualized list, event grouping |
| Windows path differences | Sessions not found | Path resolution in one module, tested on all 3 OSes in CI |

## 9. Release checklist (Phase 1 "done")

- [ ] All user stories pass acceptance criteria on 10+ real logs.
- [ ] CI green on macOS, Linux, Windows.
- [ ] Redaction tests pass on the secrets fixture.
- [ ] External dev review of redaction + npm publish setup.
- [ ] README with GIF, privacy statement, and supported versions.
- [ ] Published to npm as `crafter-replay` (name checked), v0.1.0.
