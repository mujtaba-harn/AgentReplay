# Crafter Replay — Architecture

> Audience: the coding agent and any engineer reviewing the plan. Covers Phase 1 in detail and shows where later phases plug in.

## 1. Principles

1. **Local-first.** All parsing and rendering happen on the user's machine. The network is only for share features (Phase 2+), and only on explicit user action.
2. **One core, many doors.** A single pure-TypeScript `core` package does all the thinking. CLI, Web UI, VS Code extension and desktop app are thin shells around it.
3. **Adapters isolate the outside world.** Nothing outside `core/adapters/*` knows which agent produced a log.
4. **Pure functions in core.** `core` never touches the network or the console. File reading happens only in adapters' I/O entry points. Everything else is `input → output`, which makes it trivially testable.
5. **Tolerant parsing.** Unknown or malformed lines are counted and skipped, never thrown. A partial replay beats a crash.
6. **Few dependencies.** Each dependency is a liability (size, security, breakage). Prefer Node built-ins.

## 2. System overview

```
                         User's computer
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  Terminal: npx crafter-replay                                       │
│        │                                                         │
│        ▼                                                         │
│  ┌────────────┐   uses   ┌─────────────────────────────────────┐ │
│  │  cli       │────────▶│  core                               │ │
│  │  (Node)    │          │  adapters → normalize → redact      │ │
│  │  picker    │          │            → stats → (ReplaySession)│ │
│  │  http srv  │          └─────────────────────────────────────┘ │
│  └─────┬──────┘                       ▲                          │
│        │ serves JSON + static files   │ reads                    │
│        ▼                              │                          │
│  ┌────────────┐               ~/.claude/projects/**/*.jsonl      │
│  │  web       │                                                  │
│  │  (React)   │  Browser at http://127.0.0.1:<port>              │
│  └────────────┘                                                  │
└──────────────────────────────────────────────────────────────────┘
        Phase 2+: web ──(user clicks Share)──▶ crafter-replay.dev API
```

## 3. Repository layout (monorepo)

```
crafter-replay/
├─ packages/
│  ├─ core/                 # pure TS, no UI, no console output
│  │  ├─ src/
│  │  │  ├─ types.ts        # ReplayEvent, ReplaySession, SessionSummary
│  │  │  ├─ adapters/
│  │  │  │  ├─ index.ts     # adapter registry
│  │  │  │  └─ claude-code/
│  │  │  │     ├─ locate.ts # where logs live per OS
│  │  │  │     ├─ parse.ts  # raw line → ReplayEvent[]
│  │  │  │     └─ schema.ts # zod schemas for known line shapes
│  │  │  ├─ redact.ts       # secret detection + masking
│  │  │  ├─ group.ts        # merge consecutive reads, compress idle gaps
│  │  │  ├─ stats.ts        # summary numbers
│  │  │  ├─ pricing.ts      # model → $ per token (config table)
│  │  │  └─ index.ts        # public API (small!)
│  │  └─ test/
│  │     ├─ fixtures/       # real, scrubbed .jsonl files
│  │     └─ *.test.ts
│  ├─ cli/                  # Node entry point
│  │  └─ src/
│  │     ├─ index.ts        # arg parsing, flow
│  │     ├─ picker.ts       # session selection prompt
│  │     ├─ server.ts       # tiny http server (node:http)
│  │     └─ card.ts         # --card headless export
│  └─ web/                  # Vite + React UI, built to static files
│     └─ src/
│        ├─ App.tsx
│        ├─ api.ts          # fetch('/api/...')
│        ├─ state.ts        # playback state (one reducer)
│        ├─ components/
│        │  ├─ EventTrack.tsx
│        │  ├─ StepList.tsx
│        │  ├─ StepDetail.tsx
│        │  ├─ Controls.tsx
│        │  ├─ StatsPanel.tsx
│        │  └─ RecapCard.tsx
│        └─ styles.css
├─ CLAUDE.md                # rules for the coding agent
├─ package.json             # workspaces, shared scripts
├─ pnpm-workspace.yaml
├─ biome.json               # lint + format (one tool)
└─ tsconfig.base.json
```

The published npm package is **`crafter-replay`** = `cli` bundled with `core` and the built `web` assets. `core` can later be published separately as `@crafter-replay/core` for the VS Code extension and contributors.

