// Content script for Drishti Browser AI
// Injected into web pages to capture console/network telemetry, human activity, and DOM discovery

interface ConsoleEntry {
  level: string;
  message: string;
  timestamp: number;
  url?: string;
}

interface NetworkErrorEntry {
  method: string;
  url: string;
  status: number;
  message: string;
  timestamp: number;
}

const logs: ConsoleEntry[] = [];
const networkErrors: NetworkErrorEntry[] = [];
const MAX_LOGS = 50;
const MAX_NETWORK_ERRORS = 50;

// Intercept window console
const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
};

function persistTelemetry() {
  try {
    if (chrome?.storage?.session) {
      chrome.storage.session.set({ consoleLogs: logs, networkErrors }).catch(() => {});
    }
  } catch {
    // Ignore context invalidation
  }
}

function captureLog(level: string, ...args: unknown[]) {
  const message = args
    .map((a) => {
      if (typeof a === 'object') {
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      }
      return String(a);
    })
    .join(' ');

  logs.push({ level, message, timestamp: Date.now(), url: window.location.href });
  if (logs.length > MAX_LOGS) {
    logs.shift();
  }
  persistTelemetry();
}

function captureNetworkError(entry: NetworkErrorEntry) {
  networkErrors.push(entry);
  if (networkErrors.length > MAX_NETWORK_ERRORS) {
    networkErrors.shift();
  }
  persistTelemetry();
}

console.log = (...args) => {
  originalConsole.log(...args);
  captureLog('log', ...args);
};

console.warn = (...args) => {
  originalConsole.warn(...args);
  captureLog('warn', ...args);
};

console.error = (...args) => {
  originalConsole.error(...args);
  captureLog('error', ...args);
};

console.info = (...args) => {
  originalConsole.info(...args);
  captureLog('info', ...args);
};

window.addEventListener('error', (e) => {
  captureLog('error', e.message || 'Window error', e.filename, e.lineno);
});

window.addEventListener('unhandledrejection', (e) => {
  captureLog('error', 'Unhandled Promise Rejection:', e.reason);
});

// Receive MAIN-world console/network error events & silent blob downloads
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.source === 'DRISHTI_BLOB_DOWNLOAD' && event.data?.payload?.dataUrl) {
    try {
      chrome.runtime.sendMessage({
        type: 'SILENT_BLOB_DOWNLOAD',
        dataUrl: event.data.payload.dataUrl,
        filename: event.data.payload.filename,
      }).catch(() => {});
    } catch {}
    return;
  }
  if (event.data?.source !== 'DRISHTI_DEV_TELEMETRY') return;
  const payload = event.data.payload;
  if (!payload) return;

  if (payload.kind === 'console') {
    logs.push({
      level: payload.level || 'error',
      message: String(payload.message || 'Console error'),
      timestamp: payload.timestamp || Date.now(),
      url: payload.url || window.location.href,
    });
    if (logs.length > MAX_LOGS) logs.shift();
    persistTelemetry();
  } else if (payload.kind === 'network') {
    captureNetworkError({
      method: String(payload.method || 'GET'),
      url: String(payload.url || window.location.href),
      status: Number(payload.status ?? 0),
      message: String(payload.message || 'Network request failed'),
      timestamp: payload.timestamp || Date.now(),
    });
  }
});

// Human Takeover Detection (only real user-initiated trusted input)
let lastHumanNotify = 0;
function notifyHumanActivity() {
  const now = Date.now();
  if (now - lastHumanNotify < 500) return;
  lastHumanNotify = now;
  try {
    chrome.runtime.sendMessage({ type: 'HUMAN_ACTIVITY', timestamp: now }).catch(() => {});
  } catch {
    // Ignore context invalidation
  }
}

window.addEventListener(
  'mousedown',
  (e) => {
    if (e.isTrusted) notifyHumanActivity();
  },
  { capture: true, passive: true }
);

