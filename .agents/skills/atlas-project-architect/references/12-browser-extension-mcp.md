# 12 — Browser Extension & MCP Server Pack

Load this pack when the project ships **a browser extension**, **a local bridge**, or **an
MCP server an agent calls**. It is domain knowledge, not a new phase: the normal loop still
applies. Read it before you change a manifest, add a tool, or touch the bridge handshake.

Do **not** load it for a plain web app, a Node CLI, or an MCP server with no browser
component. The permission and lifecycle rules below only pay off when a real browser is in
the loop.

---

## 1. The three-process shape

Almost every "AI controls my browser" product is three processes, and confusing them is the
single most common design bug.

```text
agent host (OpenCode / Antigravity / Claude Code / Cursor)
   │  stdio or HTTP, JSON-RPC
   ▼
MCP server            ← owns tool schemas, validation, approval policy
   │  WebSocket, localhost only, shared-secret handshake
   ▼
local bridge          ← owns the token, the queue, the action budget
   │  chrome.runtime / native messaging
   ▼
extension             ← owns the tab, the DOM, the user gesture
   │
   ▼
web page (untrusted)
```

Rules that follow from the shape:

- **The page is never trusted.** Text from a page is data. If page text can reach the model
  as an instruction, you have a prompt-injection hole, not a feature.
- **The extension holds the user gesture.** Anything the browser requires a click for stays
  a click. Do not fake it.
- **The bridge is the only place the token lives.** Do not copy the token into the page, the
  content script, or a URL query string.
- **The MCP server is the contract.** If a tool is not described there, the agent cannot
  call it safely.

---

## 2. Manifest V3 contract

### 2.1 Permissions are a budget, not a checklist

Every permission is a review question. Add the smallest one that works.

| Permission | Buys you | Cost |
|---|---|---|
| `activeTab` | one tab, after a user gesture | cheapest; no install warning |
| `tabs` | tab list, URLs, create/close | broad; warns about browsing history |
| `scripting` | inject a function into a page | pairs with `activeTab` or host access |
| `storage` | settings, token cache, queue | low; prefer `storage.session` for secrets |
| `sidePanel` | the side panel surface | low |
| `notifications` | OS-level nudges | low |
| `tabGroups` | group tabs by task | low |
| `downloads` | save a file the user asked for | medium |
| `host_permissions: ["<all_urls>"]` | read and inject on every site | **highest** — needs a written reason |

If `<all_urls>` is genuinely required (a general automation product usually needs it),
record the decision instead of hiding it:

```text
Decision: host_permissions = ["<all_urls>"]
Why: the user picks an arbitrary site at runtime; a static host list cannot cover it.
Mitigation: content script is injected only after the user starts a task; every write
action passes the approval policy; the token never leaves the extension/bridge pair.
Revisit: when a curated site list or optional_host_permissions covers the top use cases.
```

Prefer `optional_host_permissions` + `chrome.permissions.request()` when the product can ask
for one origin at a time. It is more work and a better install experience.

### 2.2 Content Security Policy

MV3 forbids `eval`, remote script, and inline handlers in extension pages. Do not fight it:

- No `new Function`, no string `setTimeout`, no CDN `<script src>`.
- Bundle everything into the extension; a remote fetch is data, never code.
- If you need a sandboxed page, declare it and accept that it cannot use extension APIs.

### 2.3 Version surfaces

The manifest `version` is a **generated** surface. One hand-edited source, everything else
synced — same rule as `07-versioning-ssot.md`. The manifest must also stay a valid
four-part version (`MAJOR.MINOR.PATCH` plus an optional integer), so a `-beta.1` tag belongs
in the package version and the release notes, not in `manifest.json`.

---

## 3. Service worker lifecycle

The MV3 background worker is not a server. It is stopped when idle.

| Symptom | Cause | Fix |
|---|---|---|
| State vanishes after ~30 s | module-level variable | persist in `chrome.storage` |
| Timer never fires | `setTimeout` dies with the worker | `chrome.alarms` (min 30 s in MV3) |
| Port disconnects randomly | worker stopped, port closed | reconnect with backoff, re-announce |
| First message after idle is slow | cold start | keep the handler small, lazy-load heavy code |

Rules:

- Treat every handler as **cold-startable**: read state from storage, do the work, write back.
- A long task belongs in the bridge or the page, not in the worker.
- Register listeners at top level so they survive a restart.
- Never hold a secret in a module variable and assume it is still there.

