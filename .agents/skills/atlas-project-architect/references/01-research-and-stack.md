# 01 — Research & Stack Selection

## Why this matters

Stack decisions are cheap now and expensive later. An hour of research prevents weeks of migration. But research without a stopping rule becomes procrastination — cap it: **3 alternatives per major decision, primary sources only, then decide.**

## Source hierarchy

1. Official docs
2. Official repo (releases, commits, issues, advisories)
3. Official pricing/limits page
4. Security advisories (CVE/GHSA)
5. Maintainer RFCs
6. Reputable technical writing
7. Community threads — supporting only

## Per-candidate checklist

Maintenance · latest stable + date · release cadence · open critical issues · known CVEs · runtime support · install complexity · docs quality · community · **license + commercial terms** · self-host · free-tier limits · rate limits · sleep/inactivity · card required? · data export · lock-in · cost risk · telemetry.

## Free-tier honesty

| Kind | Reality |
|---|---|
| Free forever under limits | real, but limits can change |
| Trial | production has a death date |
| Credits | silent bill after burn |
| OSS + paid hosting | infra cost is real |
| Personal-use only | commercial use = violation |
| Public-repo only | private work ineligible |
| Self-hosted | you pay server + ops time |

Always write the **actual numbers** (requests/day, build minutes, storage, bandwidth) with the **date checked**. If you can't verify it, write UNKNOWN.

## Stack selection

Score on: requirement fit · simplicity · solo maintainability · ecosystem · license · free-tier viability · runtime footprint (assume an 8 GB laptop) · build speed · LTS · migration cost.

Anti-hype rules:
- No microservices for a solo app.
- No Kubernetes without orchestration need.
- No queue without async need.
- No vector DB without retrieval need.
- No auth without protected resources.
- No dependency for 30 lines of correct standard code.

## Output: decision table

| Area | Selected | Alternatives | Why | Limits / risks | Checked |
|---|---|---|---|---|---|
| Frontend | | | | | |
| Backend | | | | | |
| DB | | | | | |
| Auth | | | | | |
| Hosting | | | | | |
| Testing | | | | | |

Plus one paragraph a non-expert understands.

## Reuse check (before building anything)

- Does a maintained library solve it? → use it.
- Does an OSS project cover 80–90%? → evaluate extending it.
- License compatible? → MIT/Apache/BSD/ISC preferred; GPL/AGPL/SSPL need review.
- Supply chain sane? → check install scripts, transitive deps, recent releases.

## Research artifacts

```
docs/research/RESEARCH.md
docs/research/COMPETITOR-ANALYSIS.md
docs/research/TECHNOLOGY-COMPARISON.md
docs/research/FREE-TIER-ANALYSIS.md
docs/research/DEPENDENCY-CATALOG.md
```

Dependency catalog row: name · repo · license · version · maintenance · purpose · alternatives · limits · security notes.
