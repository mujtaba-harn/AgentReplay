# Sample Claude Code logs (cleaned)

Real sessions recorded on Windows with Claude Code 2.1.330 on 22 Nov 2026. Use these as test fixtures (F0.6).

**Cleaned:** email → `demo-user@example.com`, Windows user folder → `demo-user`, account and organization IDs → all zeros.

**Trimmed for the public repo.** The full logs live in `../fixtures-private/`, which is git-ignored and exists only on the maintainer's machine. The files here are built from them with `pnpm --filter @agentreplay/core fixtures:public`:

- `user`, `assistant` and `cost-state` lines are kept exactly as recorded.
- `attachment`, `api-request`, `api-request-shape` and `api-request-blob` lines (Claude Code's system prompt, tool descriptions, request copies) are replaced one-for-one by a made-up line of the same shape: same keys, IDs, timestamps, working folder and platform, every other string set to `"stub"`, lists cut to one item. The parser still meets them and must skip them.
- Other small line types (`session-owner`, `mode`, …) are kept.
- `08-secrets-fake.jsonl` stores placeholders such as `{{FAKE_STRIPE_KEY}}` instead of key-shaped strings. Tests swap the fake keys back in at runtime with `restoreFakeSecrets()` from `../support/public-fixtures.ts`.

`../fixtures.test.ts` checks that no key-shaped strings or system prompt text are committed. Tests comparing against the full logs skip when `fixtures-private/` is missing (as in CI).

| File | Lines | Prompts | Minutes | What it covers |
|---|---|---|---|---|
| `01-todo-app-short.jsonl` | 74 | 1 | 0.8 | Normal short build: Read, Glob, Write, Bash |
| `02-notes-cli-multi-turn.jsonl` | 214 | 3 | 3.5 | Three rounds continued with `-c`; Write, Edit, PowerShell, Bash; 4 tool errors |
| `03-bugfix-failing-tests.jsonl` | 130 | 1 | 0.7 | Failing tests, 6 edits to fix 5 planted bugs |
| `04-explain-read-only.jsonl` | 67 | 1 | 0.4 | 6 reads, no edits |
| `05-expense-tracker-long.jsonl` | 1,236 | 5 | 29.6 | Biggest file (2.6 MB here, 3.7 MB full): 80 edits, 63 task-list events, 12 tool errors, one subagent |
| `05-expense-tracker-subagent.jsonl` | 74 | 1 | 3.7 | The subagent's own log: separate file, 11 reads |
| `06-tiny-question.jsonl` | 34 | 1 | 0.1 | One answer, no tools |
| `07-interrupted-max-turns.jsonl` | 85 | 1 | 0.4 | Stopped after 4 turns, work unfinished |
| `08-secrets-fake.jsonl` | 78 | 1 | 0.7 | Fake Stripe, OpenAI, GitHub, AWS keys and a database password |
| `09-model-switch.jsonl` | 117 | 2 | 0.7 | Sonnet 5.5 then Haiku 5.5 in one session |
| `10-habit-tracker-resumed.jsonl` | 333 | 3 | 6.4 | Resumed twice; all in the same file |
| `11-vscode-pasted-prompt.jsonl` | 4 | 1 | 0.2 | Hand-written, not recorded: VS Code prompt shape (editor context + pasted text) |

## Findings that change the plan (for ARCHITECTURE.md §6)

1. **Most lines are not conversation.** Besides `user` and `assistant`, logs contain `session-owner`, `queue-operation`, `attachment`, `data-flow-records`, `atis-latch`, `last-prompt`, `api-request-shape`, `api-request-blob`, `api-request`, `tools-used`, `mode` and `cost-state`. The parser must skip unknown types quietly.
2. **`cost-state` gives exact totals:** `totalCostUSD`, `totalLinesAdded`, `totalLinesRemoved`, `totalDuration` and per-model token usage. Prefer it over our own estimate when present — except `totalDuration`, which is per Claude Code process and wrong for continued sessions; duration comes from timestamps instead.
3. **Tool names differ from the docs:** Windows uses `PowerShell` as well as `Bash`; the task list is `TaskCreate` / `TaskUpdate` (not `TodoWrite`); subagents are `Agent` (not `Task`); also `Skill` and `ToolSearch`. Map `PowerShell` → command, `TaskCreate`/`TaskUpdate` → task-list event, `Agent` → subagent event.
4. **Subagents write their own file** in a `subagents` folder inside the session folder. `locate()` must find these and link them to the parent session.
5. **Resumed sessions (`-c`) append to the same file**, so one file can hold several prompts.
6. **`attachment` lines carry the working folder and platform**, which helps show the project name and OS.
