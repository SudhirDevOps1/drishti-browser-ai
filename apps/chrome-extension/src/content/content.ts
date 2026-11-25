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

// Receive MAIN-world console/network error events from injected Drishti telemetry hook
window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.source !== 'DRISHTI_DEV_TELEMETRY') return;
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
} = {
  pos: {
    x: typeof window !== 'undefined' ? Math.round(window.innerWidth / 2) : 200,
    y: typeof window !== 'undefined' ? Math.round(window.innerHeight / 2) : 200,
  },
  shadow: null,
  idleTimer: null,
};

function ensureVisualOverlay(): ShadowRoot | null {
  if (typeof document === 'undefined' || !document.documentElement) return null;
  if (drishtiCursorState.shadow && document.getElementById('drishti-visual-overlay')) {
    return drishtiCursorState.shadow;
  }

  const host = document.createElement('div');
  host.id = 'drishti-visual-overlay';
  host.style.cssText =
    'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647;overflow:hidden;';

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      #drishti-trail { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; }
      #drishti-box {
        position: fixed;
        pointer-events: none;
        border: 3px solid #00f2fe;
        border-radius: 8px;
        box-shadow: 0 0 26px rgba(0, 242, 254, 0.9), inset 0 0 12px rgba(0, 242, 254, 0.3);
        opacity: 0;
        transition: opacity 260ms ease, transform 260ms ease;
      }
      #drishti-cursor {
        position: fixed;
        left: ${drishtiCursorState.pos.x}px;
        top: ${drishtiCursorState.pos.y}px;
        pointer-events: none;
        opacity: 0;
        transition: opacity 240ms ease;
        will-change: left, top, opacity;
      }
      #drishti-pill {
        position: absolute;
        left: 20px;
        top: 16px;
        background: linear-gradient(90deg, #00f2fe, #4facfe);
        color: #060a12;
        font: 900 10px/1.2 ui-monospace, monospace;
        padding: 3px 7px;
        border-radius: 5px;
        white-space: nowrap;
        box-shadow: 0 4px 14px rgba(0, 242, 254, 0.5);
      }
      #drishti-ripple {
        position: fixed;
        width: 30px;
        height: 30px;
        margin-left: -15px;
        margin-top: -15px;
        border-radius: 9999px;
        border: 3px solid #00f2fe;
        box-shadow: 0 0 18px #00f2fe;
        opacity: 0;
        transform: scale(0.4);
        pointer-events: none;
      }
      #drishti-ripple.active {
        transition: transform 320ms ease-out, opacity 320ms ease-out;
        transform: scale(2.1);
        opacity: 0;
      }
    </style>
    <svg id="drishti-trail"></svg>
    <div id="drishti-box"></div>
    <div id="drishti-ripple"></div>
    <div id="drishti-cursor">
      <svg width="24" height="24" viewBox="0 0 24 24" style="filter:drop-shadow(0 0 8px #00f2fe)">
        <path d="M4 2L20 11L12.5 13.2L10 21L4 2Z" fill="#00f2fe" stroke="#060a12" stroke-width="1.6"/>
      </svg>
      <div id="drishti-pill">DRISHTI AI</div>
    </div>
  `;

  document.documentElement.appendChild(host);
  drishtiCursorState.shadow = shadow;
  return shadow;
}

function spawnTrailDot(shadow: ShadowRoot, x: number, y: number) {
  const svg = shadow.getElementById('drishti-trail');
  if (!svg) return;
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('cx', String(Math.round(x)));
  dot.setAttribute('cy', String(Math.round(y)));
  dot.setAttribute('r', '2.5');
  dot.setAttribute('fill', '#00f2fe');
  dot.setAttribute('opacity', '0.65');
  dot.style.transition = 'opacity 550ms ease-out';
  svg.appendChild(dot);
  requestAnimationFrame(() => dot.setAttribute('opacity', '0'));
  setTimeout(() => dot.remove(), 580);
}

function animateBezierCursor(
  toX: number,
  toY: number,
  durationMs: number,
  pillText: string,
  rect?: { left: number; top: number; width: number; height: number }
): Promise<void> {
  return new Promise((resolve) => {
    const shadow = ensureVisualOverlay();
    if (!shadow) return resolve();

    const cursor = shadow.getElementById('drishti-cursor') as HTMLElement | null;
    const pill = shadow.getElementById('drishti-pill') as HTMLElement | null;
    const box = shadow.getElementById('drishti-box') as HTMLElement | null;
    if (!cursor) return resolve();

    if (drishtiCursorState.idleTimer) {
      window.clearTimeout(drishtiCursorState.idleTimer);
    }

    cursor.style.opacity = '1';
    if (pill) pill.textContent = pillText;

    if (box && rect) {
      box.style.left = `${Math.max(0, rect.left - 5)}px`;
      box.style.top = `${Math.max(0, rect.top - 5)}px`;
      box.style.width = `${Math.max(rect.width + 10, 20)}px`;
      box.style.height = `${Math.max(rect.height + 10, 20)}px`;
      box.style.opacity = '1';
    }

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

      cursor.style.left = `${Math.round(cx)}px`;
      cursor.style.top = `${Math.round(cy)}px`;
      drishtiCursorState.pos = { x: cx, y: cy };

      if (now - lastTrailAt > 26 && rawT < 0.96) {
        lastTrailAt = now;
        spawnTrailDot(shadow, cx, cy);
      }

      if (rawT < 1) {
        requestAnimationFrame(step);
      } else {
        drishtiCursorState.pos = { x: toX, y: toY };
        drishtiCursorState.idleTimer = window.setTimeout(() => {
          if (box) box.style.opacity = '0';
          if (cursor) cursor.style.opacity = '0.45';
        }, 2800);
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
  }, 340);
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
    const { mode, x, y, rect, durationMs, label } = message.payload || {};
    animateBezierCursor(
      typeof x === 'number' ? x : drishtiCursorState.pos.x,
      typeof y === 'number' ? y : drishtiCursorState.pos.y,
      typeof durationMs === 'number' ? durationMs : 450,
      label || 'DRISHTI AI',
      rect
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
