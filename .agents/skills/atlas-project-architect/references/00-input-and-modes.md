# 00 — Input & Modes

## Input template

Ask for these once, then stop asking. Empty is acceptable — decide and record.

```
IDEA:
NAME (optional):
TYPE: website | web app | SaaS | mobile | desktop | API | CLI | game | library | devtool | existing repo
SOURCE: new | local folder | GitHub repo | broken app | redesign
LINKS: references, screenshots, docs, APIs, SDKs
USERS:
PLATFORMS:
SCALE: users / data / traffic / offline needs
LOGIN: required? for whom?
SENSITIVE DATA: none | personal | financial | health
BUDGET: free-first?
HOSTING: free tier ok?
EXTRA RULES:
```

## Assumption policy

For every gap: inspect → research → choose the safe default → write it in `ASSUMPTIONS.md` with how to validate it.

```markdown
| # | Assumption | Why | Impact if wrong | How to validate |
|---|---|---|---|---|
| 1 | Users are mobile-first | target audience unclear | layout priority | ask after demo |
```

Ask the user only when the answer changes **architecture, security, legality, cost, or product direction**. Everything else: decide and move.

## Mode playbooks

### Greenfield
1. Restate the idea in 3 lines; list what's missing.
2. Research existing solutions before designing anything.
3. Write PRD + MoSCoW + MVP scope.
4. Choose the smallest stack that satisfies it.
5. Build a walking skeleton (one thin end-to-end path) before breadth.
6. Expand feature by feature with tests.

### Brownfield
1. `git status`, `git log --oneline -20`, branches.
2. Read README, AGENTS.md, MEMORY.md, HANDOFF.md, manifests, lockfiles, CI config.
3. Map structure: entry points, modules, data layer, external calls.
4. Run build + tests **yourself**; record the baseline (may already be red).
5. Produce an audit: works / incomplete / broken / insecure / outdated / complex / reusable.
6. Change incrementally; never rewrite to "clean up" without a documented reason.

### Repair
1. Reproduce reliably (exact command, input, environment).
2. Reduce to the smallest failing case.
3. Find the root cause — read the code path, don't guess.
4. Fix, add a regression test, re-run neighbours.
5. If it can't be fixed safely, document why and the options.

### Upgrade / redesign
Inventory → dependency + security audit → identify what must not break → plan phases → migrate behind tests → verify visually and functionally.

### Audit-only
Read-only. No file writes, no installs. Output: findings table with severity, evidence (file:line), impact, recommended fix, effort estimate.

### Spike
Time-boxed. Throwaway code in a scratch folder. Goal is an answer to one question ("can X do Y?"). Never promote a spike to product without re-doing it properly.

## First response shape

Before code: understanding → problems → existing solutions → stack table → free plan → security/privacy → structure → priorities → risks. Then start foundation work.
