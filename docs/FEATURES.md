# Crafter Replay — Features by Phase

> Each feature has an ID, a size (S ≈ ≤1 day, M ≈ 2–3 days, L ≈ 4–5 days with a coding agent), and a **Done when** check. Build in order. Do not start a phase until the previous one meets its exit criteria.

---

## Phase 0 — Foundation (≈ 2–3 days)

Goal: an empty project that is easy to build on and hard to break.

| ID | Feature | Size | Done when |
|---|---|---|---|
| F0.1 | Monorepo: pnpm workspaces, `core`, `cli`, `web` packages, shared `tsconfig.base.json` (strict) | S | `pnpm build` builds all three |
| F0.2 | Biome lint + format, `pnpm check` script | S | `pnpm check` passes; CI fails on lint errors |
| F0.3 | Vitest set up in `core` with one passing test | S | `pnpm test` runs green |
| F0.4 | GitHub Actions: mac/linux/windows × Node 22/24 running check + test + build | S | Badge green on all 6 jobs |
| F0.5 | `CLAUDE.md` committed; `docs/` holds PRD, ARCHITECTURE, FEATURES | S | Files present |
| F0.6 | Collect 10+ real Claude Code logs, scrub secrets, save as fixtures | M | `core/test/fixtures/` has short, long, error-heavy and multi-edit sessions |

**Exit criteria:** CI green, fixtures in place.

---

## Phase 1 — Local MVP (≈ 3–4 weeks)

Goal: `npx crafter-replay` works end-to-end on real sessions. Full spec in `PRD.md`.

### 1A · Core engine
| ID | Feature | Size | Done when |
|---|---|---|---|
| F1.1 | `types.ts`: `ReplayEvent`, `SessionSummary`, `ReplaySession`, `SessionStats` | S | Types reviewed; no `any` |
| F1.2 | Claude Code `locate()` for all 3 OSes + `CLAUDE_CONFIG_DIR` | S | Test with temp dirs passes on CI matrix |
| F1.3 | `summarize()`: title, project, start, duration without full parse | S | 200 files summarized < 1 s |
| F1.4 | `parse()`: streaming, zod-validated, tool mapping, tool_use ↔ tool_result pairing | L | All fixtures parse; unknown lines counted, never thrown |
| F1.5 | `redact.ts`: patterns, sensitive files, entropy, masking with hint | M | Secrets fixture: 0 secrets survive |
| F1.6 | `group.ts`: merge consecutive reads; compute compressed timeline | S | Snapshot tests |
| F1.7 | `stats.ts` + `pricing.ts`: duration, files, ±lines, tokens, est. cost | S | Hand-checked fixture totals match |

### 1B · CLI
| ID | Feature | Size | Done when |
|---|---|---|---|
| F1.8 | Arg parsing: `--latest`, `--card`, `--port`, `--no-open`, `--path`, `--help`, `--version` | S | `--help` lists all; unknown flag → helpful error |
| F1.9 | Session picker (clack), newest first, empty state message | S | Works with arrows/Enter; Ctrl+C exits cleanly |
| F1.10 | Local server: 127.0.0.1, free port, Host check, 3 routes, static files | M | Requests from other hosts rejected; arbitrary paths impossible |
| F1.11 | Open browser + calm terminal summary + privacy line | S | Matches terminal mockup |
| F1.12 | Bundle with tsup; `npm pack` produces package < 5 MB | S | `npx ./crafter-replay-0.1.0.tgz` works on a clean machine |

### 1C · Web UI
| ID | Feature | Size | Done when |
|---|---|---|---|
| F1.13 | App shell, API client, loading + error states, light/dark | S | Broken API shows a readable error, not a blank page |
| F1.14 | Playback reducer: index, playing, speed, filter | S | Reducer unit tests pass |
| F1.15 | Event track with coloured markers, click to jump | M | Markers line up with time; current step outlined |
| F1.16 | Virtualized step list with filters and grouped reads | M | 2,000-event fixture scrolls smoothly |
| F1.17 | Step detail: diff view, command output (truncate + show more), errors, text | M | All event kinds render; no raw secrets visible |
| F1.18 | Controls: play/pause, 1×/5×/20×, scrubber, ←/→/Space | S | Keyboard works; idle gaps compressed |
| F1.19 | Stats panel + "We hid N possible secrets" notice | S | Numbers match `stats.ts` |

