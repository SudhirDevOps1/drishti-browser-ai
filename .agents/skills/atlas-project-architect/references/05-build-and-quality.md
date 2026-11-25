# 05 — Build & Code Quality

## Structure

Separate: app/UI · business logic · data access · API routes · config · tests · scripts · assets · docs · infra.

Adapt to the ecosystem — don't force a JS layout onto a Go or Python project.

## Smells to avoid

Files over ~400 lines · circular deps · duplicated logic · unused components · needless abstraction · hardcoded secrets · vague names · committed build output/caches · dead code · commented-out graveyards.

## Standards

- Names follow ecosystem convention.
- No magic numbers — named constants.
- Config separate from logic.
- Errors handled explicitly; no silent `catch {}`.
- Validate at the boundary; server is the real boundary.
- Comments explain **why**.
- Types where the language supports them; `any` needs a reason.
- Small functions, single responsibility, obvious data flow.

## Tooling (choose per stack)

| Need | Options |
|---|---|
| Format | Prettier · Biome · ruff format · gofmt · cargo fmt · Spotless |
| Lint | ESLint · Biome · Ruff · golangci-lint · Clippy · ShellCheck |
| Types | tsc --noEmit · Pyright · mypy |
| Hooks | Husky + lint-staged · pre-commit |

Hooks are convenience, not a security boundary — CI repeats everything.

## Package management

**pnpm (JS/TS)** with a shared store: download once, reuse across projects.

```ini
# .npmrc
node-linker=isolated
save-exact=true
engine-strict=true
auto-install-peers=true
prefer-offline=true
verify-store-integrity=true
onlyBuiltDependencies[]=esbuild
```

```bash
corepack enable
pnpm config set store-dir "D:/.pnpm-store"
pnpm install --frozen-lockfile   # CI
pnpm install --offline           # only if fully cached
```

Honesty: the store saves **disk and download**, not RAM/CPU. `--offline` fails for uncached packages. pnpm does not make cloud APIs work offline. `pnpm store prune` can break old projects — ask first.

Other ecosystems: uv (Python), Maven/Gradle (Java), Cargo (Rust), Go modules, Composer, NuGet — document the cache location.

## Supply chain

Commit the lockfile · pin `packageManager` · no floating `latest` · review install scripts · `audit` in CI · no global installs without approval · HTTPS registry.

## Env & secrets

`.env.example` (names only) · `.gitignore` covers env/keys/certs/build/logs/local DB · classify every variable public/private/optional · document in `docs/deployment/ENVIRONMENT-VARIABLES.md`.

## PR discipline

Small, one concern. Description: what, why, how tested (evidence), screenshots for UI, security impact, migration notes, docs/version updated.

## Definition of done (task)

Requirement met · conventions followed · input validated · errors handled · tests added · security considered · UI states covered · a11y checked · docs updated · memory updated · version synced if user-visible · evidence captured.
