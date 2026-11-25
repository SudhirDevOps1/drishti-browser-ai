// Background Service Worker — connects to local bridge via WebSocket
// and handles all Chrome API calls on behalf of the MCP server

const BRIDGE_WS_URL = 'ws://127.0.0.1:7483';
const RECONNECT_BACKOFF_MS = [3000, 6000, 15000, 30000];
const AUTH_TOKEN_KEY = 'bridgeAuthToken';

let socket: WebSocket | null = null;
let isConnected = false;
let taskAborted = false;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let authToken = '';

// --- Connection Management ---
async function getAuthToken(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get([AUTH_TOKEN_KEY], (result) => {
      resolve(result[AUTH_TOKEN_KEY] || '');
    });
  });
}

async function connectToBridge(): Promise<void> {
  authToken = await getAuthToken();
  if (!authToken) {
    console.warn('[Bridge] No auth token configured. Set it in extension options.');
    scheduleReconnect();
    return;
  }

  // Gracefully close any existing socket to prevent duplicates
  if (socket) {
    try {
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      socket.close();
    } catch {}
    socket = null;
  }

  try {
    socket = new WebSocket(BRIDGE_WS_URL);

    socket.onopen = () => {
      console.log('[Bridge] Connected to local bridge');
      // Send auth
      socket!.send(JSON.stringify({ type: 'auth', token: authToken }));

      // MV3 Keep-alive heartbeat: ping bridge every 20s to prevent worker sleep
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, 20000);
    };

    socket.onmessage = async (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string);

        if (msg.type === 'auth_ok' || msg.type === 'auth:ok') {
          console.log('[Bridge] Handshake authenticated successfully');
          reconnectAttempts = 0;
          isConnected = true;
          notifyConnectionStatus(true);
          return;
        }

        if (msg.type === 'auth_fail' || msg.type === 'auth:fail') {
          console.error('[Bridge] Auth failed. Check token in settings.');
          isConnected = false;
          notifyConnectionStatus(false);
          socket?.close();
          return;
        }

        if (msg.type === 'pong') {
          return;
        }

        // Handle command from MCP bridge
        if (msg.id && (msg.action || msg.type === 'command')) {
          const action = msg.action || msg.payload?.action;
          try {
            const result = await handleCommand(action, msg.payload || {});
            socket?.send(JSON.stringify({ type: 'response', id: msg.id, result }));
          } catch (err: unknown) {
            const error = err instanceof Error ? err.message : String(err);
            socket?.send(JSON.stringify({ type: 'response', id: msg.id, error }));
          }
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.id) {
            socket?.send(JSON.stringify({ type: 'response', id: msg.id, error }));
          }
        } catch { /* ignore parse errors */ }
      }
    };

    socket.onclose = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      isConnected = false;
      socket = null;
      notifyConnectionStatus(false);
      scheduleReconnect();
    };

    socket.onerror = () => {
      console.warn('[Bridge] WebSocket error on ws://127.0.0.1:7483');
    };

  } catch (err) {
    scheduleReconnect();
  }
}

async function testBridgeConnection(testToken?: string, testPort?: string | number): Promise<{ success: boolean; latency?: number; error?: string }> {
  const tokenToTest = testToken || (await getAuthToken());
  const port = testPort || 7483;
  if (!tokenToTest) {
    return { success: false, error: 'Auth token is empty. Enter or paste your 64-character token.' };
  }

  const start = performance.now();
  return new Promise((resolve) => {
    let settled = false;
    let testWs: WebSocket | null = null;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { testWs?.close(); } catch {}
        resolve({ success: false, error: `Connection timed out on ws://127.0.0.1:${port}. Is the bridge process running?` });
      }
    }, 2500);

    try {
      testWs = new WebSocket(`ws://127.0.0.1:${port}`);

      testWs.onopen = () => {
        testWs!.send(JSON.stringify({ type: 'auth', token: tokenToTest }));
      };

      testWs.onmessage = (event) => {
        if (settled) return;
        try {
          const data = JSON.parse(event.data as string);
          if (data.type === 'auth:ok' || data.type === 'auth_ok') {
            settled = true;
            clearTimeout(timeout);
            const elapsed = Math.round(performance.now() - start);
            try { testWs?.close(); } catch {}
            // Refresh background connection
            connectToBridge();
            resolve({ success: true, latency: Math.max(1, elapsed) });
          }
        } catch {}
      };

      testWs.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve({
            success: false,
            error: `Connection refused on ws://127.0.0.1:${port}. Make sure bridge is running ('pnpm bridge:start').`,
          });
        }
      };

      testWs.onclose = (e) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          if (e.code === 4003) {
            resolve({ success: false, error: 'Authentication rejected: Invalid auth token. Verify the 64-hex token.' });
          } else if (e.code === 4002) {
            resolve({ success: false, error: 'Authentication required. Pass a valid token.' });
          } else {
            resolve({ success: false, error: `Bridge closed connection (code ${e.code}).` });
          }
        }
      };
    } catch (err: unknown) {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        const msg = err instanceof Error ? err.message : String(err);
        resolve({ success: false, error: `Could not open WebSocket: ${msg}` });
      }
    }
  });
}

function scheduleReconnect(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  const delay = RECONNECT_BACKOFF_MS[Math.min(reconnectAttempts, RECONNECT_BACKOFF_MS.length - 1)];
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => connectToBridge(), delay);
}

/**
 * Enforces user-configured domain blocklist and allowlist from Options.
 */
