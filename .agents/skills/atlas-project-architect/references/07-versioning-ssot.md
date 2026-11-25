# 07 — Versioning: Single Source of Truth

## Principle

One version, one writer, everything else generated.

- SSOT: `package.json#version` (JS/TS) or root `version.json`.
- Only SSOT is hand-edited — via scripts.
- Derived files carry `AUTO-GENERATED — DO NOT EDIT`.
- `sync` is idempotent; `verify` fails CI on drift.

## Channels

```
alpha < beta < rc < stable
0.1.0-alpha.1 < 0.1.0-alpha.2 < 0.1.0-beta.1 < 0.1.0-rc.1 < 0.1.0
```

Prerelease: `MAJOR.MINOR.PATCH-<alpha|beta|rc>.<n>`. Build metadata `+sha` never affects ordering.

## Commands

```bash
node scripts/version.mjs bump patch        # 0.1.0 -> 0.1.1
node scripts/version.mjs bump minor        # 0.1.0 -> 0.2.0
node scripts/version.mjs bump major        # 0.1.0 -> 1.0.0
node scripts/version.mjs bump prerelease   # alpha.1 -> alpha.2
node scripts/version.mjs bump alpha        # 0.1.0 -> 0.2.0-alpha.1
node scripts/version.mjs bump beta         # alpha.3 -> beta.1
node scripts/version.mjs bump rc           # beta.2 -> rc.1
node scripts/version.mjs bump stable       # rc.1 -> 0.1.0
node scripts/version.mjs set 0.2.0-beta.0
node scripts/version.mjs sync
node scripts/version.mjs verify
```

Flags: `--dry-run`, `--json`, `--no-changelog`, `--allow-downgrade`.
Exit: `0` ok · `1` invalid/drift · `2` usage · `3` write failure.

## Derived surfaces

| Surface | File | What changes |
|---|---|---|
| App constant | `src/generated/version.ts` | `APP_VERSION` |
| Runtime | `public/version.json` | whole file |
| README | `README.md` | badge + version line |
| Changelog | `CHANGELOG.md` | new `## [x.y.z]` heading |
| Docs | `docs/**/*.md` | `version:` front-matter |
| Web | `index.html` | `<meta name="app-version">` |
| API | `/health`, `/api/version` | reads constant |
| OpenAPI | `openapi.yaml` | `info.version` |
| Android | `build.gradle` | `versionName`, `versionCode` |
| iOS | `Info.plist` | `CFBundleShortVersionString`, `CFBundleVersion` |
| Tauri | `tauri.conf.json` | `version` |
| Expo | `app.json` | `version` |
| Docker | `Dockerfile` | OCI version label |
| SBOM | `sbom.json` | component version |
| Sentry | config | release id |
| PWA | service worker | cache name |
| Memory | `MEMORY.md`, `HANDOFF.md` | current version |
| Status | `docs/PROJECT-STATUS.md` | version line |

Missing surface → skip silently. Never create files just to have a target.

## Android versionCode

```
base = (major*10000 + minor*100 + patch) * 1000
channel = alpha:0  beta:100  rc:200  stable:900
versionCode = base + channel + n      (n ≤ 99)
```

`0.1.0-alpha.3` → 100003 · `0.1.0` → 100900 · `0.1.1-alpha.1` → 101001. Must be strictly increasing.

Because the packing multiplies `minor` and `patch` by 100, both must be `0–99`. A version
such as `1.100.0` or `2.0.0` would otherwise produce the same code (`20000900`), so the
bundled tool rejects `minor`/`patch` above 99.

## Behaviour contract

1. Validate SemVer + channel before writing.
2. Deterministic next version (no clock, no randomness).
3. Atomic write (temp → rename), then sync.
4. No partial writes: on failure restore and exit non-zero.
5. Idempotent.
6. No network.
7. Print a diff summary.
8. Refuse downgrades/channel regressions without flags.
9. Update changelog unless disabled.
10. Touch git only when asked.

## CI

```yaml
- run: pnpm run version:verify
- run: pnpm run version:sync --dry-run
```

Release gate: tag must equal `v` + SSOT version.

## Release flow

bump/set → sync → changelog → full gate → commit `chore(release): vX.Y.Z` → annotated tag → push → build artifacts from the tag → verify `/health` reports the same version.

## Acceptance

- bump changes exactly the expected surfaces.
- sync twice = zero diff.
- verify fails on a hand-edited derived file.
- invalid input (`1.2`, `v1.2.3`, `01.2.3`, `1.2.3-`, `1.2.3-alpha.100`) exits non-zero.
- downgrade blocked without flag.
- `--dry-run` writes nothing.
- monorepo: run the tool inside each package (per-package SSOT); a root `pnpm -r run version:bump patch` iterates them.

## Implementation notes (bundled `scripts/version.mjs`)

These are behaviours the shipped script guarantees — verified by running it, not assumed:

- **Transactional.** `bump`/`set` write the SSOT and every derived file, then re-read the SSOT to confirm. Any write failure rolls every already-written file and the SSOT back to its previous bytes and exits `3`. No half-applied release.
- **BOM-safe.** A UTF-8 BOM in `package.json` or a doc is preserved; detection regexes run on the BOM-stripped text, so front matter is still found on Windows-authored files.
- **Structure-gated creation.** `src/generated/version.ts` and `public/version.json` are created only when `src/` or `public/` already exists. A project without those folders is never given empty scaffolding.
- **Badge-safe.** The README badge rewrite matches `badge/version-<semver>` with a strict channel allowlist, so the `-blue` colour suffix survives (an early version ate it).
- **Changelog placement.** New entries go under `## [Unreleased]`, newest first; trailing blank lines are normalised; an existing entry for the version is not duplicated.
- **Prerelease ceiling.** `n` is capped at 99 so `versionCode` cannot collide with the next patch; exceeding it exits `1`.
- **Top-level key only.** `package.json#version` is read and written by a depth-aware scanner, so npm's `scripts.version` lifecycle hook — which can appear before the root key — is never mistaken for the SSOT. `show` reports the root version; `set` rewrites only the root value.
- **Windows rename retry.** Atomic replace retries 5× with a short wait, because antivirus/indexer locks make `rename` transiently fail.
- **Flags.** `--dry-run`, `--json`, `--no-changelog`, `--allow-downgrade`, `--help`; flags may appear before or after the command. Any other flag exits `2` instead of being ignored.
