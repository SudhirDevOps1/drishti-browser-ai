# ⚠️ Known Limitations & Browser Boundaries — Drishti Browser AI (दृष्टि)

Because Drishti Browser AI operates safely inside standard **Chromium Manifest V3 (MV3)** security rules without bypassing browser sandboxes, the following technical boundaries apply:

---

## 1. Protected Browser Pages (`chrome://`, `brave://`, Web Store)
- Chrome and Brave strictly forbid extensions from injecting scripts (`chrome.scripting.executeScript`) or capturing screenshots on internal browser pages such as:
  - `chrome://extensions/`
  - `chrome://settings/`
  - `brave://settings/`
  - Chrome Web Store (`https://chromewebstore.google.com/`)
- **Workaround**: Navigate to any standard `http://` or `https://` tab before running `dom`, `click`, `type`, or **Card 2 / Card 3** tests.

---

## 2. Built-in PDF Viewer (`application/pdf`)
- When a `.pdf` URL is open inside Chrome's native PDF viewer, the PDF content is rendered inside an isolated browser plugin/embed rather than standard HTML DOM nodes.
- `dom` / `info` can read the PDF tab's title and URL, but cannot query paragraphs inside the PDF canvas directly.
- **Workaround**: Download the PDF or analyze its text locally via Python/Node tools while keeping the tab locked for navigation.

---

## 3. Cross-Origin `<iframe>` & Closed Shadow DOM
- Standard content script injection runs in the top frame (`all_frames: false`) and cannot access elements inside cross-origin third-party iframes (e.g., embedded payment gateways like Stripe/Razorpay) or `closed` Shadow DOM roots.

---

## 4. CAPTCHAs, Anti-Bot Gates & OS Native Dialogs
- Drishti **will not** solve or bypass CAPTCHAs (reCAPTCHA, hCaptcha, Cloudflare Turnstile) or 2FA prompts. Human verification is required.
- Native OS dialogs (such as the OS file upload picker or print dialog) live outside the browser DOM and require manual user interaction.

---

## 5. Minimized Windows & Viewport Screenshots
- `chrome.tabs.captureVisibleTab` captures the **visible** viewport of the target window. If the browser window is minimized or completely hidden on some OS configurations, screenshot capture may fail with an error.
- **Batch Compare Concurrency**: `BATCH_COMPARE` is intentionally capped at **3 concurrent tabs** to prevent memory spikes on low-resource PCs.

---

## 6. Service Worker Sleep (MV3)
- Chrome suspends idle MV3 service workers after ~30 seconds of inactivity. Drishti uses a 20-second WebSocket heartbeat when connected to stay responsive, and automatically reconnects when you open the Popup/Sidepanel or run `TEST_CONNECTION`.
