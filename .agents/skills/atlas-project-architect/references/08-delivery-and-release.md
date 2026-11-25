# 08 — Delivery & Release

## Hosting evaluation

| Provider | Free tier | Card | Limits | Sleep | DB | Subdomain | Commercial | Checked |
|---|---|---|---|---|---|---|---|---|

Candidates to research, never assume: Cloudflare Pages/Workers/D1 · GitHub Pages · Vercel · Netlify · Render · Fly.io · Deno Deploy · Neon · Supabase · self-host.

Pick the minimum model that works: static · frontend + serverless · frontend + managed DB · full-stack · container · desktop/mobile distribution · self-host.

## Deploy doc

`docs/DEPLOYMENT.md`: account → repo connect → build command → output dir → runtime → env vars → DB + migrations → domain/subdomain → first deploy → verification → rollback → redeploy → troubleshooting. Exact commands and official links.

## Verify before claiming

- URL returns 200 and renders.
- `/health` reports the SSOT version.
- Core journey works on the deployed build.
- No secret in the client bundle (spot-check).
- Limits documented: what happens at quota.

## Rollback

Previous artifact identified · one command/click · migration rollback considered · backup verified · trigger owner defined.

## Release channels

| Channel | Requirements |
|---|---|
| alpha | architecture + core features, basic tests, limits documented |
| beta | features complete, regression tests, security review, docs |
| rc | critical bugs fixed, compatibility checked, deploy validated |
| stable | all gates pass, rollback verified, docs complete |

## Release checklist

bump + sync → changelog → version:verify → tests → build → security scans → licence check → artifact + checksum + SBOM → annotated immutable tag → release notes → deploy → live verify → memory/handoff update.

## Rules

- Never move a published tag.
- No skipped versions without a note.
- Release notes include known issues.
- No "100% complete" without evidence.
- No paid service, billing, or domain purchase without approval.
- No deployment claim without a live check.

## CI pipeline (minimum)

checkout → setup runtime → pin package manager → restore cache → frozen install → format check → lint → typecheck → unit → integration → build → audit → security → version:verify → upload safe artifacts.

Cost discipline: no redundant matrices, cache dependencies, fail fast, set timeouts and concurrency groups.
