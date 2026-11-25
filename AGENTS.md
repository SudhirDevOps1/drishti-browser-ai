# AGENTS.md — Drishti Browser AI

Project rules for AI coding agents working in this repository:

1. **Product Identity:** Always use **Drishti Browser AI** (`Drishti Control Deck`), never legacy names.
2. **Zero-Emoji UI:** Use pure `lucide-react` vector icons in React extension UI (`sidepanel.tsx`, `popup.tsx`, `options.tsx`).
3. **Version Single Source of Truth (SSOT):** Root `package.json#version` is the only hand-edited version. Always use `node scripts/version.mjs bump|set|sync|verify`.
4. **Security Boundaries:**
   - Never commit `.drishti-token`, `.env*`, or personal local machine paths.
   - Never add `eval()` / `new Function()` inside MV3 extension code.
   - Keep Local Bridge on `127.0.0.1` (`ws://127.0.0.1:7483`) on-demand only (no OS auto-start scripts).
5. **Verification Gate:** Before claiming completion or pushing, run:
   - `pnpm version:verify`
   - `pnpm -r run build`
   - `pnpm test`
   - `pnpm test:e2e`
6. **Commit Convention:** Conventional Commits (`feat:`, `fix:`, `chore:`, `security:`, `docs:`) enforced by Husky + Commitlint.
