# MCP Tools Reference — Drishti Browser AI

Drishti Browser AI registers **46 official browser automation tools** with the Model Context Protocol (MCP). Every tool includes validated JSON Schemas, strict parameter typing, and structured outputs.

---

## 1. Browser Core Tools

### `browser_bridge_health`
- **Description:** Real-time health diagnostic check across the local WebSocket bridge. Measures round-trip ping latency (ms), returns active tab ID, title, URL, open tab count, and formatted session summary.
- **Parameters:**
  - `includeTabsSummary` *(optional, boolean)*: Set to true to include compact list of all open tabs.
- **Example Output:**
  ```json
  {
    "status": "CONNECTED",
    "port": 7483,
    "latencyMs": 10,
    "tabCount": 4,
    "activeTab": {
      "id": 1284,
      "title": "Drishti Browser AI — Settings & Permissions",
      "url": "chrome-extension://kjppgnfnholfdbndoinilmonomkkllbj/src/options/options.html"
    },
    "automationScope": "AUTO",
    "version": "0.1.2",
    "summary": "Bridge: CONNECTED | Port: 7483 | Tabs: 4 | Active: chrome-extension://kjppgnfnholfdbndoinilmonomkkllbj/src/options/options.html"
  }
  ```

### `browser_status`
- **Description:** Returns the live connection status of the bridge, extension version, current mode, open tab count, and active tab metadata.
- **Parameters:** None.
- **Example Output:**
  ```json
  {
    "connected": true,
    "tabCount": 4,
    "activeTabId": 1284,
    "activeTabUrl": "https://www.google.com",
    "extensionVersion": "0.1.2",
    "bridgeConnected": true
  }
  ```

### `browser_observe`
- **Description:** Captures high-level page understanding without high token consumption: extracts accessibility tree summary, visible headings, and sample text.
- **Parameters:**
  - `tabId` *(optional, number)*: Target tab ID. If omitted, uses active tab.
- **Example Usage:** Call at the beginning of a task to understand what website is open.

### `browser_snapshot`
- **Description:** Complete DOM snapshot with an indexed list of interactive elements (buttons, inputs, links, dropdowns) with bounding boxes, visibility flags, and CSS selectors.
- **Parameters:**
  - `tabId` *(optional, number)*
  - `includeHtml` *(optional, boolean)*: Set to true if raw sanitized HTML is needed.

### `browser_screenshot`
- **Description:** Captures a high-resolution screenshot of the currently visible viewport.
- **Parameters:**
  - `tabId` *(optional, number)*
  - `format` *(optional, string: "png" | "jpeg")*
  - `quality` *(optional, number: 1-100)*
- **Output:** Base64-encoded image string with MIME metadata.

### `browser_inspect`
- **Description:** Detailed inspection of a specific element matching a CSS selector (bounding client rect, computed style, attributes, role, aria labels).
- **Parameters:**
  - `selector` *(required, string)*
  - `tabId` *(optional, number)*

### `browser_get_page_info`
- **Description:** Page metadata including canonical URL, title, meta description, document language, count of links, images, and forms.
- **Parameters:**
  - `tabId` *(optional, number)*

---

## 2. Navigation Tools

### `browser_navigate`
- **Description:** Navigates the target tab to a designated URL and waits for document readiness.
- **Parameters:**
  - `url` *(required, string)*
  - `tabId` *(optional, number)*
  - `waitForLoad` *(optional, boolean, default: true)*

### `browser_back`
- **Description:** Navigates back in browser history.
- **Parameters:** `tabId` *(optional, number)*

### `browser_forward`
- **Description:** Navigates forward in browser history.
- **Parameters:** `tabId` *(optional, number)*

### `browser_reload`
- **Description:** Reloads the current page.
- **Parameters:**
  - `tabId` *(optional, number)*
  - `hardReload` *(optional, boolean)*: Bypass cache if true.

### `browser_wait`
- **Description:** Suspends execution for specified milliseconds or waits until a CSS selector appears in the DOM.
- **Parameters:**
  - `ms` *(optional, number, max 10000)*
  - `selector` *(optional, string)*
  - `tabId` *(optional, number)*

---

## 3. Tab Management Tools

### `browser_list_tabs`
- **Description:** Lists all open tabs across all browser windows with IDs, titles, URLs, and active flags.
- **Parameters:** None.

### `browser_new_tab`
- **Description:** Creates a new tab at the specified URL (defaults to `about:blank`).
- **Parameters:**
  - `url` *(optional, string)*

### `browser_switch_tab`
- **Description:** Activates the specified tab by ID and brings its window into focus.
- **Parameters:**
  - `tabId` *(required, number)*

### `browser_close_tab`
- **Description:** Closes the specified tab.
- **Parameters:**
  - `tabId` *(required, number)*

### `browser_group_tabs`
- **Description:** Groups open tabs together under a labeled Chrome Tab Group.
- **Parameters:**
  - `tabIds` *(required, array of numbers)*
  - `groupName` *(optional, string)*

---

## 4. Interaction Tools

### `browser_click`
- **Description:** Dispatches realistic click events to an element matching a CSS selector or at viewport coordinates `(x, y)`.
- **Parameters:**
  - `selector` *(optional, string)*
  - `x` *(optional, number)*
  - `y` *(optional, number)*
  - `button` *(optional: "left" | "right" | "middle")*

### `browser_double_click`
- **Description:** Double-clicks an element or coordinate.
- **Parameters:**
  - `selector` *(optional, string)*
  - `x` *(optional, number)*
  - `y` *(optional, number)*

