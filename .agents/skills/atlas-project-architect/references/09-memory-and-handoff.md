# 09 — Memory & Handoff

## Why

Sessions die, context expires, models change, weeks pass. The repo must carry the project's state, not the chat.

## Files

| File | Holds | Update when |
|---|---|---|
| `AGENTS.md` | permanent rules: purpose, stack, structure, commands, conventions, do-not-touch | architecture/instruction change |
| `MEMORY.md` | decisions, discoveries, failed approaches, current version, next priority | each milestone |
| `HANDOFF.md` | latest session: changed, broken, next, exact commands | end of session |
| `TASKS.md` | Done / Doing / Pending / Blocked / Proposed + acceptance criteria | continuously |
| `ASSUMPTIONS.md` | assumption, why, impact, validation | when assumed |
| `docs/PROJECT-STATUS.md` | stage, working features, blockers, test/security results, deploy state | each milestone |
| `docs/SESSION-LOG.md` | append-only session history | end of session |
| `docs/decisions/ADR-*` | durable decisions | each major decision |

Never store secrets, tokens, credentials, or personal data. Names only.

## Update discipline

- Update during work, not later.
- Exact: files, commands, results. Never "improved project".
- Short enough to be read.
- Docs are claims — verify against code before trusting.

## Takeover protocol

```
1. Read AGENTS.md → HANDOFF.md → MEMORY.md → PROJECT-STATUS.md → TASKS.md
2. Read README + latest SESSION-LOG entry
3. git status, recent commits, branches
4. Manifests, lockfiles, CI config
5. Run build + tests yourself (don't trust stated results)
6. version:verify (no drift)
7. Compare docs to reality; fix or flag
8. Continue from the first incomplete task
```

## Handoff template

```markdown
# HANDOFF — <date>
## State
## Changed this session
## Verified (commands + results)
## Broken / failing
## Next 3 actions
## Do not change
## Environment notes (names only, no values)
```

## Context pressure

When the window is filling:

1. Stop starting large work.
2. Persist state to disk.
3. Update MEMORY, HANDOFF, TASKS.
4. Record exact next commands.
5. Separate verified from assumed.
6. Leave the repo buildable, or clearly marked broken with the reason.

## Recovery

Prefer `git revert` over history rewriting. No force-push to shared branches. Restore backups only with approval and a verified copy.