window.addEventListener(
  'keydown',
  (e) => {
    if (e.isTrusted) notifyHumanActivity();
  },
  { capture: true, passive: true }
);

// Persistent Shadow DOM Visual Cursor & Bezier Trajectory Engine
interface CursorPosition {
  x: number;
  y: number;
}

const drishtiCursorState: {
  pos: CursorPosition;
  shadow: ShadowRoot | null;
  idleTimer: number | null;
  hudTimer: number | null;
  errorTimer: number | null;
  typeRevertTimer: number | null;
  baseTypeBadge: string | null;
} = {
  pos: {
    x: typeof window !== 'undefined' ? Math.round(window.innerWidth / 2) : 200,
    y: typeof window !== 'undefined' ? Math.round(window.innerHeight / 2) : 200,
  },
  shadow: null,
  idleTimer: null,
  hudTimer: null,
  errorTimer: null,
  typeRevertTimer: null,
  baseTypeBadge: null,
};

const MODE_ACCENTS: Record<string, { border: string; rgb: string; grad: string }> = {
  click: {
    border: '#00f2fe',
    rgb: '0, 242, 254',
    grad: 'linear-gradient(90deg, #00f2fe, #4facfe)',
  },
  hover: {
    border: '#a78bfa',
    rgb: '167, 139, 250',
    grad: 'linear-gradient(90deg, #a78bfa, #c084fc)',
  },
  type: {
    border: '#34d399',
    rgb: '52, 211, 153',
    grad: 'linear-gradient(90deg, #34d399, #10b981)',
  },
  select: {
    border: '#fbbf24',
    rgb: '251, 191, 36',
    grad: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
  },
  drag: {
    border: '#f472b6',
    rgb: '244, 114, 182',
    grad: 'linear-gradient(90deg, #f472b6, #ec4899)',
  },
  error: {
    border: '#f87171',
    rgb: '248, 113, 113',
    grad: 'linear-gradient(90deg, #f87171, #ef4444)',
  },
  default: {
    border: '#00f2fe',
    rgb: '0, 242, 254',
    grad: 'linear-gradient(90deg, #00f2fe, #4facfe)',
  },
};

function clearAllVisuals() {
  const shadow = drishtiCursorState.shadow;
  if (!shadow) return;
  if (drishtiCursorState.idleTimer) {
    window.clearTimeout(drishtiCursorState.idleTimer);
    drishtiCursorState.idleTimer = null;
  }
  if (drishtiCursorState.hudTimer) {
    window.clearTimeout(drishtiCursorState.hudTimer);
    drishtiCursorState.hudTimer = null;
  }
  if (drishtiCursorState.errorTimer) {
    window.clearTimeout(drishtiCursorState.errorTimer);
    drishtiCursorState.errorTimer = null;
  }
  if (drishtiCursorState.typeRevertTimer) {
    window.clearTimeout(drishtiCursorState.typeRevertTimer);
    drishtiCursorState.typeRevertTimer = null;
  }
  drishtiCursorState.baseTypeBadge = null;

  const box = shadow.getElementById('drishti-box') as HTMLElement | null;
  const cursor = shadow.getElementById('drishti-cursor') as HTMLElement | null;
  const ripple = shadow.getElementById('drishti-ripple') as HTMLElement | null;
  const dragSvg = shadow.getElementById('drishti-drag-svg') as SVGElement | null;
  const trail = shadow.getElementById('drishti-trail') as SVGElement | null;
  const scrollBar = shadow.getElementById('drishti-scroll-bar') as HTMLElement | null;
  const scrollTrack = shadow.getElementById('drishti-scroll-track') as HTMLElement | null;
  const navBar = shadow.getElementById('drishti-nav-bar') as HTMLElement | null;
  const hud = shadow.getElementById('drishti-hud') as HTMLElement | null;
  const errBox = shadow.getElementById('drishti-error-box') as HTMLElement | null;

  if (box) box.style.opacity = '0';
  if (cursor) cursor.style.opacity = '0';
  if (ripple) {
    ripple.classList.remove('active');
    ripple.style.opacity = '0';
  }
  if (dragSvg) dragSvg.innerHTML = '';
  if (trail) trail.innerHTML = '';
  if (scrollBar) scrollBar.style.opacity = '0';
  if (scrollTrack) scrollTrack.style.opacity = '0';
  if (navBar) navBar.style.opacity = '0';
  if (hud) {
    hud.style.opacity = '0';
    hud.textContent = '';
  }
  if (errBox) {
    errBox.style.opacity = '0';
    errBox.textContent = '';
  }
}