## 4. Tech stack and why

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | One language for CLI, UI, future extension and server |
| Runtime | Node.js ≥ 22 (20 is end-of-life) | Required by npx; has `fetch`, `parseArgs`, streams built in |
| Package manager | pnpm workspaces | Fast, strict, first-class monorepo support |
| CLI args | `node:util` `parseArgs` | Built-in, zero deps |
| Interactive picker | `@clack/prompts` | Small, good-looking, accessible |
| Open browser | `open` | Cross-platform, tiny |
| HTTP server | `node:http` | ~40 lines; Express is unnecessary |
| Validation | `zod` | Validates each log line against known shapes; unknown → skip |
| Diffs | `diff` | Standard, small |
| UI | React 19 + Vite | Mature, fast builds, coding agents know it well |
| Long lists | `react-virtuoso` | Smooth with 2,000+ events |
| PNG export | `html-to-image` | Client-side, no server |
| Bundling CLI | `tsup` | One command, outputs a single ESM file |
| Tests | `vitest` | Fast, same config style as Vite |
| Lint/format | `biome` | Replaces ESLint + Prettier with one fast tool |
| CI | GitHub Actions matrix (mac, linux, windows × Node 22, 24) | Catches path bugs early |

Deliberately **not** used in Phase 1: Next.js, Express, Redux, Tailwind plugins beyond defaults, any database, any analytics SDK.

## 5. Core data model

```ts
// packages/core/src/types.ts
export type EventKind = "user" | "assistant" | "read" | "edit" | "write" | "command" | "search" | "task" | "subagent" | "error";

export interface ReplayEvent {
  id: string;
  kind: EventKind;
  t: number;                 // ms since session start
  title: string;             // "Edited src/globals.css"
  file?: string;             // relative to session cwd
  diff?: { before: string; after: string; added: number; removed: number };
  text?: string;             // prompt, reply, command, or error message (already redacted)
  output?: string;           // what a command, search or subagent returned (already redacted)
  tokens?: { in: number; out: number; cacheRead: number; cacheWrite: number };
  model?: string;
  groupSize?: number;        // set by group.ts when merging reads
}

export interface SessionSummary {          // cheap: for the picker list
  id: string; agent: "claude-code"; path: string;
  title: string; project: string;
  startedAt: number;         // epoch ms — a number, not a Date, so it survives JSON to the browser
  durationMs: number;
}

export interface SessionStats {            // PRD US-4
  durationMs: number; filesChanged: number; linesAdded: number; linesRemoved: number;
  toolCalls: number;
  tokens: { in: number; out: number; cacheRead: number; cacheWrite: number };
  costUsd: number;
  costSource: "exact" | "estimate";        // exact = log's cost-state; estimate = pricing.ts
}

export interface ReplaySession extends SessionSummary {
  events: readonly ReplayEvent[];
  stats: SessionStats;
  warnings: { skippedLines: number; redactions: number };
}

// What leaves the CLI for the browser (and a future share link): no `path`, which holds the OS user name.
export type SharedSummary = Omit<SessionSummary, "path">;
export type SharedSession = Omit<ReplaySession, "path">;
```

Everything downstream (UI, card, future share API) consumes **only** these types.

## 6. Adapter contract

```ts
export interface Adapter {
  id: "claude-code";                               // later: "codex" | "cursor"
  locate(): Promise<string[]>;                     // absolute paths to session files
  summarize(path: string): Promise<SessionSummary>;// reads only what it needs
  parse(path: string): Promise<ReplaySession>;     // full parse, streaming
}
```

### Claude Code adapter notes
- Location: `~/.claude/projects/<encoded-project-path>/<session-id>.jsonl` (resolve home via `os.homedir()`; never hardcode `/Users`). Respect `CLAUDE_CONFIG_DIR` if set.
- **Subagents write their own file** in a `subagents` folder inside the session folder. `locate()` returns main sessions only (they are not listed separately in the picker); `subagentFiles(sessionPath)` finds a session's subagent logs in `<session-id>/subagents/`, which links each one to its parent. Each has a sibling `.meta.json`, ignored for now. The Agent call's `toolUseResult.agentId` names the file (`agent-<agentId>.jsonl`). **Phase 1 display (decided):** a subagent is one timeline step whose output starts with an activity summary ("Read 11 files · ran 4 commands") followed by its final report; its own steps are not shown but count in stats (tokens, cost, files changed).
- **Folder names are unreliable for project names.** On Windows the same project can appear as `C--Users-…` and `c--Users-…` (drive-letter case). Take the project name from the `cwd` recorded in the log.
- **Resumed sessions (`-c`) append to the same file**, so one file can hold several prompts. Treat the whole file as one session.
- Format: one JSON object per line. Shapes below are verified against the fixtures (Claude Code 2.1.330, Windows) but remain undocumented and may change:
  - `type: "user"` — `message.content` is a string (prompt) or an array containing `tool_result` blocks.
  - `type: "assistant"` — `message.content` array with `text` and `tool_use` blocks; `message.usage` holds token counts; `message.model` holds the model id.
  - `type: "cost-state"` — exact totals: `totalCostUSD`, `totalLinesAdded`, `totalLinesRemoved`, `totalDuration` and per-model token usage (`modelUsage`). Written several times per session; each is a running total, so use the last one. When present, stats use these instead of our own estimate; `pricing.ts` is the fallback.
  - `type: "attachment"` — the environment snapshot carries the working folder (`workingDirectory`) and `platform`; use them for the project name and OS.
  - Conversation lines have `timestamp`, `uuid`, `parentUuid`, `cwd`, `sessionId`.
