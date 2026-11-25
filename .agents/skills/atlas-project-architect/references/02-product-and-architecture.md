# 02 — Product & Architecture

## PRD skeleton

```markdown
# PRD — <name>
## 1. Overview
## 2. Problem
## 3. Users & personas
## 4. Goals / Non-goals
## 5. Functional requirements (FR-1 ...)
## 6. Non-functional requirements (perf, security, a11y, i18n)
## 7. User journeys
## 8. User stories + acceptance criteria
## 9. Priorities (MoSCoW)
## 10. MVP scope
## 11. Roadmap
## 12. Limitations & dependencies
## 13. Success metrics
```

Rules: every requirement gets an ID; every Must gets an acceptance criterion; non-goals are explicit (they prevent scope creep).

## MoSCoW

- **Must** — product fails without it.
- **Should** — painful to omit, not fatal.
- **Could** — nice, cheap.
- **Won't (now)** — explicitly out, with a reason.

Build Must first as a complete slice. A half-built Must is worse than a missing Could.

## Traceability

`docs/TRACEABILITY.md`

| ID | Requirement | Priority | Design | Code | Test | Status |
|---|---|---|---|---|---|---|

Status values: `todo` → `built` → `tested` → `verified`. Only `verified` counts at release.

## Architecture doc

Cover: layers · module boundaries · data flow · API boundaries · authn/authz boundary · error handling · logging · config · caching · storage · background work · external integrations · failure modes · backup/recovery.

Diagram only when it clarifies (Mermaid). A diagram that restates the folder tree adds nothing.

## ADR template

```markdown
# ADR-0001: <decision>
Date:
Status: proposed | accepted | superseded
## Context
## Decision
## Alternatives considered
## Consequences (good / bad / cost)
## Security & privacy impact
## Revisit when
```

## API design rules

- Only build an API with a real consumer.
- Version it (`/v1` or header). Document it (OpenAPI for REST).
- Validate server-side. Never trust the client.
- Define the error envelope once and use it everywhere.
- Idempotency for writes that can be retried.
- Pagination with a stable cursor or documented offset.
- Rate limit per identity, not per IP alone.
- Never invent endpoints/fields — read the docs or mark UNKNOWN.

## Data model rules

- Model the domain, not the screens.
- Constraints in the DB (unique, FK, check), not only in app code.
- Index for real queries; verify with `EXPLAIN`.
- Soft delete only if the product needs recovery — otherwise hard delete with a retention policy.
- Money as integer minor units. Timestamps in UTC.

## Monorepo decision

Use one only when packages share code and release together. Otherwise separate repos are simpler. If monorepo: define boundaries, no circular deps, independent build/test, per-package version SSOT.