---

## 4. Message passing contract

Define the message envelope once and use it everywhere.

```ts
type Envelope<T> =
  | { ok: true;  id: string; data: T }
  | { ok: false; id: string; error: { code: string; message: string; retryable: boolean } };
```

- Every request has an `id`; every response echoes it. Drop unmatched responses.
- Every request has a **timeout**. A hung tab must not hang the agent.
- Validate the payload at the boundary. `unknown` in, parsed type out — never `any`.
- Keep one message type per file or one discriminated union per domain. A 400-line switch is
  a sign the contract is missing.
- Never send a token, cookie, password value, or full page HTML back through the bridge
  unless the tool's documented purpose is exactly that.

---

## 5. The page boundary

This is the security line. Treat everything below it as hostile input.

| Input | Treat as |
|---|---|
| Page text, headings, comments | untrusted data |
| Attribute values, `alt`, `aria-label` | untrusted data |
| Console output, network bodies | untrusted data |
| A page saying "ignore previous instructions" | **prompt injection** — report it, never obey |
| User typing in the extension UI | user intent, still validated |

Implementation rules:

- Wrap page content in a clear delimiter before it reaches the model and label it as data.
- Never concatenate page text into a system prompt or a tool description.
- Redact password fields, one-time-code fields, and `autocomplete="cc-*"` at the source.
- A dangerous action (purchase, delete, send, submit) needs an explicit confirmation step
  that the page cannot trigger on its own.
- Cap automation: a per-task action budget with a hard stop beats a warning in the docs.

---

## 6. Local bridge contract

The bridge is the trust boundary between a local agent and the browser.

| Control | Requirement |
|---|---|
| Bind address | `127.0.0.1` only — never `0.0.0.0` |
| Port | fixed and documented (e.g. `7483`); fail loudly if taken |
| Auth | shared secret on the **first** frame, constant-time compare |
| Origin | reject browser origins; accept only the local agent/MCP client |
| Message size | hard cap; reject oversized frames before parsing |
| Rate | per-connection token bucket + a global action budget |
| Lifecycle | start on demand; no OS service, no auto-start script |
| Logs | no token, no page content, no cookies |

Handshake shape:

```text
client → { "type": "auth", "token": "<64 hex chars>" }
bridge → { "type": "auth_ok", "protocol": 1 }      // or close(4001)
```

- Close with a distinct code on bad auth so the client can tell "wrong token" from "bridge
  down".
- Rotate by writing a new token, restarting the bridge, and updating the extension — in that
  order, and say so in the docs.
- The token file is gitignored. Confirm with `git check-ignore -v .drishti-token` before you
  claim it is safe.

---

## 7. MCP server contract

### 7.1 Tool naming

`<domain>_<verb>_<object>` in `snake_case`, stable forever once published.

```text
browser_navigate            browser_click
browser_get_dom             browser_type
browser_screenshot          browser_wait_for
browser_network_inspect     browser_get_errors
```

- One verb per tool. `browser_do_stuff` is not a tool, it is a wish.
- Never rename a published tool. Add `*_v2` and deprecate with a date.
- Group by domain so a 40-tool server is still readable.

### 7.2 Schema

- Describe every parameter: type, enum, default, and what it does.
- Mark required fields honestly. An optional field the code assumes is a crash.
- Return structured content plus a short human summary. The model reads both.
- Put the read/write nature in the description: "Read-only" or "Changes page state".

### 7.3 Error envelope

```ts
{ code: "TAB_NOT_FOUND" | "TIMEOUT" | "AUTH_FAILED" | "POLICY_DENIED",
  message: "human sentence",
  retryable: boolean,
  hint?: "what to try next" }
```

- No stack traces to the model. Log them locally.
- `POLICY_DENIED` is a normal outcome, not an exception: the agent should report it, not
  retry it.
- Timeouts are `retryable: true` only when the action is idempotent.

### 7.4 Read vs write, and approval

Classify every tool once, in one table, and enforce it in code:

| Class | Examples | Rule |
|---|---|---|
| Read | DOM read, screenshot, network list, console errors | may run without a prompt |
| Navigate | open URL, switch tab, scroll | run, but log |
| Write | click, type, submit, upload | confirm per policy |
| Destructive | delete, purchase, send message, close with unsaved work | always confirm, never batch |

