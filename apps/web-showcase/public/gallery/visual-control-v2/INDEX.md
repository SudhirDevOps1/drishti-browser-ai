# Drishti Visual Control — Proof Set v2

Build under test: **extension 0.1.2**, `dist/background.js` + `dist/content.js` built **26 Nov 2026, 15:08**
(uncommitted working tree on top of `d2c92bf`).

Everything below is a real screenshot taken by a WebSocket controller talking to the local bridge
(`ws://127.0.0.1:7483`), against the demo page served at
`http://127.0.0.1:4599/gallery/visual-control-v2/demo.html`.
Viewport during capture: **1351 × 591 CSS px**, DPR 1.

Compare with the previous round in `../visual-control/` (15 PNGs) — that set still shows the old badges,
the stale hover frame and the clipped typing box.

---

## Files

| File | Action proven | What you should see |
|---|---|---|
| `00-navigate.png` | `NAVIGATE` | Teal nav bar sweeping the top edge, `NAVIGATE · Drishti Visual Control —` HUD pill, page loaded |
| `01-hover.png` | `HOVER #hover-menu-btn` | Purple target box on the button, single `HOVER · Shipping options ▾` badge, **CSS dropdown open below** (`display:block`, 349×107) |
| `02-click.png` | `CLICK #counter-btn` | Cyan box + cursor inside the button, `CLICK · Click me`, counter `0 → 1` |
| `03-type-mid.png` | mid-typing (early frame) | Shows the click/type hand-off frame — see gap G5 (typing starts ~1 s after the box appears) |
| `03b-type-mid2.png` | mid-typing (reliable) | `TYPING 121/151` counter, text stops mid-word at "…on th", green box held on the field |
| `04-type-done.png` | typing finished | Full 151-char sentence, box still on the field |
| `04b-name-typed.png` | `TYPE #custname` (12 chars) | `TYPE · Full name (12 chars)`, "Sudhir Kumar", **and the overlapping `TYPING 12/12` badge — gap G1** |
| `05-scroll.png` | `SCROLL down 420` | `SCROLL 76%` HUD, cyan progress rail on the right edge, page moved past the fold |
| `06-key.png` | `PRESS_KEY End` | `KEY · End` badge, cyan box on the focused field (very strong bloom — gap G6) |
| `07-select.png` | `SELECT_OPTION large` | Amber box + `SELECTED · Large`, native select now reads "Large" |
| `08-drag.png` | `DRAG` handle → drop zone | Pink box, dashed drag path, ring + ✓ at the drop point, `DRAG · ⠿ Drag me → Drop zone` |
| `09-overlay-probe.png` | `HOVER #y800-target` after scrolling | Purple box at the bottom of the viewport + `HOVER · Overlay probe — lower …` — visual layer reaches the last pixel |
| `10-after-4s.png` | idle cleanup | **Zero overlays**, page state kept (`Dropped ✓`, counter 2) — auto-clean works |
| `11-error.png` | `CLICK #does-not-exist` | One red `ERROR · Element not found: #does-not-exist` banner, no leftover cursor/box |
| `12-double-click.png` | `DOUBLE_CLICK #counter-btn` | `DBLCLICK · Click me`, counter `2 → 4` (two clicks) |
| `13-scroll-progress.png` | `SCROLL down 260` | `SCROLL 43%` HUD + rail after the page auto-scrolled back to the top for the previous click |
| `14-checkbox.png` | `CLICK #agree-cb` | 17×17 checkbox boxed and ticked, **badge still prints the raw selector `#agree-cb` — gap G3** |

`results.json` holds the raw bridge payloads for every step (verified flags, rects, timings, counter values).

---

## Verified in this build

- **Real hover** — `Input.dispatchMouseEvent: mouseMoved` lands, `el.matches(':hover') === true`, and the CSS
  menu actually opens (`display:block`, `visibility:visible`, 349×107 at 844,223).
- **Animated typing** — `animated: true`, `chars: 151`, `durationMs: 1847`; the counter and partial text are
  visible in `03b`.
- **Single label per action** — the cursor pill is hidden whenever the target box exists; no duplicates except
  the separate typing counter (G1).
- **Select** returns `{ index: 2, text: "Large" }` with its own amber visual state.
- **Drag** draws a path, a moving ring and a ✓ at the drop point; drop zone turns "Dropped ✓".
- **Single vs double click** are exact: +1 then +2 (counter 4).
- **Error path** is a single red banner; the old stuck timer is gone.
- **Cleanup** leaves the page untouched after ~4 s (`10-after-4s.png`).
- **Overlay covers the full viewport** — measured 1351×591 at (0,0), equal to the capture size, so nothing is
  clipped at the bottom edge (`09`).
- **Zero screenshot failures** in this run (17/17 PNGs) — the capture-rate fix holds.

---

## Remaining gaps (this set is the evidence)