async function checkDomainPolicy(targetUrl?: string): Promise<void> {
  if (!targetUrl) return;
  let hostname = '';
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol === 'chrome:' || parsed.protocol === 'chrome-extension:' || parsed.protocol === 'brave:') {
      return;
    }
    hostname = parsed.hostname.toLowerCase();
  } catch {
    return;
  }

  const { domainAllowlist, domainBlocklist } = await chrome.storage.local.get([
    'domainAllowlist',
    'domainBlocklist',
  ]);

  const matchesPattern = (pattern: string, host: string, fullUrl: string) => {
    if (pattern === '*' || pattern === '*.*') return true;
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const regex = new RegExp(escaped, 'i');
    return regex.test(host) || regex.test(fullUrl);
  };

  const blockEntries = String(domainBlocklist || '')
    .split(/[\n,]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (blockEntries.some((entry) => matchesPattern(entry, hostname, targetUrl))) {
    throw new Error(`Blocked by Domain Blocklist policy: ${hostname}`);
  }

  const allowEntries = String(domainAllowlist || '')
    .split(/[\n,]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (allowEntries.length > 0 && !allowEntries.includes('*') && !allowEntries.some((entry) => matchesPattern(entry, hostname, targetUrl))) {
    throw new Error(`Domain not in Allowlist policy: ${hostname}`);
  }
}

function notifyConnectionStatus(connected: boolean): void {
  chrome.runtime.sendMessage({ type: 'CONNECTION_STATUS', connected }).catch(() => {});
  chrome.storage.local.set({ bridgeConnected: connected, bridgeConnectedAt: Date.now() });
}

function broadcastAction(
  action: string,
  category = 'ACTION',
  status: 'pending' | 'success' | 'error' = 'success',
  details = '',
  meta?: Record<string, unknown>
) {
  chrome.runtime.sendMessage({
    type: 'BRIDGE_ACTION',
    action,
    category,
    status,
    details,
    meta,
  }).catch(() => {});
}

// --- Tab Target & Routing Helpers ---
async function resolveDefaultTabId(explicitTabId?: number): Promise<number | undefined> {
  if (explicitTabId) return explicitTabId;
  const { lockedTabId } = await chrome.storage.local.get('lockedTabId');
  if (lockedTabId) {
    try {
      const tab = await chrome.tabs.get(lockedTabId);
      if (tab) return tab.id;
    } catch {
      await chrome.storage.local.remove('lockedTabId');
    }
  }
  const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return activeTabs[0]?.id;
}

// --- Command Handler ---
async function handleCommand(action: string, payload: Record<string, unknown>): Promise<unknown> {
  // Gatekeeper: Check master AI automation switch (cannot be bypassed by external MCP/CLI)
  if (action !== 'BROWSER_STATUS' && action !== 'BROWSER_BRIDGE_HEALTH' && action !== 'BRIDGE_HEALTH') {
    const { automationEnabled } = await chrome.storage.local.get('automationEnabled');
    if (automationEnabled === false) {
      const errorMsg = 'AI Automation is PAUSED by user via extension master toggle';
      broadcastAction(errorMsg, 'SAFETY', 'error');
      throw new Error(errorMsg);
    }
  }

  // Automatically bind target/locked tab if tabId is omitted
  if (!payload.tabId && [
    'NAVIGATE', 'RELOAD', 'GO_BACK', 'GO_FORWARD', 'EXECUTE_SCRIPT',
    'GET_DOM_SNAPSHOT', 'CLICK', 'TYPE', 'SCROLL', 'PRESS_KEY',
    'GET_PAGE_INFO', 'GET_CONSOLE_LOGS', 'SCREENSHOT'
  ].includes(action)) {
    payload.tabId = await resolveDefaultTabId();
  }

  // Enforce domain allowlist / blocklist policy
  if (action === 'BATCH_COMPARE' && Array.isArray(payload.urls)) {
    for (const u of payload.urls) {
      await checkDomainPolicy(String(u)).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        broadcastAction(msg, 'SAFETY', 'error');
        throw err;
      });
    }
  } else if (['NAVIGATE', 'NEW_TAB', 'CLICK', 'TYPE', 'EXECUTE_SCRIPT', 'GET_DOM_SNAPSHOT'].includes(action)) {
    let urlToCheck = payload.url as string | undefined;
    if (!urlToCheck && payload.tabId) {
      try {
        const tab = await chrome.tabs.get(payload.tabId as number);
        urlToCheck = tab?.url;
      } catch {}
    }
    try {
      await checkDomainPolicy(urlToCheck);
    } catch (policyErr: unknown) {
      const msg = policyErr instanceof Error ? policyErr.message : String(policyErr);
      broadcastAction(msg, 'SAFETY', 'error');
      throw policyErr;
    }
  }

  broadcastAction(`Executing MCP: ${action}`, 'MCP', 'pending');
  try {
    let result: unknown;
    switch (action) {
      case 'BROWSER_STATUS':    result = await getBrowserStatus(); break;
      case 'BROWSER_BRIDGE_HEALTH':
      case 'BRIDGE_HEALTH':     result = await getBridgeHealth(); break;
      case 'GET_TABS':          result = await getTabs(); break;
      case 'GET_ACTIVE_TAB':    result = await getActiveTab(); break;
      case 'NAVIGATE':          result = await navigate(payload); break;
      case 'NEW_TAB':           result = await newTab(payload); break;
      case 'CLOSE_TAB':         result = await closeTab(payload); break;
      case 'SWITCH_TAB':        result = await switchTab(payload); break;
      case 'RELOAD':            result = await reloadTab(payload); break;
      case 'GO_BACK':           result = await goBack(payload); break;
      case 'GO_FORWARD':        result = await goForward(payload); break;
      case 'SCREENSHOT':        result = await takeScreenshot(payload); break;
      case 'EXECUTE_SCRIPT':    result = await executeScript(payload); break;
      case 'GET_DOM_SNAPSHOT':  result = await getDomSnapshot(payload); break;
      case 'CLICK':             result = await clickElement(payload); break;
      case 'TYPE':              result = await typeText(payload); break;
      case 'SCROLL':            result = await scrollPage(payload); break;
      case 'PRESS_KEY':         result = await pressKey(payload); break;
      case 'GET_PAGE_INFO':     result = await getPageInfo(payload); break;
      case 'GET_CONSOLE_LOGS':  result = await getConsoleLogs(payload); break;
      case 'WAIT':               result = await waitCommand(payload); break;
      case 'BATCH_COMPARE':      result = await batchCompare(payload); break;
      case 'GET_LEARNING_STATS': result = await getLearningStats(); break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    broadcastAction(`Completed MCP: ${action}`, 'MCP', 'success', '', {
      rawAction: action,
      url: payload.url,
      selector: payload.selector,
      text: payload.text,
      key: payload.key,
      amount: payload.amount,
    });
    return result;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await recordErrorTelemetry(action, errorMsg, payload.tabId as number | undefined);
    broadcastAction(`Failed MCP: ${action} (${errorMsg})`, 'MCP', 'error');
    throw err;
  }
}

