# ATLAS Project Architect — portable skill

A process skill for any coding agent. It turns "build me this" into a researched,
secure, tested, documented, deployable project — with a single source of truth for
versioning and a handoff another agent can continue.

```text
atlas-project-architect/
├── SKILL.md                  # the skill (loaded when triggered)
├── references/               # 13 files: 10 phases + 3 domain packs, loaded on demand
├── assets/templates/         # AGENTS.md, MEMORY.md, HANDOFF.md, ... (6)
├── agent-roles.json          # single source of truth for the 15-role team
├── agents/                   # 30 generated files: opencode/ + antigravity/
└── scripts/version.mjs       # working SSOT version tool
```

## Install

Copy this folder into the skills directory your agent reads. The folder name matters —
it matches `name:` in the front matter.

| Agent | Project | Global |
|---|---|---|
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| Codex | `.agents/skills/` | `~/.agents/skills/` |
| Cursor | `.agents/skills/` | `~/.cursor/skills/` |
| Antigravity | `.agents/skills/` | `~/.gemini/config/skills/` |
| OpenCode | `.agents/skills/` or `.opencode/skills/` | `~/.config/opencode/skills/` |
| GitHub Copilot | `.agents/skills/` | `~/.copilot/skills/` |

```bash
# from a clone of the repository
node scripts/install-skill.mjs --agent claude-code --scope global
```

Or by hand:

```bash
mkdir -p ~/.claude/skills
cp -R atlas-project-architect ~/.claude/skills/
```

Every agent path, the chat-UI fallback, updating and troubleshooting:
[`INSTALL.md`](../INSTALL.md) · [`docs/AGENT-COMPATIBILITY.md`](../docs/AGENT-COMPATIBILITY.md).

Start a new session after installing — agents scan the skills directory at startup.

## What to give the AI

The skill supplies the process; you supply the project. Answering the six questions in
`assets/templates/PROJECT-INPUT.md` removes most of the guesswork:

```text
GOAL · USERS · PLATFORM · DATA · BUDGET · DEADLINE
```

Do not paste the references up front. `SKILL.md` loads one phase at a time; pasting all
thirteen costs 10–15× more context and produces a worse result.

For a chat UI with no filesystem, paste `SKILL.md` as the first message. Use
`ATLAS-MASTER-PROMPT.md` when you want the whole rulebook in one paste.

## Version tool

Copy `scripts/version.mjs` into the target project's `scripts/` folder and add:

```json
{
  "scripts": {
    "version:bump": "node scripts/version.mjs bump",
    "version:set": "node scripts/version.mjs set",
    "version:sync": "node scripts/version.mjs sync",
    "version:verify": "node scripts/version.mjs verify"
  }
}
```

Then:

```bash
pnpm run version:bump patch
pnpm run version:sync
pnpm run version:verify
```

It is dependency-free (Node 22+), atomic, idempotent, and skips surfaces the project
does not have. A failed write restores every file it already touched. It reads and writes
only the top-level `"version"` — never a `scripts.version` hook — and refuses
`minor`/`patch` above 99 so the Android-style `versionCode` cannot collide.

## Context cost

- Skill metadata: ~120 tokens, always present.
- `SKILL.md`: ~1.8k tokens, loaded when triggered.
- One reference: ~1–2k tokens, only when that phase is active.

That is roughly 10–15% of the cost of pasting the full master prompt on every turn.

## Limits

- Prompt-level behaviour. No automated eval suite exists; the four CLIs (version,
  installer, generator, setup) are the tested code.
- No `--all` monorepo iteration in the bundled version tool — run it per package or use
  `pnpm -r run version:sync`.
- The bundled tool never commits or tags. Git operations stay yours.
- The setup tool is resumable, not transactional: a mid-run failure leaves completed
  actions in place and prints how to resume.

MIT licensed. Security policy: [`SECURITY.md`](../SECURITY.md).
