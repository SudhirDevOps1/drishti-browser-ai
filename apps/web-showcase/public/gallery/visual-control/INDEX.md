# Drishti Visual Control — proof gallery

Real screenshots captured from the live Chrome extension (v0.1.2, build 26 Nov 2026 14:39)
by driving the local bridge directly (`SCREENSHOT` → base64 → PNG). Nothing here is a mockup.

- Demo surface: [`demo.html`](./demo.html) (served at `http://127.0.0.1:4599/gallery/visual-control/demo.html`)
- Capture harness: `visual-proof/capture.mjs`, `capture2.mjs`, `probe-type.mjs` (workspace)
- Viewport at capture time: 1351 × 591 CSS px, DPR 1
- Raw action logs: [`results.json`](./results.json), [`results-2.json`](./results-2.json)

| # | Image | Action | What it proves |
|---|-------|--------|----------------|
| 00 | `00-navigate.png` | `NAVIGATE` demo page | Top progress line + "NAVIGATE" HUD. **Gap:** the HUD prints the raw URL and truncates mid-path |
| 01 | `01-hover.png` | `HOVER #hover-menu-btn` | Purple target box + "HOVER · Shipping options" HUD lands on the button. **Gap:** the CSS `:hover` menu stayed closed — the hover is painted, not dispatched |
| 02 | `02-click.png` | `CLICK #counter-btn` | Cyan box + cursor + badge, counter goes 0 → 1 (exactly one increment, no double-fire) |
| 03 | `03-type.png` | `TYPE #notes` | Green box + "TYPING 59/59" badge + typed text. **Gap:** 59 chars landed instantly (> 40-char batches are not animated) |
| 04 | `04-type-done.png` | `TYPE` finished | Final field state, overlay cleared back to the idle frame |
| 05 | `05-scroll.png` | `SCROLL down 420` | Page really moved, right-edge progress bar + "SCROLL 69%" HUD, content still rendered |
| 06 | `06-key.png` | `PRINT_KEY End` | Key visual lands on the focused input (not 0,0) + "KEY · End" label |
| 07 | `07-select.png` | `SELECT_OPTION #size-select large` | Amber highlight on the select, value switches to Large, "SELECTED · Large" badge |
| 08 | `08-drag.png` | `DRAG #drag-handle → #drop-zone` | Pink source box, animated dashed path, ghost dot on the drop zone, "Dropped ✓" |
| 09 | `09-overlay-probe.png` | `HOVER` near the bottom edge | Overlay reaches the lower viewport without clipping (overlay = 1351×591 = capture size) |
| 10 | `10-after-4s.png` | idle 4s after a click | All overlay nodes removed — no stale badge/box/cursor left behind |
| 11 | `11-error.png` | `CLICK #does-not-exist` | Red "ERROR · Element not found" state. **Gap:** two stacked copies of the same error |
| 12 | `12-double-click.png` | `DOUBLE_CLICK #counter-btn` | "DBLCLICK" visual, counter +2 (previous action's error toast still fading behind it) |
| 13 | `13-scroll-progress.png` | second scroll | Progress bar + HUD tracked the second scroll correctly |
| 14 | `14-checkbox.png` | `CLICK #agree-cb` | Small 17×17 target still gets a visible box + cursor |

## Verified working (this build)

- Click / double-click no longer throw `results is not defined`; both return
  `{ ok, action, target, rect, verified, ms }`.
- Exactly one click per `CLICK` (counter 0→1), two per `DOUBLE_CLICK` (→4 after a second click).
- Hover, click, type, scroll, key, select, drag and error all produce a visible state.
- Scroll-settle keeps the box on the element after smooth scrolling.
- Overlay is viewport-sized — the old "1366×647 vs 1366×897" clipping report was a stale
  window-size measurement, not a bug.
- Visuals self-clean: nothing left on screen after 4s.

## Gaps visible in this gallery

1. **Three copies of every label** — HUD banner (top-right) + box badge (above target) +
   cursor pill (below-right of cursor). `content.ts:316` badge, `content.ts:333` pill.
2. **Badges overlap page content** — badge sits at `top:-22px` over card titles/hint text;
   the cursor pill covers whatever is right of the target.
3. **Hover is cosmetic** — `mouseenter/mouseover/mousemove` are synthetic
   (`background.ts:1071-1073`) and cannot set CSS `:hover`; the demo menu never opens.
   `verified` is hardcoded true by `|| true` at `background.ts:1074`.
4. **Typing is not watchable** — `text.length > 40` forces instant insert
   (`background.ts:1548`); animated path is 18 ms/char (~55 chars/s, `background.ts:1565`).
5. **Click HUD falls back to the raw selector** — `input#custname` renders
   `CLICK · #custname` because `shortText` ignores `<label for>` and `placeholder`
   (`background.ts:1244`). Same for `#agree-cb` in `14-checkbox.png`.
   `NAVIGATE` has the mirror problem: the HUD prints the URL instead of the page title.
6. **Key visual can be off-screen** — if the focused element is scrolled out of view the
   box is drawn at a negative y (observed `y = -363`); no `scrollIntoView` beforehand.
7. **Error toast bleeds into the next action** — `clearAllVisuals()` (`content.ts:226`)
   resets box/cursor/typing/drag/scroll but never `#drishti-error-box` (`content.ts:440`).
8. **Screenshot quota storm** — `takeScreenshot()` retries immediately
   (`background.ts:742-749`), which trips
   `MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND` and also reproduces the
   "image readback failed" error.
9. **Bridge crash under load** — during a burst of failing screenshots the local bridge
   process died (`ws://127.0.0.1:7483` stopped listening) and took the MCP connection with
   it. Forwarding calls in `bridge-server.ts` (`:371`, `:381`) are not wrapped in try/catch.

## Re-creating these shots

```powershell
# 1. serve the demo surface
node "D:\coding project\opencode drishti ai\visual-proof\serve.mjs"

# 2. drive the extension and save PNGs (bridge must be running, extension loaded)
node "D:\coding project\opencode drishti ai\visual-proof\capture.mjs"
node "D:\coding project\opencode drishti ai\visual-proof\capture2.mjs"
```

## README snippet

```md
### Visual control — every action on screen

| Hover | Click | Type |
|---|---|---|
| ![hover](apps/web-showcase/public/gallery/visual-control/01-hover.png) | ![click](apps/web-showcase/public/gallery/visual-control/02-click.png) | ![type](apps/web-showcase/public/gallery/visual-control/03-type.png) |

| Scroll | Key | Select | Drag |
|---|---|---|---|
| ![scroll](apps/web-showcase/public/gallery/visual-control/05-scroll.png) | ![key](apps/web-showcase/public/gallery/visual-control/06-key.png) | ![select](apps/web-showcase/public/gallery/visual-control/07-select.png) | ![drag](apps/web-showcase/public/gallery/visual-control/08-drag.png) |
```
