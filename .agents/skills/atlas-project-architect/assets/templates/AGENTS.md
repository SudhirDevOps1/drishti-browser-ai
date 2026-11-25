# AGENTS.md — <Project Name>

## Purpose
<One paragraph: what this project is and who it serves.>

## Stack
- Language / runtime:
- Framework:
- Database:
- Hosting:
- Package manager:

## Structure
```
src/        application code
tests/      automated tests
docs/       project documentation
scripts/    tooling
```

## Commands
```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
pnpm run version:verify
```

## Conventions
- Branching: main + short-lived feature branches.
- Commits: Conventional Commits.
- Formatting / lint: <tool>.
- Naming: <rules>.
- Docs: UPPER-KEBAB-CASE `.md`, kebab-case folders.

## Security rules
- Never commit secrets. Use `.env` locally, platform secrets in CI/hosting.
- Server-side validation is the real boundary.
- Check ownership on every protected resource.

## Do not change without approval
- Database schema / migrations
- Auth flow
- Deployment configuration
- Public API contracts

## Where to look first
1. `HANDOFF.md` — latest state
2. `MEMORY.md` — decisions and history
3. `TASKS.md` — what's next
4. `docs/PROJECT-STATUS.md` — current stage