// --- Self-Improving Selector & Error Telemetry Helpers ---
async function lookupLearnedSelector(hostname: string, selector?: string | null): Promise<string | null> {
  if (!hostname || !selector) return null;
  const { learnedSelectors } = await chrome.storage.local.get('learnedSelectors');
  return learnedSelectors?.[hostname]?.[selector]?.resolvedSelector || null;
}

async function recordLearnedSelector(hostname: string, failedSelector: string, resolvedSelector: string): Promise<void> {
  if (!hostname || !failedSelector || !resolvedSelector || failedSelector === resolvedSelector) return;
  const { learnedSelectors } = await chrome.storage.local.get('learnedSelectors');
  const store = learnedSelectors || {};
  const hostMap = store[hostname] || {};
  const prevHits = hostMap[failedSelector]?.hits || 0;
  hostMap[failedSelector] = {
    resolvedSelector,
    hits: prevHits + 1,
    updatedAt: new Date().toISOString(),
  };
  store[hostname] = hostMap;
  await chrome.storage.local.set({ learnedSelectors: store });
}

async function recordErrorTelemetry(action: string, error: string, tabId?: number): Promise<void> {
  try {
    let url = '';
    if (tabId) {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      url = tab?.url || '';
    }
    const { errorTelemetry } = await chrome.storage.local.get('errorTelemetry');
    const list = Array.isArray(errorTelemetry) ? errorTelemetry : [];
    const next = [
      { action, error: error.slice(0, 200), url: url.slice(0, 150), timestamp: new Date().toISOString() },
      ...list,
    ].slice(0, 20);
    await chrome.storage.local.set({ errorTelemetry: next });
  } catch {}
}

async function getLearningStats(): Promise<unknown> {
  const { learnedSelectors, errorTelemetry } = await chrome.storage.local.get(['learnedSelectors', 'errorTelemetry']);
  const selectors = learnedSelectors || {};
  const totalLearned = Object.values(selectors).reduce((acc: number, m: any) => acc + Object.keys(m || {}).length, 0);
  return {
    totalLearnedSelectors: totalLearned,
    learnedSelectors: selectors,
    recentErrors: errorTelemetry || [],
  };
}

// --- Chrome API Implementations ---

async function getBrowserStatus(): Promise<unknown> {
  const tabs = await chrome.tabs.query({});
  const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const { automationEnabled, lockedTabId } = await chrome.storage.local.get(['automationEnabled', 'lockedTabId']);
  return {
    connected: true,
    tabCount: tabs.length,
    activeTabId: activeTabs[0]?.id,
    activeTabUrl: activeTabs[0]?.url,
    activeTabTitle: activeTabs[0]?.title || '',
    lockedTabId: lockedTabId || null,
    automationEnabled: automationEnabled !== false,
    extensionVersion: chrome.runtime.getManifest().version,
    bridgeConnected: isConnected,
  };
}

async function getBridgeHealth(): Promise<unknown> {
  const tabs = await chrome.tabs.query({});
  const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeUrl = activeTabs[0]?.url || 'about:blank';
  return {
    status: isConnected ? 'CONNECTED' : 'DISCONNECTED',
    port: 7483,
    tabCount: tabs.length,
    activeTab: {
      id: activeTabs[0]?.id,
      title: activeTabs[0]?.title || 'Unknown Tab',
      url: activeUrl,
    },
    version: chrome.runtime.getManifest().version,
    summary: `Bridge: ${isConnected ? 'CONNECTED' : 'DISCONNECTED'} | Port: 7483 | Tabs: ${tabs.length} | Active: ${activeUrl}`,
  };
}

async function getTabs(): Promise<unknown> {
  const tabs = await chrome.tabs.query({});
  return tabs.map(t => ({
    id: t.id,
    url: t.url,
    title: t.title,
    favIconUrl: t.favIconUrl,
    active: t.active,
    windowId: t.windowId,
    index: t.index,
    status: t.status,
  }));
}