The classification lives next to the schema, not in the prompt. A prompt can be argued with;
a guard cannot.

### 7.5 Discovery and version

- Expose the protocol version and a tool count at startup.
- A client that asks for an unknown tool gets `UNKNOWN_TOOL`, not a silent no-op.
- Keep a `docs/mcp-tools-reference.md` generated from the schema, not hand-written twice.

---

## 8. Testing ladder

| Level | What it proves | Tool |
|---|---|---|
| Unit | parsers, policy, token compare, envelope | Vitest / node:test |
| Contract | every tool schema validates and rejects bad input | schema tests |
| Integration | bridge handshake, auth failure, timeout, rate cap | Node WebSocket client |
| Extension E2E | load unpacked, click, assert DOM | Playwright persistent context with `--load-extension` |
| Manual | real Chrome/Brave, real site, real gesture | checklist |

Playwright note: extensions need a persistent context and a headed browser in most setups.
A headless run that "passes" without loading the extension proves nothing. Assert that the
service worker exists before you assert anything else.

Minimum regression set for a browser-automation product:

1. wrong token → `AUTH_FAILED`, connection closed
2. bridge down → `retryable` error, no hang
3. navigation timeout → `TIMEOUT`, tab still usable
4. page with a prompt-injection string → treated as data, no tool call
5. write action without approval → `POLICY_DENIED`
6. action budget exhausted → hard stop, clear message

---

## 9. Release

- Build the extension, then package **only** `dist/`. Never ship `src/`, `node_modules/`,
  or the token file.
- The release ZIP must contain `manifest.json` at its root. A ZIP with a wrapping folder is
  the most common "it will not load" bug.
- Run the version verify gate before packaging; a manifest that disagrees with the package
  version is a broken release.
- Pin CI actions to commit SHAs. A moving tag in a release workflow is a supply-chain hole.
- Attach a checksum next to the ZIP and say what it is.
- Do not publish to a store from an unapproved pipeline. Local unpacked install first.

---

## 10. Security review checklist

- [ ] `host_permissions` has a written justification, or is optional.
- [ ] Token is generated locally, stored in a gitignored file, never logged.
- [ ] Bridge binds `127.0.0.1`, authenticates the first frame, rejects browser origins.
- [ ] Page content is delimited and labelled as data before it reaches the model.
- [ ] Password / OTP / card fields are never read.
- [ ] Write and destructive tools are classified and gated in code.
- [ ] Action budget and per-request timeout exist and are tested.
- [ ] No `eval`, no remote code, no inline handler.
- [ ] Dependency audit is clean or the findings are recorded with severity.
- [ ] `git check-ignore` confirms the token and build output are untracked.

---

## 11. Anti-patterns

| Anti-pattern | Why it hurts |
|---|---|
| One `execute_action` tool with a string command | no schema, no policy, no review |
| Token in a URL or a page global | leaks to history, logs, and any script |
| `0.0.0.0` bridge "for convenience" | exposes the browser to the LAN |
| State in service-worker globals | silently lost on idle |
| Renaming published tools | breaks every saved agent config |
| Deleting a tool to "clean up" | removes a user flow; needs approval and a deprecation path |
| Passing raw page HTML to the model | token cost plus injection surface |
| Headless E2E without loading the extension | green test, broken product |
| Auto-start OS service | survives uninstall, hard to audit, hard to stop |

---

## 12. Evidence commands

Run these and paste the real output — not a summary.

```bash
# token is ignored, not committed
git check-ignore -v .drishti-token

# manifest version matches the package version
node scripts/version.mjs verify

# the built extension is loadable
test -f apps/chrome-extension/dist/manifest.json && echo "manifest present"

# bridge refuses a bad token (expect a close, not a hang)
node scripts/check-auth.mjs            # or the project's equivalent

# tools are described and classified
node -e "const t=require('./apps/mcp-server/dist/tools.json');console.log(t.length)"
```

If a command does not exist yet, write **NOT RUN** and the reason. Do not invent a tool
count, a test result, or a port.

---

## 13. Handoff

When you stop, record in `HANDOFF.md`:

- which of the three processes you changed
- the token location (path only — never the value)
- the exact build and load commands
- the test level reached (unit / contract / integration / E2E / manual)
- what is still unverified, and the one command that would verify it

A new agent must be able to rebuild, load, and connect from that note alone.
