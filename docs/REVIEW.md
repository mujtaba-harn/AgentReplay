# Security and privacy review checklist (F1.25)

For the outside developer reviewing AgentReplay before its first npm release. Please read
`docs/PRD.md` (US-6) and `docs/ARCHITECTURE.md` §7–§8 first; they state what we promise.

**What AgentReplay is:** `npx agentreplay` reads Claude Code's local session logs
(`~/.claude/projects/**/*.jsonl`), parses and redacts them in `packages/core`, and serves a replay
page from a local HTTP server in `packages/cli`. The page (`packages/web`) can export a
1080×1920 PNG "recap card" meant to be posted publicly.

**The promises under review:**

1. No data leaves the machine: no telemetry and no outbound network calls at runtime.
2. Likely secrets are masked inside `core` before any text reaches the browser.
3. The local server cannot be used by another website, or another device, to read sessions or files.
4. The recap card never shows code or file contents, and shows file names only if the user opts in.
5. The published package contains only what it should.

## Setup (about 10 minutes)

```sh
pnpm install
pnpm check && pnpm test && pnpm build
pnpm --filter agentreplay smoke        # packs, installs into a temp folder, runs a replay
node packages/cli/dist/index.js --latest
```

Node 22+. The public test logs are in `packages/core/test/fixtures/`. They are stubbed copies of
real logs, and the secrets fixture's fake keys are built at runtime by
`packages/core/test/support/public-fixtures.ts`.

## 1. Redaction (`packages/core/src/redact.ts`, `adapters/claude-code/read-events.ts`)

How it works today:

- Each user/assistant log line is redacted as a whole JSON value (`redactDeep`) right after
  `JSON.parse`, before any title, event or stat is built. Thinking blocks are dropped first.
- Session titles in `summarize.ts` are redacted before they are shortened.
- **Masks:**
  - Known key patterns (`SECRET_PATTERNS`: Anthropic, OpenAI, AWS, GitHub, Google, Slack,
    Stripe, JWT), passwords in URLs, and `KEY=value` assignments whose value mixes letters and
    digits.
  - PEM private-key blocks.
  - Any 32+ character token with Shannon entropy above 4.0.
- A mask keeps the last 4 characters as a hint when the secret is 16+ characters long:
  `sk-ant-••••••••Ab3x`. **Please judge whether that hint is acceptable.**
- Edits and writes to `.env*`, `*.pem`, `id_rsa*` and `credentials*` have both sides of the diff
  replaced with `[hidden: sensitive file]`.

Please check:

- [ ] Every string field of `ReplayEvent` / `ReplaySession` comes from redacted input. Look for
      any path from a raw line to the output that skips `redactDeep`, including subagent logs
      (`read-session.ts`).
- [ ] Try to get a secret through: keys split across lines or JSON-escaped, base64-wrapped keys,
      keys inside file paths, keys in tool *inputs* vs tool *results*, very long lines.
- [ ] False negatives we already know about (please say whether they block a release):
      - command output such as `cat .env` gets pattern and entropy masking only, not the
        sensitive-file rule;
      - plain-word passwords without digits (`password=correcthorse`) are not masked.
- [ ] `warnings.redactions` should count masks that actually appear in the output. Check it does.

## 2. Local server (`packages/cli/src/server.ts`, `static.ts`)

How it works today:

- It binds to `127.0.0.1` only, on a random port unless `--port` is given.
- It rejects any `Host` header other than `127.0.0.1:<port>` / `localhost:<port>` (403), against
  DNS rebinding.
- Only GET and HEAD are allowed. There are no CORS headers. CSP is `default-src 'self'`, plus
  `X-Frame-Options: DENY`, `nosniff`, `no-referrer` and `CORP: same-origin`.
- `/api/sessions/:id` serves only ids from the sessions the CLI located itself; the browser can
  never name a path.
- Static files are resolved inside the bundled `dist/web` folder; anything resolving outside it
  is refused.
- `GET /api/card-done?saved=1|0` exists only during `--card` and only makes the CLI print a
  message and exit.

Please check:

- [ ] Path traversal in `fileInside()`: encoded `..`, backslashes on Windows, `%00`, long paths,
      symlinks inside `dist/web`.
- [ ] Host check: IPv6 `[::1]`, uppercase, trailing dots, absolute-form request lines.
- [ ] What a malicious web page open in the same browser can do. It cannot read responses
      without CORS, but it can fire GETs. Is the side effect of `/api/card-done` (the CLI exits
      during `--card`) acceptable?
- [ ] Error responses never include log text. A 500 is a fixed sentence.
- [ ] `/api/sessions` returns each summary's absolute `path`, which contains the OS user name.
      It is local only, but should it be stripped before the browser sees it?

## 3. Recap card (`packages/web/src/card.ts`, `moment.ts`, `components/RecapCard.tsx`, `export.ts`)

- [ ] The card renders only: the title (the first prompt, redacted, shortened to 60 characters,
      user-editable), counts, step kinds, the "biggest moment" sentence and, when opted in,
      bare file names (no folders). Nothing else from events should reach it.
- [ ] The title can contain code if the first prompt did. Is relying on the editable title
      enough?
- [ ] The PNG export (`html-to-image`, `skipFonts: true`) makes no network requests. Check the
      browser's network panel while exporting.
- [ ] The downloaded file name is `agentreplay-card-YYYY-MM-DD.png`, with no project names.

## 4. Package and publishing (`packages/cli/package.json`, `tsup.config.ts`, CI)

- [ ] `npm pack --dry-run` in `packages/cli` (after a build): the tarball should hold only
      `dist/index.js`, `dist/web/**`, `README.md`, `LICENSE` and `package.json`. No fixtures, no
      source maps, no local paths.
- [ ] `dist/index.js` bundles `core`; runtime dependencies are `zod`, `@clack/prompts` and
      `open` (which spawns the OS browser opener). Review them and their transitive dependencies.
- [ ] `"private": true` is still set on purpose, so it can't be published by accident. The plan
      for F1.26: remove it, publish from GitHub Actions with `--provenance`, with 2FA on the npm
      account. Please flag anything missing.
- [ ] Nothing in the repo or its history contains real secrets or full real logs. The full logs
      live only in the git-ignored `packages/core/test/fixtures-private/`.

## Reporting

Please open GitHub issues (or send one notes file), each with:

- **severity:** blocker, should fix before release, or later;
- **where:** file and line;
- **how to reproduce:** a log line or request is ideal;
- **suggested fix**, if any.

Each fix will come with a test that reproduces the problem first.