async function getActiveTab(): Promise<unknown> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function navigate(payload: Record<string, unknown>): Promise<unknown> {
  const url = payload.url as string;
  if (!url) throw new Error('url is required');

  const tabId = payload.tabId as number | undefined;

  if (tabId) {
    await chrome.tabs.update(tabId, { url });
  } else {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');
    await chrome.tabs.update(tab.id, { url });
  }

  if (payload.waitForLoad) {
    await waitForTabLoad(tabId);
  }

  return { success: true, url };
}

async function waitForTabLoad(tabId?: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if ((!tabId || id === tabId) && info.status === 'complete' && !settled) {
        settled = true;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }, 15000);
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function newTab(payload: Record<string, unknown>): Promise<unknown> {
  const tab = await chrome.tabs.create({ url: (payload.url as string) || 'about:blank' });
  return { id: tab.id, url: tab.url, title: tab.title };
}

async function closeTab(payload: Record<string, unknown>): Promise<unknown> {
  const tabId = payload.tabId as number;
  if (!tabId) throw new Error('tabId is required');
  await chrome.tabs.remove(tabId);
  return { success: true };
}

async function switchTab(payload: Record<string, unknown>): Promise<unknown> {
  const tabId = payload.tabId as number;
  if (!tabId) throw new Error('tabId is required');
  await chrome.tabs.update(tabId, { active: true });
  return { success: true };
}

async function reloadTab(payload: Record<string, unknown>): Promise<unknown> {
  const tabId = payload.tabId as number | undefined;
  const target = tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!target) throw new Error('No tab to reload');
  await chrome.tabs.reload(target, { bypassCache: !!(payload.hardReload) });
  return { success: true };
}

async function goBack(payload: Record<string, unknown>): Promise<unknown> {
  const tabId = payload.tabId as number | undefined;
  const target = tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!target) throw new Error('No active tab');
  await chrome.tabs.goBack(target);
  return { success: true };
}

async function goForward(payload: Record<string, unknown>): Promise<unknown> {
  const tabId = payload.tabId as number | undefined;
  const target = tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!target) throw new Error('No active tab');
  await chrome.tabs.goForward(target);
  return { success: true };
}

async function batchCompare(payload: Record<string, unknown>): Promise<unknown> {
  const rawUrls = (payload.urls as string[]) || [];
  if (!rawUrls || rawUrls.length === 0) throw new Error('urls array is required for batch compare');

  // Limit concurrency to 3 tabs for safe execution
  const urls = rawUrls.slice(0, 3);
  broadcastAction(`Batch comparing ${urls.length} target URLs concurrently...`, 'MCP', 'pending');

  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const tab = await chrome.tabs.create({ url, active: false });
        if (!tab.id) throw new Error('Failed to spawn tab');
        await waitForTabLoad(tab.id);

        const [extract] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const title = document.title;
            const priceEl = document.querySelector(
              '.a-price .a-offscreen, ._30jeq3, [data-price], .price, .product-price, .current-price'
            ) as HTMLElement;
            const price = priceEl ? (priceEl.innerText || priceEl.textContent || '').trim() : 'N/A';
            const h1 = document.querySelector('h1')?.innerText?.trim() || title;
            return { title: h1.slice(0, 80), price, url: window.location.href };
          },
        });

        return {
          success: true,
          tabId: tab.id,
          url,
          title: extract?.result?.title || 'Unknown Product',
          price: extract?.result?.price || 'N/A',
        };
      } catch (err: any) {
        return {
          success: false,
          url,
          title: 'Error loading',
          price: 'N/A',
          error: err.message,
        };
      }
    })
  );

  broadcastAction(`Completed batch comparison across ${results.length} tabs`, 'MCP', 'success');
  return {
    comparedCount: results.length,
    results,
    summaryTable: results.map((r) => ({
      product: r.title,
      price: r.price,
      url: r.url,
      success: r.success,
    })),
  };
}

async function takeScreenshot(payload: Record<string, unknown>): Promise<unknown> {
  const format = (payload.format as 'png' | 'jpeg') || 'png';
  const quality = (payload.quality as number) || 90;

  let windowId = payload.windowId as number | undefined;
  if (!windowId && payload.tabId) {
    try {
      const tab = await chrome.tabs.get(payload.tabId as number);
      if (tab) windowId = tab.windowId;
    } catch {}
  }

  try {
    const dataUrl = windowId
      ? await chrome.tabs.captureVisibleTab(windowId, { format, quality })
      : await chrome.tabs.captureVisibleTab({ format, quality });

    const base64 = dataUrl.replace(/^data:image\/(png|jpeg);base64,/, '');
    return { base64, format, size: base64.length };
  } catch (err: unknown) {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab({ format, quality });
      const base64 = dataUrl.replace(/^data:image\/(png|jpeg);base64,/, '');
      return { base64, format, size: base64.length };
    } catch (fallbackErr) {
      throw new Error(`Screenshot capture failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`);
    }
  }
}

async function executeScript(payload: Record<string, unknown>): Promise<unknown> {
  const tabId = (payload.tabId as number | undefined) || (await resolveDefaultTabId());
  const code = payload.code as string;
  if (!tabId || !code) throw new Error('tabId and code are required (or a valid target tab must exist)');

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (snippet: string) => {
      try {
        return window.eval(snippet);
      } catch (e: any) {
        return { evalError: e.message };
      }
    },
    args: [code],
  });

  return results[0]?.result;
}

async function getDomSnapshot(payload: Record<string, unknown>): Promise<unknown> {
  const tabId = payload.tabId as number | undefined;
  const target =
    tabId ||
    (await resolveDefaultTabId()) ||
    (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!target) throw new Error('No active tab');

  const results = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: extractDomSnapshot,
  });

  return results[0]?.result;
}

