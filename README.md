# Crafter Replay

[![CI](https://github.com/mujtaba-harn/AgentReplay/actions/workflows/ci.yml/badge.svg)](https://github.com/mujtaba-harn/AgentReplay/actions/workflows/ci.yml)

**Watch a Claude Code session again, step by step, in your browser — and turn it into a recap card you can share.**

<!-- F1.24: the demo GIF goes here once it is recorded. -->

- **Replay** every prompt, edit, command and error on a timeline you can play, pause, speed up and filter.
- **See what changed**: red/green diffs, command output, and which later step fixed each error.
- **Share a recap card**: a 1080×1920 image with the session's shape and stats, in three styles.

Everything runs on your own computer. **Data never leaves your computer.**

## Before you start

You need:

1. **Node.js 22 or newer.** Check with `node --version`. If it's missing or older, install it from [nodejs.org](https://nodejs.org).
2. **At least one Claude Code session** on this computer. Crafter Replay reads the logs Claude Code already keeps in `~/.claude/projects` (or in `CLAUDE_CONFIG_DIR`, if you set it).

## Use it

Open a terminal and run:

```sh
npx crafter-replay
```

1. A list of your sessions appears, newest first. Move with **↑ / ↓** and press **Enter**.
2. Your browser opens the replay.
3. Press **Space** to play or pause, **← / →** to step, or click any step to see it in detail.
4. Click **Recap card** to make a card, then **Download PNG** or **Copy image**.
5. When you're done, go back to the terminal and press **Ctrl+C**.

The first run downloads Crafter Replay, which takes a few seconds.

## Options

| Option | What it does |
|---|---|
| `--latest` | Open the most recent session; skip the list |
| `--path FILE` | Open a specific session log file |
| `--card` | Save a recap card PNG of the latest session (or `--path`) and exit |
| `--port N` | Use port N for the local page (default: any free port) |
| `--no-open` | Don't open the browser; just print the address |
| `-h`, `--help` | Show all options |
| `-v`, `--version` | Show the version |

Example: `npx crafter-replay --card` saves today's card to your browser's Downloads folder without opening the replay.

## Privacy

Crafter Replay is built so your code stays private:

- **Nothing is uploaded.** There is no account, no telemetry and no analytics. The only network traffic is between your browser and Crafter Replay on your own computer.
- **The page is only reachable from your computer.** It listens on `127.0.0.1`, rejects requests that claim to come from anywhere else, and can only show sessions it found itself — never a file a web page asks for.
- **Likely secrets are hidden before anything is shown**: API keys (Anthropic, OpenAI, AWS, GitHub, Stripe and more), passwords in links, private keys, and long random-looking values. The page tells you how many it hid.
- **Sensitive files stay hidden.** Changes to `.env` files, keys and credential files are never shown.
- **Recap cards never show code or file contents.** File names are off by default; you can turn them on.

No automatic check is perfect. Look at a card before you post it.

## Supported versions

- **Claude Code**: tested with 2.1.328 – 2.1.330. Claude Code's log format isn't documented and can change; if a newer version adds something Crafter Replay doesn't recognise, that line is skipped and the page tells you how many were skipped.
- **Systems**: Windows, macOS and Linux, with Node.js 22 or 24.

## If something goes wrong

| You see | Try this |
|---|---|
| "No Claude Code sessions found in …" | Run a session with Claude Code first, or open a log with `--path FILE`. |
| "Port N is already in use." | Leave out `--port`, or pick another number. |
| The browser didn't open | Copy the address printed in the terminal into your browser. |
| "The session list needs an interactive terminal." | Use `--latest` or `--path FILE`. |
| "Can't reach Crafter Replay." in the browser | The terminal was closed. Run `npx crafter-replay` again. |

Still stuck? Run with `DEBUG=crafter-replay` to see details, and [open an issue](https://github.com/mujtaba-harn/AgentReplay/issues).

## For developers

This repo is a pnpm workspace: `packages/core` (log parsing and redaction), `packages/cli` (the command and local server) and `packages/web` (the replay page). Design notes live in [`docs/`](docs/).

```sh
pnpm install
pnpm check && pnpm test && pnpm build
node packages/cli/dist/index.js --latest
```

## License

[MIT](LICENSE)