if (typeof document !== 'undefined') {
  window.addEventListener('drishti:typing-progress', (ev: Event) => {
    const detail = (ev as CustomEvent<{ text?: string; baseLabel?: string }>).detail;
    const boxBadge = drishtiCursorState.shadow?.getElementById('drishti-box-badge') as HTMLElement | null;
    if (boxBadge && typeof detail?.text === 'string') {
      if (typeof detail.baseLabel === 'string') {
        drishtiCursorState.baseTypeBadge = detail.baseLabel;
      }
      boxBadge.textContent = detail.text;
      if (drishtiCursorState.typeRevertTimer) {
        window.clearTimeout(drishtiCursorState.typeRevertTimer);
      }
      drishtiCursorState.typeRevertTimer = window.setTimeout(() => {
        const b = drishtiCursorState.shadow?.getElementById('drishti-box-badge') as HTMLElement | null;
        if (b && drishtiCursorState.baseTypeBadge) {
          b.textContent = drishtiCursorState.baseTypeBadge;
        }
      }, 600);
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      clearAllVisuals();
      const host = document.getElementById('drishti-visual-overlay');
      if (host) host.remove();
      drishtiCursorState.shadow = null;
    }
  });
}

function ensureVisualOverlay(): ShadowRoot | null {
  if (typeof document === 'undefined' || !document.documentElement) return null;
  if (drishtiCursorState.shadow && document.getElementById('drishti-visual-overlay')) {
    return drishtiCursorState.shadow;
  }

  const host = document.createElement('div');
  host.id = 'drishti-visual-overlay';
  // P2.5: No explicit width/height and no overflow:hidden so tall viewports (e.g. y=800) stay visible
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      #drishti-trail, #drishti-drag-svg { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; }
      #drishti-nav-bar {
        position: fixed; top: 0; left: 0; height: 3px; width: 0%;
        background: linear-gradient(90deg, #00f2fe, #4facfe, #a78bfa);
        box-shadow: 0 0 12px #00f2fe; opacity: 0;
        transition: width 350ms ease-out, opacity 250ms ease;
      }
      #drishti-scroll-track {
        position: fixed; top: 8px; bottom: 8px; right: 8px; width: 2px; border-radius: 2px;
        background: rgba(148, 163, 184, 0.25); opacity: 0; transition: opacity 200ms ease;
      }
      #drishti-scroll-bar {
        position: fixed; top: 8px; right: 7px; width: 3px; height: 0%; border-radius: 2px;
        background: linear-gradient(180deg, #00f2fe, #34d399);
        box-shadow: 0 0 10px #00f2fe; opacity: 0;
        transition: height 200ms ease-out, opacity 250ms ease;
      }
      #drishti-hud {
        position: fixed; top: 14px; right: 14px; pointer-events: none;
        padding: 7px 14px; border-radius: 9999px;
        background: rgba(6, 10, 18, 0.94); border: 1.5px solid #00f2fe;
        box-shadow: 0 4px 22px rgba(0, 242, 254, 0.42);
        color: #e0faff; font: 700 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
        letter-spacing: 0.4px; opacity: 0; transform: translateY(-6px);
        max-width: min(70vw, 460px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        transition: opacity 200ms ease, transform 200ms ease, border-color 200ms ease;
      }
      #drishti-error-box {
        position: fixed; top: 54px; right: 14px; pointer-events: none;
        padding: 8px 14px; border-radius: 8px;
        background: rgba(69, 10, 10, 0.95); border: 1.5px solid #f87171;
        box-shadow: 0 4px 22px rgba(248, 113, 113, 0.55);
        color: #fecaca; font: 700 11px/1.3 ui-monospace, monospace;
        opacity: 0; transition: opacity 180ms ease;
      }
      #drishti-box {
        position: fixed; pointer-events: none; border: 3px solid #00f2fe; border-radius: min(8px, 30%);
        opacity: 0; transform: scale(1.02);
        transition: opacity 200ms ease, transform 200ms ease;
      }
      #drishti-box-badge {
        position: absolute; top: -26px; left: 0; bottom: auto;
        background: linear-gradient(90deg, #00f2fe, #4facfe); color: #060a12;
        font: 900 10px/1.2 ui-monospace, monospace; padding: 4px 8px; border-radius: 4px;
        max-width: min(70vw, 460px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        letter-spacing: 0.5px; outline: 1px solid rgba(0, 0, 0, 0.55);
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.55);
      }
      #drishti-cursor {
        position: fixed; left: ${drishtiCursorState.pos.x}px; top: ${drishtiCursorState.pos.y}px;
        pointer-events: none; opacity: 0; transition: opacity 180ms ease; will-change: left, top, opacity;
      }
      #drishti-pill {
        position: absolute; left: 28px; top: 24px;
        background: linear-gradient(90deg, #00f2fe, #4facfe); color: #060a12;
        font: 900 10px/1.2 ui-monospace, monospace; padding: 3px 7px; border-radius: 5px;
        max-width: min(70vw, 460px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        box-shadow: 0 4px 14px rgba(0, 242, 254, 0.5);
      }
      #drishti-ripple {
        position: fixed; width: 34px; height: 34px; margin-left: -17px; margin-top: -17px;
        border-radius: 9999px; border: 3px solid #00f2fe; box-shadow: 0 0 18px #00f2fe;
        opacity: 0; transform: scale(0.4); pointer-events: none;
      }
      #drishti-ripple.active {
        transition: transform 340ms ease-out, opacity 340ms ease-out;
        transform: scale(2.2); opacity: 0;
      }
      @keyframes drishtiDash { to { stroke-dashoffset: -24; } }
      @keyframes drishtiDropRing { 0% { transform: scale(0.7); opacity: 1; } 100% { transform: scale(1.65); opacity: 0; } }
      .drishti-drag-line { animation: drishtiDash 600ms linear infinite; }
      .drishti-drop-ring { transform-box: fill-box; transform-origin: center; animation: drishtiDropRing 600ms ease-out forwards; }
    </style>
    <div id="drishti-nav-bar"></div>
    <div id="drishti-scroll-track"></div>
    <div id="drishti-scroll-bar"></div>
    <svg id="drishti-trail"></svg>
    <svg id="drishti-drag-svg"></svg>
    <div id="drishti-hud">DRISHTI AI</div>
    <div id="drishti-error-box"></div>
    <div id="drishti-box"><div id="drishti-box-badge">DRISHTI AI</div></div>
    <div id="drishti-ripple"></div>
    <div id="drishti-cursor">
      <svg width="36" height="36" viewBox="0 0 24 24" style="filter:drop-shadow(0 0 10px #00f2fe)">
        <path d="M4 2L20 11L12.5 13.2L10 21L4 2Z" fill="#00f2fe" stroke="#060a12" stroke-width="1.6"/>
      </svg>
      <div id="drishti-pill">DRISHTI AI</div>
    </div>
  `;

  document.documentElement.appendChild(host);
  drishtiCursorState.shadow = shadow;
  return shadow;
}

function scheduleHardCleanup() {
  if (drishtiCursorState.idleTimer) {
    window.clearTimeout(drishtiCursorState.idleTimer);
  }
  drishtiCursorState.idleTimer = window.setTimeout(() => {
    clearAllVisuals();
    const host = document.getElementById('drishti-visual-overlay');
    if (host) host.remove();
    drishtiCursorState.shadow = null;
  }, 2900);
}

function hasTextCollision(el: HTMLElement, excludeHost: HTMLElement | null): boolean {
  const br = el.getBoundingClientRect();
  if (br.width <= 0 || br.height <= 0) return false;
  const xs = [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => Math.round(br.left + br.width * f));
  const ys = [Math.round(br.top + br.height * 0.5), Math.round(br.bottom - 2)];
  for (const sx of xs) {
    for (const sy of ys) {
      const hits = document.elementsFromPoint(sx, sy);
      for (const hit of hits) {
        if (
          hit === excludeHost ||
          hit === document.body ||
          hit === document.documentElement ||
          (excludeHost && excludeHost.contains(hit))
        ) {
          continue;
        }
        const hEl = hit as HTMLElement;
        if (hEl.getAttribute('data-drishti-pending-click') === '1' || hEl.getAttribute('data-drishti-pending-type') === '1' || hEl.getAttribute('data-drishti-pending-hover') === '1') {
          continue;
        }
        const directText = Array.from(hEl.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => (n.textContent || '').trim())
          .join('');
        if (directText.length > 0) return true;
      }
    }
  }
  return false;
}

function showHudBanner(shadow: ShadowRoot, hudText: string, accentBorder: string) {
  const hud = shadow.getElementById('drishti-hud') as HTMLElement | null;
  if (!hud) return;
  if (drishtiCursorState.hudTimer) {
    window.clearTimeout(drishtiCursorState.hudTimer);
  }
  hud.textContent = hudText;
  hud.style.borderColor = accentBorder;
  hud.style.top = '14px';
  hud.style.bottom = 'auto';
  hud.style.opacity = '1';
  hud.style.transform = 'translateY(0)';
  const host = document.getElementById('drishti-visual-overlay');
  if (hasTextCollision(hud, host)) {
    hud.style.top = 'auto';
    hud.style.bottom = '14px';
  }
  drishtiCursorState.hudTimer = window.setTimeout(() => {
    hud.style.opacity = '0';
    hud.style.transform = 'translateY(-6px)';
  }, 2200);
}

function spawnTrailDot(shadow: ShadowRoot, x: number, y: number, color: string) {
  const svg = shadow.getElementById('drishti-trail');
  if (!svg) return;
  while (svg.childElementCount >= 24) {
    svg.firstElementChild?.remove();
  }
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('cx', String(Math.round(x)));
  dot.setAttribute('cy', String(Math.round(y)));
  dot.setAttribute('r', '2.5');
  dot.setAttribute('fill', color);
  dot.setAttribute('opacity', '0.7');
  dot.style.transition = 'opacity 550ms ease-out';
  svg.appendChild(dot);
  requestAnimationFrame(() => dot.setAttribute('opacity', '0'));
  setTimeout(() => dot.remove(), 580);
}

function animateBezierCursor(
  mode: string,
  toX: number,
  toY: number,
  durationMs: number,
  pillText: string,
  rect?: { left: number; top: number; width: number; height: number },
  hudText?: string,
  extra?: {
    scrollPct?: number;
    dragTo?: { x: number; y: number };
    typingProgress?: string;
    verified?: boolean;
    realRect?: { left: number; top: number; width: number; height: number };
  }
): Promise<void> {
  return new Promise((resolve) => {
    const shadow = ensureVisualOverlay();
    if (!shadow) return resolve();

    clearAllVisuals();
    const host = document.getElementById('drishti-visual-overlay');
    if (host) {
      host.setAttribute('data-drishti-action', mode);
      host.setAttribute('data-drishti-verified', String(extra?.verified ?? true));
    }

    const accent = MODE_ACCENTS[mode] || MODE_ACCENTS.default;

    if (mode === 'error') {
      const errBox = shadow.getElementById('drishti-error-box') as HTMLElement | null;
      if (errBox) {
        if (drishtiCursorState.errorTimer) window.clearTimeout(drishtiCursorState.errorTimer);
        errBox.textContent = hudText || pillText;
        errBox.style.top = '54px';
        errBox.style.bottom = 'auto';
        errBox.style.opacity = '1';
        if (hasTextCollision(errBox, host)) {
          errBox.style.top = 'auto';
          errBox.style.bottom = '14px';
        }
        drishtiCursorState.errorTimer = window.setTimeout(() => {
          errBox.style.opacity = '0';
          errBox.textContent = '';
          const h = document.getElementById('drishti-visual-overlay');
          if (h) h.remove();
          drishtiCursorState.shadow = null;
        }, 2000);
      }
      return resolve();
    }

    if (mode === 'navigate') {
      if (hudText) showHudBanner(shadow, hudText, accent.border);
      const navBar = shadow.getElementById('drishti-nav-bar') as HTMLElement | null;
      if (navBar) {
        navBar.style.opacity = '1';
        navBar.style.width = '18%';
        requestAnimationFrame(() => {
          navBar.style.width = '92%';
        });
      }
      scheduleHardCleanup();
      return resolve();
    }

    if (mode === 'scroll') {
      if (hudText) showHudBanner(shadow, hudText, accent.border);
      const scrollTrack = shadow.getElementById('drishti-scroll-track') as HTMLElement | null;
      const scrollBar = shadow.getElementById('drishti-scroll-bar') as HTMLElement | null;
      if (scrollTrack) scrollTrack.style.opacity = '1';
      if (scrollBar && typeof extra?.scrollPct === 'number') {
        scrollBar.style.opacity = '1';
        scrollBar.style.height = `${Math.max(4, Math.min(100, extra.scrollPct))}%`;
      }
      scheduleHardCleanup();
      return resolve();
    }

    const cursor = shadow.getElementById('drishti-cursor') as HTMLElement | null;
    const pill = shadow.getElementById('drishti-pill') as HTMLElement | null;
    const box = shadow.getElementById('drishti-box') as HTMLElement | null;
    const boxBadge = shadow.getElementById('drishti-box-badge') as HTMLElement | null;
    if (!cursor) return resolve();

    cursor.style.opacity = '1';

    if (box && rect) {
      // G1/P1.1: one label per action — hide cursor pill when box exists
      if (pill) pill.style.display = 'none';
      const vw = window.innerWidth || 1280;
      const vh = window.innerHeight || 720;
      const bLeft = Math.max(6, rect.left - 5);
      const bTop = Math.max(6, rect.top - 5);
      const bWidth = Math.max(rect.width + 10, 32);
      const bHeight = Math.max(rect.height + 10, 32);

      // G6: cool down glow on small targets
      const isSmall = rect.width < 80 || rect.height < 40;
      const spread = isSmall ? 10 : 18;
      const alpha = isSmall ? 0.55 : 0.8;
      const insetPart = rect.height < 48 ? '' : `, inset 0 0 10px rgba(${accent.rgb}, 0.18)`;
      box.style.borderColor = accent.border;
      box.style.boxShadow = `0 0 ${spread}px rgba(${accent.rgb}, ${alpha})${insetPart}`;
      box.style.left = `${bLeft}px`;
      box.style.top = `${bTop}px`;
      box.style.width = `${bWidth}px`;
      box.style.height = `${bHeight}px`;
      box.style.opacity = '1';
      box.style.transform = 'scale(1.02)';

      if (boxBadge) {
        boxBadge.textContent = extra?.typingProgress || pillText;
        boxBadge.style.background = accent.grad;
        if (mode === 'type') {
          drishtiCursorState.baseTypeBadge = pillText;
        }
        // R2: Place above box, test collision via elementsFromPoint; flip below if colliding, else inside bottom-right
        boxBadge.style.bottom = 'auto';
        boxBadge.style.top = '-26px';
        boxBadge.style.left = '0px';
        const br = boxBadge.getBoundingClientRect();
        if (br.width > 0) {
          let targetLeft = br.width > bWidth ? bLeft + bWidth - br.width : bLeft;
          targetLeft = Math.max(6, Math.min(vw - br.width - 6, targetLeft));
          boxBadge.style.left = `${Math.round(targetLeft - bLeft)}px`;

          const aboveOut = rect.top < 46 || bTop - 26 < 4;
          if (aboveOut || hasTextCollision(boxBadge, host)) {
            boxBadge.style.top = `${bHeight + 6}px`;
            const belowOut = bTop + bHeight + 6 + br.height > vh - 6;
            if (belowOut || hasTextCollision(boxBadge, host)) {
              boxBadge.style.top = `${Math.max(4, Math.round(bHeight - br.height - 4))}px`;
              boxBadge.style.left = `${Math.max(4, Math.round(bWidth - br.width - 4))}px`;
            }
          }
        }
      }
    } else if (pill) {
      pill.style.display = 'block';
      pill.textContent = pillText;
      pill.style.background = accent.grad;
    }

    if (mode === 'drag' && extra?.dragTo) {
      const dragSvg = shadow.getElementById('drishti-drag-svg');
      if (dragSvg) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(Math.round(toX)));
        line.setAttribute('y1', String(Math.round(toY)));
        line.setAttribute('x2', String(Math.round(extra.dragTo.x)));
        line.setAttribute('y2', String(Math.round(extra.dragTo.y)));
        line.setAttribute('stroke', '#f472b6');
        line.setAttribute('stroke-width', '3');
        line.setAttribute('stroke-dasharray', '7 5');
        line.setAttribute('class', 'drishti-drag-line');
        const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ghost.setAttribute('cx', String(Math.round(extra.dragTo.x)));
        ghost.setAttribute('cy', String(Math.round(extra.dragTo.y)));
        ghost.setAttribute('r', '10');
        ghost.setAttribute('fill', 'rgba(244,114,182,0.35)');
        ghost.setAttribute('stroke', '#f472b6');
        ghost.setAttribute('stroke-width', '2.5');
        const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ring.setAttribute('cx', String(Math.round(extra.dragTo.x)));
        ring.setAttribute('cy', String(Math.round(extra.dragTo.y)));
        ring.setAttribute('r', '18');
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', '#f472b6');
        ring.setAttribute('stroke-width', '2.5');
        ring.setAttribute('class', 'drishti-drop-ring');
        dragSvg.appendChild(line);
        dragSvg.appendChild(ghost);
        dragSvg.appendChild(ring);
      }
    }

    // R5: For tiny real targets (<24px), offset cursor 14px lower-right of visual box while keeping trail ending at real point
    const realR = extra?.realRect || rect;
    const isTiny = Boolean(realR && (realR.width < 24 || realR.height < 24));
    const vwCur = window.innerWidth || 1280;
    const vhCur = window.innerHeight || 720;
    const cursorFinalX = isTiny && rect
      ? Math.min(vwCur - 24, Math.round(Math.max(6, rect.left - 5) + Math.max(rect.width + 10, 32) + 14))
      : toX;
    const cursorFinalY = isTiny && rect
      ? Math.min(vhCur - 24, Math.round(Math.max(6, rect.top - 5) + Math.max(rect.height + 10, 32) + 14))
      : toY;

    const p0 = { ...drishtiCursorState.pos };
    const dx = toX - p0.x;
    const dy = toY - p0.y;
    const dist = Math.hypot(dx, dy);

    // Fitts's Law: scale duration smoothly with distance
    const effectiveDuration = Math.max(120, Math.min(durationMs, Math.round(140 + dist * 0.45)));
    const arcOffset = Math.min(90, Math.max(18, dist * 0.18)) * (Math.random() > 0.5 ? 1 : -1);
    const nx = dist > 0 ? -dy / dist : 0;
    const ny = dist > 0 ? dx / dist : 0;

    const p1 = { x: p0.x + dx * 0.3 + nx * arcOffset, y: p0.y + dy * 0.3 + ny * arcOffset };
    const p2 = { x: p0.x + dx * 0.72 - nx * (arcOffset * 0.4), y: p0.y + dy * 0.72 - ny * (arcOffset * 0.4) };
    const p3 = { x: toX, y: toY };

    const start = performance.now();
    let lastTrailAt = 0;

    const step = (now: number) => {
      const rawT = Math.min(1, (now - start) / effectiveDuration);
      // Bell-shaped easeInOutCubic velocity
      const t = rawT < 0.5 ? 4 * rawT * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 3) / 2;
      const omt = 1 - t;

      const cx = omt * omt * omt * p0.x + 3 * omt * omt * t * p1.x + 3 * omt * t * t * p2.x + t * t * t * p3.x;
      const cy = omt * omt * omt * p0.y + 3 * omt * omt * t * p1.y + 3 * omt * t * t * p2.y + t * t * t * p3.y;

      cursor.style.left = `${Math.round(rawT >= 1 ? cursorFinalX : cx)}px`;
      cursor.style.top = `${Math.round(rawT >= 1 ? cursorFinalY : cy)}px`;
      drishtiCursorState.pos = { x: cx, y: cy };

      if (now - lastTrailAt > 26 && rawT < 0.96) {
        lastTrailAt = now;
        spawnTrailDot(shadow, cx, cy, accent.border);
      }

      if (rawT < 1) {
        requestAnimationFrame(step);
      } else {
        drishtiCursorState.pos = { x: toX, y: toY };
        scheduleHardCleanup();
        resolve();
      }
    };

    requestAnimationFrame(step);
  });
}

function triggerClickRipple(x: number, y: number) {
  const shadow = ensureVisualOverlay();
  if (!shadow) return;
  const ripple = shadow.getElementById('drishti-ripple') as HTMLElement | null;
  if (!ripple) return;
  ripple.classList.remove('active');
  ripple.style.left = `${Math.round(x)}px`;
  ripple.style.top = `${Math.round(y)}px`;
  ripple.style.opacity = '1';
  ripple.style.transform = 'scale(0.4)';
  void ripple.offsetWidth;
  ripple.classList.add('active');
  setTimeout(() => {
    ripple.classList.remove('active');
    ripple.style.opacity = '0';
  }, 360);
}

// Listen for messages from background/popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PING_CONTENT_SCRIPT') {
    sendResponse({ status: 'ok', url: window.location.href, title: document.title });
    return true;
  }
  if (message.type === 'GET_IN_PAGE_LOGS') {
    sendResponse({ logs, networkErrors });
    return true;
  }
  if (message.type === 'DRISHTI_CURSOR_ACTION') {
    const { mode, x, y, rect, durationMs, label, hudText, scrollPct, dragTo, typingProgress, verified, realRect } =
      message.payload || {};
    animateBezierCursor(
      typeof mode === 'string' ? mode : 'move',
      typeof x === 'number' ? x : drishtiCursorState.pos.x,
      typeof y === 'number' ? y : drishtiCursorState.pos.y,
      typeof durationMs === 'number' ? durationMs : 450,
      label || 'DRISHTI AI',
      rect,
      typeof hudText === 'string' ? hudText : undefined,
      { scrollPct, dragTo, typingProgress, verified, realRect }
    ).then(() => {
      if (mode === 'click') {
        triggerClickRipple(
          typeof x === 'number' ? x : drishtiCursorState.pos.x,
          typeof y === 'number' ? y : drishtiCursorState.pos.y
        );
      }
      sendResponse({ ok: true });
    });
    return true;
  }
  return false;
});