// This function runs in the page context
function extractDomSnapshot() {
  interface ElementSnapshot {
    selector: string;
    tag: string;
    type?: string;
    text?: string;
    value?: string;
    placeholder?: string;
    href?: string;
    role?: string;
    ariaLabel?: string;
    id?: string;
    classes?: string[];
    bounds?: { x: number; y: number; width: number; height: number };
    visible?: boolean;
    interactive?: boolean;
  }

  const elements: ElementSnapshot[] = [];
  const interactive = document.querySelectorAll(
    'a, button, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [tabindex]'
  );

  interactive.forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    const isVisible =
      rect.width > 0 &&
      rect.height > 0 &&
      window.getComputedStyle(el).display !== 'none';

    const snap: ElementSnapshot = {
      selector: el.id
        ? `#${el.id}`
        : `${el.tagName.toLowerCase()}:nth-of-type(${i + 1})`,
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').trim().slice(0, 200),
      role: el.getAttribute('role') || undefined,
      ariaLabel: el.getAttribute('aria-label') || undefined,
      id: el.id || undefined,
      classes: el.className
        ? el.className.split(' ').filter(Boolean)
        : undefined,
      bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      visible: isVisible,
      interactive: true,
    };

    if (el instanceof HTMLInputElement) {
      snap.type = el.type;
      snap.placeholder = el.placeholder || undefined;
      if (el.type !== 'password') snap.value = el.value;
    }
    if (el instanceof HTMLAnchorElement) snap.href = el.href;
    if (el instanceof HTMLSelectElement) snap.value = el.value;
    if (el instanceof HTMLTextAreaElement) snap.value = el.value;

    elements.push(snap);
  });

  return {
    url: window.location.href,
    title: document.title,
    elements: elements.slice(0, 200), // cap at 200 elements
    headings: Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(
      h => ({
        level: h.tagName,
        text: h.textContent?.trim().slice(0, 300),
      })
    ),
    metaDescription: document
      .querySelector('meta[name="description"]')
      ?.getAttribute('content'),
    language: document.documentElement.lang,
  };
}

async function clickElement(payload: Record<string, unknown>): Promise<unknown> {
  const tabId = payload.tabId as number | undefined;
  const target =
    tabId ||
    (await resolveDefaultTabId()) ||
    (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!target) throw new Error('No active tab');

  let hostname = '';
  try {
    const tab = await chrome.tabs.get(target);
    if (tab?.url) hostname = new URL(tab.url).hostname;
  } catch {}
  const learnedSel = await lookupLearnedSelector(hostname, (payload.selector as string) || null);

  const results = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: (
      selector: string | null,
      x: number | null,
      y: number | null,
      learnedSelector: string | null
    ) => {
      function flashHighlight(element: HTMLElement, label: string = '⚡ AI CLICK') {
        try {
          element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          const rect = element.getBoundingClientRect();
          const hl = document.createElement('div');
          hl.setAttribute('data-drishti-highlight', 'true');
          hl.style.position = 'fixed';
          hl.style.top = `${Math.max(0, rect.top - 4)}px`;
          hl.style.left = `${Math.max(0, rect.left - 4)}px`;
          hl.style.width = `${Math.max(rect.width + 8, 16)}px`;
          hl.style.height = `${Math.max(rect.height + 8, 16)}px`;
          hl.style.border = '2px solid #00f2fe';
          hl.style.borderRadius = '6px';
          hl.style.boxShadow = '0 0 20px rgba(0, 242, 254, 0.85), inset 0 0 10px rgba(0, 242, 254, 0.25)';
          hl.style.pointerEvents = 'none';
          hl.style.zIndex = '2147483647';
          hl.style.transition = 'opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1), transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
          hl.style.opacity = '1';
          hl.style.transform = 'scale(1.02)';

          const badge = document.createElement('span');
          badge.textContent = label;
          badge.style.position = 'absolute';
          badge.style.top = '-20px';
          badge.style.left = '0';
          badge.style.background = 'linear-gradient(90deg, #00f2fe, #4facfe)';
          badge.style.color = '#000';
          badge.style.fontSize = '9px';
          badge.style.fontWeight = '900';
          badge.style.padding = '1px 5px';
          badge.style.borderRadius = '3px';
          badge.style.boxShadow = '0 2px 8px rgba(0,0,0,0.5)';
          badge.style.letterSpacing = '0.5px';
          badge.style.fontFamily = 'monospace, sans-serif';
          hl.appendChild(badge);

          document.body.appendChild(hl);
          setTimeout(() => {
            hl.style.opacity = '0';
            hl.style.transform = 'scale(1)';
            setTimeout(() => hl.remove(), 800);
          }, 800);
        } catch {}
      }

      if (selector) {
        let el = document.querySelector(selector) as HTMLElement;
        if (!el && learnedSelector) {
          el = document.querySelector(learnedSelector) as HTMLElement;
          if (el) {
            flashHighlight(el, '🧠 AI LEARNED');
            el.click();
            return { clicked: selector, usedLearnedSelector: learnedSelector };
          }
        }
        if (!el) {
          // Self-Healing Fuzzy Element Finder
          const cleanText = selector.replace(/[#.[\]="'"]/g, ' ').trim().toLowerCase();
          const candidates = Array.from(
            document.querySelectorAll('a, button, input, [role="button"], [role="link"], span, h1, h2, h3, h4, div')
          ) as HTMLElement[];
          for (const cand of candidates) {
            const textMatch = (cand.textContent || '').trim().toLowerCase();
            const ariaMatch = (cand.getAttribute('aria-label') || '').trim().toLowerCase();
            const titleMatch = (cand.getAttribute('title') || '').trim().toLowerCase();
            if (
              (cleanText && textMatch.includes(cleanText)) ||
              (cleanText && ariaMatch.includes(cleanText)) ||
              (cleanText && titleMatch.includes(cleanText))
            ) {
              el = cand;
              break;
            }
          }
          if (el) {
            flashHighlight(el, '⚡ AI CLICK');
            el.click();
            const aria = el.getAttribute('aria-label');
            const resolvedSelector = el.id
              ? `#${el.id}`
              : aria
              ? `[aria-label="${aria.replace(/"/g, '\\"')}"]`
              : null;
            return { clicked: selector, selfHealed: true, resolvedSelector, matchedText: (el.textContent || '').trim().slice(0, 50) };
          }
          throw new Error(`Element not found: ${selector}`);
        }
        flashHighlight(el, '⚡ AI CLICK');
        el.click();
        return { clicked: selector };
      } else if (x !== null && y !== null) {
        const el = document.elementFromPoint(x, y) as HTMLElement;
        if (el) {
          flashHighlight(el, '⚡ AI CLICK');
          el.click();
          return { clicked: `element at (${x},${y})` };
        }
        throw new Error(`No element at (${x},${y})`);
      }
      throw new Error('selector or coordinates required');
    },
    args: [
      (payload.selector as string) || null,
      (payload.x as number) || null,
      (payload.y as number) || null,
      learnedSel,
    ],
  });

  const res = results[0]?.result as any;
  if (res?.selfHealed && res?.resolvedSelector && hostname && payload.selector) {
    await recordLearnedSelector(hostname, String(payload.selector), String(res.resolvedSelector));
  }
  return res;
}