### 1D · Recap card
| ID | Feature | Size | Done when |
|---|---|---|---|
| F1.20 | `RecapCard` component, 1080×1920, 3 themes | M | Visual matches mockup |
| F1.21 | Editable title, stat picker (choose 4), file-name toggle (off by default) | S | No code or file content ever rendered |
| F1.22 | "Biggest moment" picker: first fixed error › largest edit › longest command | S | Deterministic on fixtures |
| F1.23 | Download PNG + Copy image; `--card` flag path | S | PNG is exactly 1080×1920 |

### 1E · Launch
| ID | Feature | Size | Done when |
|---|---|---|---|
| F1.24 | README: GIF, install, flags, privacy statement, supported Claude Code versions | S | A non-dev can follow it |
| F1.25 | Independent review (AI reviewer without the build history) of redaction + server security + publish config; outside review invited via README | S | Review notes resolved |
| F1.26 | Publish `crafter-replay@0.1.0` to npm (2FA on, provenance on) | S | `npx crafter-replay` works from a fresh machine |

**Exit criteria:** PRD release checklist complete. 10 outside testers have run it on their own sessions.

---

## Phase 2 — Share & more agents (≈ 4–6 weeks)

Goal: replays travel; more developers can use it.

| ID | Feature | Size | Done when |
|---|---|---|---|
| F2.1 | Codex adapter | M | Codex fixtures parse; UI unchanged |
| F2.2 | Cursor adapter (reads its local database) | L | Cursor fixtures parse |
| F2.3 | `packages/server`: API for creating/reading shared replays (Hono + Postgres) | L | Upload → link → view works |
| F2.4 | Share flow: preview of exactly what uploads, redaction review, confirm | M | Nothing uploads without explicit confirm |
| F2.5 | Share links: unlisted by default, expiry (7/30 days/never), delete | M | Deleted link returns 404 everywhere |
| F2.6 | Public replay page at `crafter-replay.dev/s/:id` (same web UI, read-only) | M | Loads < 2 s on mobile |
| F2.7 | OG link preview images (1200×630) via Satori | S | Correct preview in X, LinkedIn, WhatsApp, Discord |
| F2.8 | Syntax highlighting in diffs (shiki, lazy-loaded) | S | Bundle budget still met |
| F2.9 | Markdown rendering for prompts/replies | S | Safe (no raw HTML) |
| F2.10 | Landing page at crafter-replay.dev | M | Explains product in 5 seconds; links to npm + GitHub |

**Exit criteria:** 100 shared replays created by people other than you.

---

## Phase 3 — Accounts, money, more surfaces (≈ 6–8 weeks)

| ID | Feature | Size | Done when |
|---|---|---|---|
| F3.1 | Accounts (GitHub sign-in) + `npx crafter-replay login` | M | CLI stores token in OS keychain |
| F3.2 | Pro plan via Stripe: private links, unlimited history, custom card branding | L | Upgrade/downgrade/cancel all work |
| F3.3 | Weekly recap card (sessions, lines, cost, streak) | M | `--week` exports 4:5 and 9:16 |
| F3.4 | Video export: 15 s vertical MP4 of a replay (Remotion) | L | Exports < 60 s for a typical session |
| F3.5 | VS Code extension: session list + replay in a panel, reusing `core` + `web` | L | Published to VS Code Marketplace |
| F3.6 | Session history search across all local sessions | M | Search 500 sessions < 1 s |

## Phase 4 — Teams & reach (later; validate demand first)

| ID | Feature | Notes |
|---|---|---|
| F4.1 | Team workspaces: shared replays, roles | Main paid tier |
| F4.2 | Team dashboard: AI usage, cost per person/project, failure hotspots | Needs opt-in uploads |
| F4.3 | Tauri desktop app | Only if non-terminal users ask |
| F4.4 | Standalone binaries via `bun build --compile` + Homebrew | For users without Node |
| F4.5 | Live mode: watch a session replay as the agent works | Uses file watching |

---

## Parking lot (ideas not scheduled)

- "Explain this session" AI summary (would need an API key → keep optional).
- Compare two sessions side by side.
- Public gallery of replays (moderation cost — be careful).