| # | Severity | Gap | Evidence |
|---|---|---|---|
| G0 | P0 | Chrome's `started debugging this browser [Cancel]` infobar stays after a hover when any step throws — `hoverElement` only detaches on the success path | live browser (not in a PNG) — see `FIX-PROMPT-v4.md` G0 |
| G1 | P0 | `TYPING n/n` is a second badge, positioned at the wrong place: it covers the page hint text and duplicates the `TYPE · … (n chars)` badge | `04b`, `03b` |
| G2 | P0 | Badge above the box overlaps page content — it hides the card heading (`Counter button`, `Consent`, `04 · SELECT`) | `02`, `12`, `14`, `07` |
| G3 | P0 | Non-text controls fall back to the raw selector in the HUD (`CLICK · #agree-cb`) | `14` |
| G4 | P1 | Labels are cut mid-word with no ellipsis (`CLICK · Type a long note to watch an`, `NAVIGATE · Drishti Visual Control —`) | `03`, `00` |
| G5 | P1 | The type visual appears only after the ~1 s cursor travel, so a fast capture still shows the CLICK frame | `03-type-mid` |
| G6 | P1 | Box glow is too hot for small targets: the 26 px bloom washes out neighbouring text, worst on key press | `06`, `04b` |
| G7 | P2 | A 17×17 checkbox gets a 27×27 box that looks accidental; the label row is not highlighted, and the cursor sits on the control | `14` |
| G8 | P2 | `TYPING 12/12` stays on screen after the field is finished instead of collapsing back to the plain TYPE badge | `04b` |

The paste-ready fix list is in `D:\coding project\opencode drishti ai\FIX-PROMPT-v4.md` — one item per gap.

---

## README snippet

```html
<p align="center">
  <img src="apps/web-showcase/public/gallery/visual-control-v2/02-click.png" width="49%" alt="AI click with cursor, target box and label" />
  <img src="apps/web-showcase/public/gallery/visual-control-v2/01-hover.png" width="49%" alt="AI hover opening a CSS dropdown" />
</p>
<p align="center">
  <img src="apps/web-showcase/public/gallery/visual-control-v2/03b-type-mid2.png" width="49%" alt="AI typing character by character with progress counter" />
  <img src="apps/web-showcase/public/gallery/visual-control-v2/08-drag.png" width="49%" alt="AI drag with path and drop target" />
</p>
<p align="center">
  <img src="apps/web-showcase/public/gallery/visual-control-v2/07-select.png" width="49%" alt="AI select option visual state" />
  <img src="apps/web-showcase/public/gallery/visual-control-v2/11-error.png" width="49%" alt="Single red error banner with cleared overlay" />
</p>
```

Full strip (all 17):

```html
<img src="apps/web-showcase/public/gallery/visual-control-v2/00-navigate.png" width="32%" />
<img src="apps/web-showcase/public/gallery/visual-control-v2/01-hover.png" width="32%" />
<img src="apps/web-showcase/public/gallery/visual-control-v2/02-click.png" width="32%" />
<img src="apps/web-showcase/public/gallery/visual-control-v2/03-type-mid.png" width="32%" />
<img src="apps/web-showcase/public/gallery/visual-control-v2/03b-type-mid2.png" width="32%" />
<img src="apps/web-showcase/public/gallery/visual-control-v2/04-type-done.png" width="32%" />
<img src="apps/web-showcase/public/gallery/visual-control-v2/04b-name-typed.png" width="32%" />
<img src="apps/web-showcase/public/gallery/visual-control-v2/05-scroll.png" width="32%" />
<img src="apps/web-showcase/public/gallery/visual-control-v2/06-key.png" width="32%" />
<img src="apps/web-showcase/public/gallery/visual-control-v2/07-select.png" width="32%" />
<img src="apps/web-showcase/public/gallery/visual-control-v2/08-drag.png" width="32%" />
<img src="apps/web-showcase/public/gallery/visual-control-v2/09-overlay-probe.png" width="32%" />
<img src="apps/web-showcase/public/gallery/visual-control-v2/10-after-4s.png" width="32%" />
<img src="apps/web-showcase/public/gallery/visual-control-v2/11-error.png" width="32%" />
<img src="apps/web-showcase/public/gallery/visual-control-v2/12-double-click.png" width="32%" />
<img src="apps/web-showcase/public/gallery/visual-control-v2/13-scroll-progress.png" width="32%" />
<img src="apps/web-showcase/public/gallery/visual-control-v2/14-checkbox.png" width="32%" />
```

---

## Reproduce

```powershell
# 1. serve the showcase folder (port 4599)
node "D:\coding project\opencode drishti ai\visual-proof\serve.mjs"

# 2. bridge + extension already running (v0.1.2 connected)

# 3. capture all 17 shots + results.json into this folder
node "D:\coding project\opencode drishti ai\visual-proof\capture-v2.mjs"
```

Capture notes: Chrome throttles `captureVisibleTab` to ~2/s per tab, so the harness waits 420 ms before each
shot and retries after 1.2 s. Keep the Chrome window in the foreground — an unfocused window returns the
previous frame, which is why `03-type-mid.png` (900 ms after TYPE began) caught the CLICK phase.