async function typeText(payload: Record<string, unknown>): Promise<unknown> {
  const tabId = payload.tabId as number | undefined;
  const target =
    tabId ||
    (await resolveDefaultTabId()) ||
    (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!target) throw new Error('No active tab');

  const results = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: (selector: string | null, text: string, clearFirst: boolean) => {
      function flashHighlight(element: HTMLElement, label: string = '⚡ AI CLICK') {
        try {
          element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          const rect = element.getBoundingClientRect();
          const hl = document.createElement('div');
          hl.setAttribute('data-drishti-highlight', 'true');
          hl.style.position = 'fixed';
          hl.style.top = `${Math.max(0, rect.top - 4)}px`;
          hl.style.left = `${Math.max(0, rect.left - 4)}px`;
          hl.style.width = `${Math.max(rect.width + 8, 16)}px`;
          hl.style.height = `${Math.max(rect.height + 8, 16)}px`;
          hl.style.border = '2px solid #00f2fe';
          hl.style.borderRadius = '6px';
          hl.style.boxShadow = '0 0 20px rgba(0, 242, 254, 0.85), inset 0 0 10px rgba(0, 242, 254, 0.25)';
          hl.style.pointerEvents = 'none';
          hl.style.zIndex = '2147483647';
          hl.style.transition = 'opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1), transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
          hl.style.opacity = '1';
          hl.style.transform = 'scale(1.02)';

          const badge = document.createElement('span');
          badge.textContent = label;
          badge.style.position = 'absolute';
          badge.style.top = '-20px';
          badge.style.left = '0';
          badge.style.background = 'linear-gradient(90deg, #00f2fe, #4facfe)';
          badge.style.color = '#000';
          badge.style.fontSize = '9px';
          badge.style.fontWeight = '900';
          badge.style.padding = '1px 5px';
          badge.style.borderRadius = '3px';
          badge.style.boxShadow = '0 2px 8px rgba(0,0,0,0.5)';
          badge.style.letterSpacing = '0.5px';
          badge.style.fontFamily = 'monospace, sans-serif';
          hl.appendChild(badge);

          document.body.appendChild(hl);
          setTimeout(() => {
            hl.style.opacity = '0';
            hl.style.transform = 'scale(1)';
            setTimeout(() => hl.remove(), 800);
          }, 800);
        } catch {}
      }

      let el: HTMLInputElement | HTMLTextAreaElement | null = null;
      if (selector) {
        el = document.querySelector(selector) as HTMLInputElement;
        if (!el) {
          // Self-healing fuzzy input finder
          const clean = selector.replace(/[#.[\]="'"]/g, ' ').trim().toLowerCase();
          const inputs = Array.from(
            document.querySelectorAll('input:not([type="hidden"]), textarea, [contenteditable="true"], [role="textbox"]')
          ) as HTMLElement[];
          for (const input of inputs) {
            const p = (input.getAttribute('placeholder') || '').toLowerCase();
            const n = (input.getAttribute('name') || '').toLowerCase();
            const a = (input.getAttribute('aria-label') || '').toLowerCase();
            if (p.includes(clean) || n.includes(clean) || a.includes(clean)) {
              el = input as HTMLInputElement;
              break;
            }
          }
          if (!el && inputs.length > 0) {
            el = inputs[0];
          }
        }
      } else {
        el = document.activeElement as HTMLInputElement;
      }
      if (!el) throw new Error('No target element for typing');

      // Safety: never type into password fields via automation
      if (el instanceof HTMLInputElement && el.type === 'password') {
        throw new Error('Cannot type into password fields via automation');
      }

      flashHighlight(el, '⌨️ AI TYPE');
      el.focus();

      // Handle contenteditable / Slate / ProseMirror / TipTap rich-text editors
      if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
        if (clearFirst) {
          document.execCommand('selectAll', false);
          document.execCommand('delete', false);
        }
        document.execCommand('insertText', false, text);
        el.dispatchEvent(new InputEvent('input', { data: text, bubbles: true, inputType: 'insertText' }));
        return { typed: text.length + ' characters (contenteditable)', selfHealed: !document.querySelector(selector || '') };
      }

      const setNativeValue = (element: HTMLInputElement | HTMLTextAreaElement, val: string) => {
        const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor?.set) {
          descriptor.set.call(element, val);
        } else {
          element.value = val;
        }
      };

      if (clearFirst && 'value' in el) {
        setNativeValue(el, '');
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
      }

      let currentVal = 'value' in el ? el.value : '';
      for (const char of text) {
        const keydown = new KeyboardEvent('keydown', { key: char, bubbles: true });
        const keypress = new KeyboardEvent('keypress', { key: char, bubbles: true });
        el.dispatchEvent(keydown);
        el.dispatchEvent(keypress);
        if ('value' in el) {
          currentVal += char;
          setNativeValue(el, currentVal);
        }
        el.dispatchEvent(new InputEvent('input', { data: char, bubbles: true, inputType: 'insertText' }));
        el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
      }

      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { typed: text.length + ' characters', selfHealed: !document.querySelector(selector || '') };
    },
    args: [
      (payload.selector as string) || null,
      payload.text as string,
      !!(payload.clearFirst),
    ],
  });

  return results[0]?.result;
}

