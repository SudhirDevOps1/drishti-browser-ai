# 04 — Security

## Threat model first (STRIDE)

Assets → trust boundaries → entry points → attack surface → actor → abuse case → impact → mitigation → residual risk.

Write it to `docs/security/THREAT-MODEL.md`. Ten minutes of this prevents the classic "auth exists but every object is readable by id" bug.

## Controls checklist

**Identity**
- Password hashing: argon2id (preferred) or bcrypt with sane cost.
- Session: httpOnly, Secure, SameSite; rotate on login; invalidate on logout.
- MFA where the data justifies it.
- Generic error messages on login (no user enumeration).

**Authorization**
- Check ownership on **every** object access, server-side.
- Roles/permissions centralised, not scattered `if (user.role === 'admin')`.
- Never trust a client-provided `userId` or `role`.
- Test cross-user access explicitly.

**Input/output**
- Validate at the boundary (schema validation).
- Parameterised queries only.
- Encode output; never `innerHTML` with user data.
- File uploads: size, type, magic bytes, store outside webroot, no execution, signed URLs.
- SSRF: allowlist destinations for server-side fetches.
- Safe redirects (no open redirect).

**Transport & headers**
- TLS everywhere; HSTS.
- CSP (start strict, relax deliberately).
- `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- CORS: explicit origins; never `*` with credentials.
- CSRF protection for cookie-based state changes.

**Abuse**
- Rate limit auth, writes, expensive endpoints.
- Payload size caps.
- Backoff/lockout on repeated failures.
- Idempotency keys for retryable writes.

**Data**
- Least-privilege DB roles; no public DB.
- RLS where multi-tenant.
- Encrypt sensitive fields at rest; keys outside the repo.
- Minimise collection; define retention and deletion.

**Logging**
- No secrets, tokens, passwords, full PII.
- Correlation id per request.
- No stack traces to end users.

## Secrets

Never commit, log, print, screenshot, or paste into chat. Rotate on exposure — deleting the line does not revoke the credential. Separate dev/staging/prod. Public prefixes (`VITE_`, `NEXT_PUBLIC_`, `PUBLIC_`, `EXPO_PUBLIC_`) are **not** secret.

## Automated checks (pick a set, no duplicates)

- Secrets: Gitleaks / TruffleHog / GitHub secret scanning + push protection.
- SAST: CodeQL / Semgrep / Sonar Community / ecosystem linters.
- Deps: Dependabot / OSV-Scanner / `pnpm audit` / `pip-audit` / `cargo audit`.
- Containers/IaC: Trivy / Hadolint / Checkov.
- Supply chain: SBOM, checksums, provenance, OpenSSF Scorecard.
- Licence: checker in CI.

A scanner running is not a security result. Triage findings.

## Severity

| Level | Example | Release rule |
|---|---|---|
| Critical | RCE, auth bypass, secret leak, data loss | block |
| High | broken boundary, serious exposure | block |
| Medium | needs preconditions | fix or document owner |
| Low | hardening | backlog |
| Info | suggestion | optional |

Document false positives with evidence. Never suppress to green the build.

## GitHub Actions

Least-privilege `permissions` · pin actions to SHAs · no secrets to fork PRs · avoid `pull_request_target` with untrusted checkout · no shell injection from PR fields · timeouts · separate build/deploy credentials · prefer OIDC.

## Disclosure

`SECURITY.md` with private reporting, scope, expectations, safe harbour. No exploit details in public issues. Test only systems you own or are authorised to test.
