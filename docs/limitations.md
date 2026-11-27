# Drishti Browser AI — Known Limits

Drishti Browser AI operates directly inside your real Google Chrome / Brave browser using Manifest V3 (`chrome.tabs`, `chrome.scripting`, `chrome.debugger`, and `chrome.downloads`). The following platform and design boundaries apply:

1. **No `chrome://` or `chrome-extension://` scripting:** Chrome blocks content/script injection on internal browser pages (`chrome://settings`, `chrome://extensions`, Chrome Web Store, etc.).
2. **No built-in PDF text extraction:** Chrome's built-in PDF viewer renders inside an isolated plugin frame; `browser_get_text` and `browser_snapshot` cannot read PDF document contents directly.
3. **No cross-origin iframes or closed shadow DOM:** Script injection runs with `all_frames: false` in the top document; cross-origin `<iframe>` elements and `mode: 'closed'` Shadow DOM roots are not traversed.
4. **No CAPTCHA / 2FA solving:** Anti-bot challenges (reCAPTCHA, hCaptcha, Cloudflare Turnstile, MFA/OTP prompts) are never bypassed or solved automatically. Use `browser_request_human_help` to pause and hand control to the user.
5. **Visible viewport screenshots only:** `browser_screenshot` uses `chrome.tabs.captureVisibleTab` and captures only the currently visible viewport (not full-page stitched captures).
6. **Batch compare capped at 3 URLs:** `browser_batch_compare` limits concurrent tab comparisons to a maximum of 3 URLs per call to keep tab count, memory, and inline token usage bounded.