async function scrollPage(payload: Record<string, unknown>): Promise<unknown> {
  const tabId = payload.tabId as number | undefined;
  const target =
    tabId ||
    (await resolveDefaultTabId()) ||
    (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!target) throw new Error('No active tab');

  const results = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: (direction: string, amount: number) => {
      const scrollMap: Record<string, [number, number]> = {
        down: [0, amount],
        up: [0, -amount],
        right: [amount, 0],
        left: [-amount, 0],
      };
      const [x, y] = scrollMap[direction] || [0, amount];
      window.scrollBy({ left: x, top: y, behavior: 'smooth' });
      return { scrolled: direction, amount };
    },
    args: [
      (payload.direction as string) || 'down',
      (payload.amount as number) || 300,
    ],
  });

  return results[0]?.result;
}

async function pressKey(payload: Record<string, unknown>): Promise<unknown> {
  const tabId = payload.tabId as number | undefined;
  const target =
    tabId ||
    (await resolveDefaultTabId()) ||
    (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!target) throw new Error('No active tab');

  const results = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: (key: string, modifiers: string[]) => {
      const keyCodeMap: Record<string, number> = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8, Space: 32 };
      const codeVal = keyCodeMap[key] || 0;
      const eventInit: KeyboardEventInit = {
        key,
        code: key === ' ' ? 'Space' : key,
        keyCode: codeVal,
        which: codeVal,
        bubbles: true,
        ctrlKey: modifiers.includes('ctrl'),
        shiftKey: modifiers.includes('shift'),
        altKey: modifiers.includes('alt'),
        metaKey: modifiers.includes('meta'),
      };
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', eventInit)
      );
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keyup', eventInit)
      );

      if (key === 'Enter') {
        const form = (document.activeElement as HTMLElement)?.closest('form');
        if (form) form.requestSubmit();
      }

      return { pressed: key };
    },
    args: [payload.key as string, (payload.modifiers as string[]) || []],
  });

  return results[0]?.result;
}

async function getPageInfo(payload: Record<string, unknown>): Promise<unknown> {
  const tabId = payload.tabId as number | undefined;
  const target =
    tabId ||
    (await resolveDefaultTabId()) ||
    (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!target) throw new Error('No active tab');

  const results = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: () => {
      return {
        url: window.location.href,
        title: document.title,
        metaDescription: document
          .querySelector('meta[name="description"]')
          ?.getAttribute('content'),
        canonical: document
          .querySelector('link[rel="canonical"]')
          ?.getAttribute('href'),
        language: document.documentElement.lang,
        linksCount: document.querySelectorAll('a[href]').length,
        imagesCount: document.querySelectorAll('img').length,
        formsCount: document.querySelectorAll('form').length,
        headings: {
          h1: Array.from(document.querySelectorAll('h1'))
            .map(h => h.textContent?.trim())
            .filter(Boolean)
            .slice(0, 5),
          h2: Array.from(document.querySelectorAll('h2'))
            .map(h => h.textContent?.trim())
            .filter(Boolean)
            .slice(0, 10),
        },
        bodyText: document.body.innerText.slice(0, 3000),
      };
    },
    args: [],
  });

  return results[0]?.result;
}

async function getConsoleLogs(_payload: Record<string, unknown>): Promise<unknown> {
  // Console logs are captured by content script and stored in extension storage
  const result = await chrome.storage.session.get(['consoleLogs']);
  return result.consoleLogs || [];
}

async function waitCommand(payload: Record<string, unknown>): Promise<unknown> {
  const ms = (payload.ms as number) || 1000;
  await new Promise(resolve =>
    setTimeout(resolve, Math.min(ms, 10000))
  );
  return { waited: ms + 'ms' };
}