- **Most lines are not conversation.** Logs also contain `session-owner`, `queue-operation`, `data-flow-records`, `atis-latch`, `last-prompt`, `api-request-shape`, `api-request-blob`, `api-request`, `tools-used` and `mode`. Skip these, and any type we don't recognise, quietly. `warnings.skippedLines` counts only broken JSON and `user`/`assistant` lines that fail their schema, so the number means "something we should have understood but couldn't".
- Tool mapping: `Read → read`, `Edit / MultiEdit → edit`, `Write → write`, `Bash / PowerShell → command`, `Grep / Glob → search`, `TaskCreate / TaskUpdate → task`, `Agent → subagent`. A `tool_result` with `is_error: true` → `error`. Anything else (e.g. `Skill`, `ToolSearch`) → skipped. Note the real names: the task list is `TaskCreate` / `TaskUpdate` (not `TodoWrite`), and subagents are `Agent` (not `Task`).
- **One reply spans several `assistant` lines** (one content block each) that share a `requestId`, and each repeats the reply's full `message.usage`. Count tokens once per `requestId`; done this way, totals match `cost-state.modelUsage` exactly (which also includes subagent tokens).
- **Cost.** Stats use `cost-state.totalCostUSD` (exact, includes subagents) when present; otherwise `pricing.ts` estimates. Cache writes come in two lifetimes (`usage.cache_creation.ephemeral_5m/1h_input_tokens`) with different prices — the main session uses 1-hour writes, subagents 5-minute — so the reader tracks the 5-minute share per model. Prices were derived from the fixtures' recorded per-model `costUSD` and reproduce every one exactly.
- Claude Code writes some replies itself with `message.model: "<synthetic>"` (e.g. after an interruption). They carry no real usage and must never be priced as a model.
- Pair `tool_use` with its `tool_result` by `tool_use_id` to attach command output and errors. Each `user` line holds at most one `tool_result`, and its top-level `toolUseResult` is that call's structured result.
- **Diffs come ready-made.** Edit/Write `toolUseResult.structuredPatch` holds unified-diff hunks; count `+`/`-` lines. A new file is `type: "create"` with no patch; count it as `content.split("\n").length` lines. That is Claude Code's own rule, so totals match `cost-state.totalLinesAdded/Removed` exactly.
- Parse with `readline` over a stream — never `readFileSync` + `split` on large files.
- `summarize()` reads the first user prompt and the file's last line only. In a finished session the last line is a `cost-state` (no `timestamp`): use its `startTime` as the start. Duration is always first → last timestamped line (US-4). **Don't use `totalDuration` for it:** it counts per Claude Code process, not per log — a continued session inherits the earlier run's total (seen: 29 min for 5 min of messages), and a session with long breaks reported 64 min for two days of messages. `totalDuration` is only the fallback when no line has a timestamp.

## 7. Secret redaction

Runs inside `core` **before** any event leaves `parse()`. The UI never receives raw text. **Where:** every string of each `user`/`assistant` line is redacted the moment the line is parsed (`redactDeep`), before titles are built — so a key cut off at a 60-char title can never leak as a fragment. Thinking blocks are dropped first (never shown; their signatures look random). Picker titles from `summarize()` are redacted before shortening.

1. **Known patterns** (one table in `redact.ts`): AWS `AKIA…`, GitHub `ghp_/gho_/github_pat_…`, Stripe `sk_live_/rk_live_…`, OpenAI `sk-…`, Anthropic `sk-ant-…`, Slack `xox[abpr]-…`, Google `AIza…`, private key blocks, JWTs, `postgres://user:pass@` (password only), generic `KEY|SECRET|TOKEN|PASSWORD = value` (value only).
   - Generic values are hidden only if 8+ chars, no spaces/brackets, **mixing letters and digits**, and **not name-like** (`habitTracker.v1`, `expense-tracker.budgets`). Code is full of `STORAGE_KEY = "…"` constants that are not secrets.