### `browser_hover`
- **Description:** Triggers mouseover and hover states on an element.
- **Parameters:**
  - `selector` *(required, string)*

### `browser_type`
- **Description:** Types text into an input field or contenteditable element, firing keydown, keypress, input, and keyup events sequentially.
- **Parameters:**
  - `text` *(required, string)*
  - `selector` *(optional, string)*
  - `clearFirst` *(optional, boolean)*

### `browser_fill`
- **Description:** Sets an input or textarea value directly. Protected against sensitive fields (passwords and card data are blocked).
- **Parameters:**
  - `selector` *(required, string)*
  - `value` *(required, string)*

### `browser_press_key`
- **Description:** Simulates a keyboard key press (e.g. "Enter", "Tab", "Escape", "ArrowDown").
- **Parameters:**
  - `key` *(required, string)*
  - `modifiers` *(optional, array of "ctrl" | "shift" | "alt" | "meta")*

### `browser_scroll`
- **Description:** Scrolls the page or a scrollable container in a given direction.
- **Parameters:**
  - `direction` *(optional: "up" | "down" | "left" | "right")*
  - `amount` *(optional, number of pixels, default: 300)*
  - `selector` *(optional, string)*

### `browser_select`
- **Description:** Selects an option in an HTML `<select>` dropdown.
- **Parameters:**
  - `selector` *(required, string)*
  - `value` *(required, string)*

---

## 5. Content Extraction Tools

### `browser_get_text`
- **Description:** Extracts visible human-readable text from the document or specific selector.
- **Parameters:**
  - `selector` *(optional, string)*

### `browser_get_links`
- **Description:** Extracts all hyperlinks with URLs, anchor text, and classification (internal vs external).
- **Parameters:**
  - `filter` *(optional, string)*

### `browser_find_element`
- **Description:** Smart element finder querying by text content, ARIA label, placeholder, or role.
- **Parameters:**
  - `query` *(required, string)*

### `browser_get_tables`
- **Description:** Extracts all HTML data tables as structured arrays of headers and rows.
- **Parameters:** None.

### `browser_get_forms`
- **Description:** Discovers all forms and input fields with names, types, labels, and validation rules.
- **Parameters:** None.

---

## 6. Automation & Workflow Tools

### `browser_execute_workflow`
- **Description:** Dispatches a sequential workflow of multiple browser actions atomically.
- **Parameters:**
  - `steps` *(required, array of `{ tool: string, params: object }`)*
  - `mode` *(optional: "manual" | "assisted" | "auto")*

### `browser_verify_action`
- **Description:** Checks whether an intended action produced its expected result (e.g. URL change, element presence).
- **Parameters:**
  - `description` *(required, string)*
  - `screenshot` *(optional, boolean)*

### `browser_task_status`
- **Description:** Queries the progress of a running asynchronous task.
- **Parameters:**
  - `taskId` *(required, string)*

### `browser_stop_task`
- **Description:** Cancels any running multi-step task immediately.
- **Parameters:**
  - `taskId` *(optional, string)*

### `browser_wait_for`
- **Description:** Condition-based wait for a CSS selector or visible text substring to appear (replaces fixed-duration waits).
- **Parameters:**
  - `selector` *(optional, string)*, `text` *(optional, string)*, `timeout` *(optional, ms)*

### `browser_use_tab`
- **Description:** Bind automation to a specific `tabId`, or pass `null` to unlock and follow the active tab.
- **Parameters:**
  - `tabId` *(required, number | null)*

### `browser_drag`
- **Description:** Drag and drop from `fromSelector`/`fromRef`/coordinates to `toSelector`/`toRef`/coordinates.

### `browser_scroll_into_view`
- **Description:** Smoothly scroll an element (`selector` or `@eN` `ref`) into the viewport center.

### `browser_download`
- **Description:** Silently download a URL via `chrome.downloads` (`saveAs: false`) into a dedicated subfolder without triggering an OS Save As dialog.
- **Parameters:**
  - `url` *(required, string)*, `filename` *(optional, string)*, `subfolder` *(optional, string)*

---

## 7. SQLite Workflow Cache, Memory & Safety Tools

### `workflow_start` / `workflow_stop` / `workflow_run` / `workflow_list` / `workflow_match`
- **Description:** Record browser steps into local SQLite (`apps/mcp-server/src/db/schema.sql`), match repeated user queries (`workflow_match`), and replay workflows with `{{var}}` substitution (`workflow_run`).

### `browser_memory`
- **Description:** Cross-session SQLite memory (`remember` / `recall` / `forget`) with automatic PII/token filtering and optional TTL.

### `browser_confirm`
- **Description:** Destructive action safety gate (`DELETE` / `SUBMIT` / `PAYMENT`) that stores a 5-minute undo snapshot in SQLite and blocks execution until `approved: true`.

### `browser_task`
- **Description:** Plan-Execute-Verify helper that checks cached SQLite workflows first and observes the current tab without redundant screenshots.

---

## 8. Debugging & Inspection Tools

### `browser_console`
- **Description:** Retrieves recent console logs (log, info, warn, error) captured from the page.
- **Parameters:**
  - `levels` *(optional, array of string)*

### `browser_get_errors`
- **Description:** Returns unhandled JavaScript errors and rejected promises.
- **Parameters:** None.

### `browser_network_inspect`
- **Description:** Returns recent network requests made by the page.
- **Parameters:**
  - `filter` *(optional, string)*