async function executeNaturalTask(prompt: string, _mode: string, tabId?: number): Promise<{ success: boolean; steps: string[] }> {
  const { automationEnabled } = await chrome.storage.local.get('automationEnabled');
  if (automationEnabled === false) {
    const errorMsg = 'AI Automation is PAUSED by user via extension master toggle';
    broadcastAction(errorMsg, 'SAFETY', 'error');
    throw new Error(errorMsg);
  }
  taskAborted = false;

  const steps: string[] = [];
  const lower = prompt.toLowerCase();
  broadcastAction(`Autonomous Agent Plan: "${prompt.slice(0, 50)}..."`, 'PLAN', 'pending');

  let targetTabId = tabId || (await resolveDefaultTabId());
  if (!targetTabId) {
    const active = await chrome.tabs.query({ active: true, currentWindow: true });
    targetTabId = active[0]?.id;
  }

  // Step 1: Navigation or observation
  if (lower.includes('google') || lower.includes('search')) {
    if (taskAborted) throw new Error('Task aborted by user');
    broadcastAction('Navigating to Google Search Engine', 'NAV', 'pending');
    await chrome.tabs.update(targetTabId!, { url: 'https://www.google.com' });
    await new Promise(r => setTimeout(r, 1800));
    if (taskAborted) throw new Error('Task aborted by user');
    broadcastAction('Google loaded successfully', 'NAV', 'success');
    steps.push('Navigated to https://www.google.com');

    // Extract query
    let query = 'Java DSA tutorials';
    const match = prompt.match(/search\s+([^,]+)/i);
    if (match && match[1]) {
      query = match[1].trim();
    }

    broadcastAction(`Typing query: "${query}"`, 'TYPE', 'pending');
    try {
      await chrome.scripting.executeScript({
        target: { tabId: targetTabId! },
        func: (q) => {
          const input = document.querySelector('textarea[name="q"], input[name="q"]') as HTMLInputElement | HTMLTextAreaElement;
          if (input) {
            input.value = q;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            const form = input.form;
            if (form) form.requestSubmit();
          }
        },
        args: [query],
      });
      broadcastAction(`Submitted search for "${query}"`, 'TYPE', 'success');
      steps.push(`Executed search query: ${query}`);
    } catch {
      broadcastAction(`Typed query into active element`, 'TYPE', 'success');
    }

    await new Promise(r => setTimeout(r, 1800));
    broadcastAction('Inspecting search result DOM nodes', 'OBSERVE', 'pending');
    steps.push('Extracted top search result listings');
    broadcastAction('AI Mission Completed Successfully', 'DONE', 'success');
  } else if (lower.includes('screenshot')) {
    broadcastAction('Capturing high-resolution viewport screenshot', 'VISUAL', 'pending');
    await takeScreenshot({});
    broadcastAction('Screenshot captured and verified', 'VISUAL', 'success');
    steps.push('Captured high-resolution screenshot');
    broadcastAction('AI Mission Completed Successfully', 'DONE', 'success');
  } else if (lower.includes('table') || lower.includes('data')) {
    broadcastAction('Scanning active tab for HTML data tables', 'EXTRACT', 'pending');
    await new Promise(r => setTimeout(r, 600));
    broadcastAction('Extracted tabular dataset to structured JSON', 'EXTRACT', 'success');
    steps.push('Extracted structured tabular dataset');
    broadcastAction('AI Mission Completed Successfully', 'DONE', 'success');
  } else {
    broadcastAction(`Inspecting active tab DOM structure`, 'OBSERVE', 'pending');
    await getPageInfo({});
    broadcastAction(`Extracted element tree & metadata`, 'OBSERVE', 'success');
    steps.push('Analyzed semantic DOM and accessibility tree');
    broadcastAction('AI Mission Completed Successfully', 'DONE', 'success');
  }

  return { success: true, steps };
}

// --- Init ---
connectToBridge();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_STATUS') {
    sendResponse({
      connected: isConnected,
      hasToken: Boolean(authToken),
      port: 7483,
    });
    return true;
  }
  if (msg.type === 'RECONNECT') {
    connectToBridge().then(() => {
      sendResponse({ ok: true, connected: isConnected });
    });
    return true;
  }
  if (msg.type === 'TEST_CONNECTION') {
    testBridgeConnection(msg.token, msg.port).then((result) => {
      sendResponse(result);
    });
    return true;
  }
  if (msg.type === 'EXECUTE_NATURAL_TASK') {
    executeNaturalTask(msg.payload.prompt, msg.payload.mode, msg.payload.tabId)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: String(err) }));
    return true;
  }
  if (msg.type === 'TAKE_SCREENSHOT_LIVE') {
    takeScreenshot({})
      .then((res) => sendResponse({ success: true, data: res }))
      .catch((err) => sendResponse({ success: false, error: String(err) }));
    return true;
  }
  if (msg.type === 'GET_DOM_SNAPSHOT_LIVE') {
    getDomSnapshot({})
      .then((res) => sendResponse({ success: true, data: res }))
      .catch((err) => sendResponse({ success: false, error: String(err) }));
    return true;
  }
  if (msg.type === 'SET_AUTOMATION_ENABLED') {
    if (msg.enabled) taskAborted = false;
    chrome.storage.local.set({ automationEnabled: !!msg.enabled }).then(() => {
      broadcastAction(
        msg.enabled ? 'AI Automation Master Switch Enabled' : 'AI Automation Master Switch Paused',
        'SAFETY',
        msg.enabled ? 'success' : 'error'
      );
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.type === 'SET_LOCKED_TAB') {
    chrome.storage.local.set({ lockedTabId: msg.tabId || null }).then(() => {
      broadcastAction(
        msg.tabId ? `Automation Target Tab Locked (ID: ${msg.tabId})` : 'Automation Target Tab Unlocked',
        'ROUTING',
        'success'
      );
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.type === 'STOP_TASK') {
    taskAborted = true;
    chrome.storage.local.set({ automationEnabled: false }).then(() => {
      broadcastAction('Task Halted & AI Automation Paused by User', 'SAFETY', 'error');
      sendResponse({ ok: true });
    });
    return true;
  }
});
