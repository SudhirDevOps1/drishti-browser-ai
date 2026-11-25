# 11 — Agent team (sub-agents)

This reference defines how the ATLAS parent agent coordinates a specialist team.
The team is **not** a committee that overrides the parent: the parent stays the
single accountable lead, delegates bounded work, verifies the report and owns
every decision. Sub-agents never own the project.

## Truth rule

- A "role" in ATLAS is a responsibility boundary, not a claim that an
  independent agent exists.
- Real, discoverable sub-agent definitions now ship in
  `atlas-project-architect/agents/opencode/` (15 files) and
  `atlas-project-architect/agents/antigravity/` (15 files).
- They are **generated**. Never hand-edit them. Source of truth:
  `atlas-project-architect/agent-roles.json`.
  Regenerate: `node scripts/generate-agents.mjs`, verify:
  `node scripts/generate-agents.mjs --check`.

## Host formats (verified 2026-11-24)

| Host | Project path | Required frontmatter |
|---|---|---|
| OpenCode | `.opencode/agents/<id>.md` | `description`, `mode: subagent`, ordered `permissions` |
| Antigravity | `.agents/agents/<id>.md` | `name`, `description`, `subagent: true`, `mainAgent: false`, `model: inherit`, `commandExecutionPolicy` |

Notes that matter:

- OpenCode permissions use **last matching rule wins**: broad deny first,
  exceptions after. Legacy fields (`tools`, `prompt`, `temperature`, `permission`)
  are not used.
- Antigravity rejects/hangs on unmapped `tools` names. Only names published in
  the official custom-subagent example are generated:
  `view_file`, `grep_search`, `replace_file_content`, `run_command`.
- No model ID is invented. Both hosts inherit the parent model.
- Review and audit roles are read-only. Roles that may write use `ask`
  (OpenCode) / `sandbox` (Antigravity), so approval stays with the user.

## Coordinator loop

```
0. CLASSIFY  — which roles does this task actually need? Usually 2–4, never all 15.
1. PACKET    — give each role a bounded prompt: goal, file paths, constraints, expected output.
2. SPAWN     — launch in parallel only when work is independent; otherwise sequence it.
3. GATE      — no external action, install, migration, deploy or commit without user approval.
4. RECEIVE   — read each report; do not merge blindly.
5. VERIFY    — re-run the claimed command yourself. Evidence or it did not happen.
6. RESOLVE   — conflicting advice: safety > correctness > security > maintainability.
7. RECORD    — decisions, assumptions, handoff, version/changelog when files changed.
```

## Activation map

| ID | Delegate when | Default scope |
|---|---|---|
| `ui-ux-designer` | screens, layout, tokens, flow decisions | read-only spec |
| `frontend-engineer` | component/build work in the detected stack | write on ask |
| `react-nextjs-engineer` | React/Next.js routing, RSC boundaries, rendering | write on ask |
| `animation-engineer` | transitions, micro-interactions, scroll motion | write on ask |
| `backend-engineer` | handlers, workers, services, server logic | write on ask |
| `api-architect` | endpoint/schema/contract changes | contract first |
| `database-architect` | schema, indexes, transactions, RLS, slow queries | read + plan only |
| `security-engineer` | threat model, auth review, dependency audit | read-only findings |
| `qa-engineer` | tests, E2E, console/network checks | write tests on ask |
| `performance-engineer` | profiling, budgets, query plans | measure only |
| `devops-engineer` | CI, containers, hosting, rollback | config on ask |
| `code-reviewer` | change set ready, before merge | read-only verdict |
| `accessibility-engineer` | any UI change or a11y audit | read-only findings |
| `supply-chain-engineer` | new dependency, publish, licence audit | read-only findings |
| `docs-engineer` | material file changes, before release | write on ask |

Do **not** delegate: one-line snippets, a regex, an explanation, or a task with
no file changes. Handle those in the parent thread. Delegating everything is a
context tax and a reliability loss.

## Delegation packet

Send this, not the whole chat history — sub-agents start with fresh context:

```
ROLE: <id>
GOAL: <one measurable outcome>
FILES: <exact paths>
CONTEXT: <design decision / contract / baseline already agreed>
CONSTRAINTS: no install, no commit, no deploy, no production data, no secret values
OUTPUT: <the section headings from the role's "Output format">
DONE WHEN: <the check that proves it>
```

## Handoff contract

Every report must contain:

1. What was inspected (paths, versions, git state).
2. What changed (or "no change — findings only").
3. Command + real output, or `NOT RUN` with the reason.
4. Remaining risk and who should resolve it.

The parent then decides. A sub-agent verdict is advice, not authority. When two
roles disagree, apply the ATLAS conflict order and record the decision in
`ASSUMPTIONS.md` if the choice changes architecture, security, cost or product
direction.

## Verification of the team itself

```
node scripts/generate-agents.mjs --check   # no drift, all 30 files present
node --test tests/agents.test.mjs          # frontmatter + safety invariants
```

Both must pass before claiming the team is installed. Registration in a real
host is a separate check: open the project with OpenCode or Antigravity, then
confirm the agent is listed and can be invoked. A file existing is not proof
the host loaded it.

## Distribution

The generated files are a **source library** inside the skill. A host only
discovers them when they are placed at its project path. Use the project setup
script to copy them into `.opencode/agents/` and `.agents/agents/` of a target
project — after approval. Never overwrite an existing agent silently.