2. **Sensitive files**: the diff of an edit/write to `.env*`, `*.pem`, `id_rsa*`, `credentials*` is replaced entirely with `[hidden: sensitive file]`. (Command output such as `cat .env` gets pattern masking only.)
3. **High-entropy strings**: tokens ≥ 32 chars, mixing letters and digits, with Shannon entropy > 4.0 → masked.
4. Mask format keeps a hint: `sk_live_••••••••3f9a` (last 4 only for secrets ≥ 16 chars).
5. Count **distinct** secrets that would have been on screen; surface "We hid N possible secrets" in the UI.
6. `test/fixtures/08-secrets-fake.jsonl` contains every fake key (as placeholders restored at test time); tests assert none survive, plus 200 random wrappings and a list of ordinary text that must stay untouched. On the 10 secret-free fixtures, 0 strings are hidden.

## 8. CLI flow

```
npx crafter-replay [--latest] [--card] [--port N] [--no-open] [--path FILE]
  1. adapters.locate()          → list of files
  2. summarize() each (in parallel, limit 8) → sort by startedAt desc
  3. picker (unless --latest / --path)
  4. parse(selected)            → ReplaySession
  5a. --card → render card headlessly → save PNG → exit
  5b. else  → start server on 127.0.0.1:<port|random free> → open browser
```

Server routes (all GET, JSON unless noted):
- `/api/sessions` → `SharedSummary[]`
- `/api/sessions/:id` → `SharedSession` (parsed lazily, cached in memory; the server strips `path`)
- `/*` → static files from bundled `web/dist`

The CLI opens `/?session=<id>`; the web UI reads `session` from the query string to know which replay to load.

`--card` opens `/?session=<id>&card=1` instead: the page draws the card, saves it through the browser's normal download (the Downloads folder), then calls `GET /api/card-done?saved=1|0` so the CLI can print the result and exit. That route exists only while `--card` runs and carries a single yes/no; it cannot read or write anything.

Security: bind `127.0.0.1` only; reject requests whose `Host` header isn't `127.0.0.1:<port>` or `localhost:<port>` (prevents DNS-rebinding); `:id` must match a located session — never accept arbitrary file paths from the browser.

`--card` headless export (Phase 1 simple path): open the UI with `?card=1&download=1` and let the page export. Pure-Node rendering (Satori + resvg) moves to Phase 2 with the share server, which needs it anyway.

## 9. Web UI architecture

- **One state reducer** (`state.ts`): `{ session, index, playing, speed, filter, cardOpen }`. Components read state and dispatch actions; no prop-drilling chains, no global store library.
- **Playback**: a single `useEffect` timer advances `index`; delay = `min(realGap / speed, 1500ms)` so idle gaps compress, and at least 100 ms so steps that happened together are still seen one by one.
- **Derived data with `useMemo`**: filtered events, track marker positions. Never stored in state.
- **Virtualized step list** from the start; it costs nothing and avoids a rewrite.
- **Card** is a normal component rendered at 1080×1920 in an off-screen node, exported via `html-to-image`.
- Styling: plain CSS with custom properties for themes (light/dark + card themes). No CSS framework needed at this size.

## 10. Testing strategy

| Layer | What | How |
|---|---|---|
| core/adapters | Real logs parse to expected events | Fixture files + snapshot of event kinds/counts |
| core/redact | No secret survives | Secrets fixture; property test with random-wrapped keys |
| core/stats | Numbers are right | Small hand-written fixtures with known totals |
| cli | Finds sessions per OS, server routes | CI matrix; temp-dir fixtures via `CLAUDE_CONFIG_DIR` |
| web | Key interactions | Vitest + Testing Library for reducer and 3–4 components; manual check list for visuals |

Rule: every bug found in a real log becomes a new fixture before it is fixed.

## 11. Performance budgets

| Item | Budget |
|---|---|
| Parse 10 MB log | < 1.5 s |
| Picker list for 200 sessions | < 1 s (summaries only) |
| Web bundle (gzipped) | < 250 KB |
| Published package unpacked | < 5 MB |
| UI interaction latency | < 50 ms per step change |

## 12. Where later phases plug in

| Phase | Addition | Touches |
|---|---|---|
| 2 | Codex / Cursor adapters | `core/adapters/*` only |
| 2 | Share links | New `packages/server` (Hono on Vercel/Cloudflare) + Postgres; `web` gets a Share button; upload is the already-redacted `ReplaySession` |
| 2 | OG images | Satori + resvg in `server`, reusing `RecapCard` layout |
| 3 | VS Code extension | New `packages/vscode`; imports `core`, embeds `web` in a webview |
| 3 | Accounts + payments | `server` + auth provider + Stripe; CLI `login` command |
| 3 | Video export | Remotion composition reusing replay components |
| 4 | Desktop app | `packages/desktop` with Tauri wrapping `web` |
| 4 | No-Node users | `bun build --compile` standalone binaries |

If a later phase needs to change `core/types.ts`, that is a deliberate, versioned decision — not a side effect.
