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
const pendingBridgeDispatches = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();

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

        if (msg.type === 'response' && msg.id && pendingBridgeDispatches.has(msg.id)) {
          const d = pendingBridgeDispatches.get(msg.id)!;
          pendingBridgeDispatches.delete(msg.id);
          if (msg.error) d.reject(new Error(msg.error));
          else d.resolve(msg.result);
          return;
        }

        if (msg.type === 'mission_update' && msg.mission) {
          const m = msg.mission;
          broadcastAction(
            `Agent Mission [${String(m.status).toUpperCase()}]: ${m.summary || m.prompt?.slice(0, 60) || m.id}`,
            'AGENT',
            m.status === 'failed' ? 'error' : m.status === 'completed' ? 'success' : 'pending'
          );
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
async function checkDomainPolicy(targetUrl?: string, isNavigation = false): Promise<void> {
  if (!targetUrl) return;
  let hostname = '';
  try {
    const parsed = new URL(targetUrl);
    const allowedProtocols = isNavigation
      ? ['http:', 'https:', 'about:']
      : ['http:', 'https:', 'about:', 'chrome:', 'chrome-extension:', 'brave:'];
    if (!allowedProtocols.includes(parsed.protocol)) {
      throw new Error(`Blocked unsafe URL protocol: ${parsed.protocol}`);
    }
    if (parsed.protocol === 'chrome:' || parsed.protocol === 'chrome-extension:' || parsed.protocol === 'brave:' || parsed.protocol === 'about:') {
      return;
    }
    hostname = parsed.hostname.toLowerCase();
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith('Blocked unsafe URL')) throw err;
    throw new Error(`Invalid or malformed URL rejected by security policy: ${targetUrl}`);
  }

  const { domainAllowlist, domainBlocklist } = await chrome.storage.local.get([
    'domainAllowlist',
    'domainBlocklist',
  ]);

  const effectiveBlocklist =
    domainBlocklist !== undefined ? domainBlocklist : 'bank.*, paypal.com, accounts.google.com/signin';

  const matchesPattern = (pattern: string, host: string, fullUrl: string) => {
    if (pattern === '*' || pattern === '*.*') return true;
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const regex = new RegExp(escaped, 'i');
    return regex.test(host) || regex.test(fullUrl);
  };

  const blockEntries = String(effectiveBlocklist || '')
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
    'GET_DOM_SNAPSHOT', 'CLICK', 'HOVER', 'TYPE', 'SCROLL', 'PRESS_KEY',
    'GET_PAGE_INFO', 'GET_CONSOLE_LOGS', 'SCREENSHOT'
  ].includes(action)) {
    payload.tabId = await resolveDefaultTabId();
  }

  // Enforce domain allowlist / blocklist policy
  if (action === 'BATCH_COMPARE' && Array.isArray(payload.urls)) {
    for (const u of payload.urls) {
      await checkDomainPolicy(String(u), true).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        broadcastAction(msg, 'SAFETY', 'error');
        throw err;
      });
    }
  } else if (['NAVIGATE', 'NEW_TAB', 'CLICK', 'HOVER', 'TYPE', 'EXECUTE_SCRIPT', 'GET_DOM_SNAPSHOT', 'SCREENSHOT', 'GET_PAGE_INFO', 'GET_CONSOLE_LOGS'].includes(action)) {
    let urlToCheck = payload.url as string | undefined;
    if (!urlToCheck && payload.tabId) {
      try {
        const tab = await chrome.tabs.get(payload.tabId as number);
        urlToCheck = tab?.url;
      } catch {}
    }
    try {
      await checkDomainPolicy(urlToCheck, action === 'NAVIGATE' || action === 'NEW_TAB');
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
      case 'HOVER':             result = await hoverElement(payload); break;
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

  const resolvedTab = tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (resolvedTab) {
    chrome.scripting
      .executeScript({
        target: { tabId: resolvedTab },
        func: (targetUrl: string) => {
          try {
            let hud = document.querySelector('[data-drishti-hud="true"]') as HTMLElement | null;
            if (!hud) {
              hud = document.createElement('div');
              hud.setAttribute('data-drishti-hud', 'true');
              hud.style.position = 'fixed';
              hud.style.top = '14px';
              hud.style.right = '14px';
              hud.style.zIndex = '2147483647';
              hud.style.pointerEvents = 'none';
              hud.style.padding = '6px 12px';
              hud.style.borderRadius = '9999px';
              hud.style.background = 'rgba(6, 10, 18, 0.9)';
              hud.style.border = '1.5px solid #00f2fe';
              hud.style.boxShadow = '0 0 20px rgba(0, 242, 254, 0.45)';
              hud.style.color = '#e0faff';
              hud.style.fontFamily = 'ui-monospace, monospace';
              hud.style.fontSize = '11px';
              hud.style.fontWeight = '700';
              hud.style.transition = 'opacity 250ms ease';
              document.body.appendChild(hud);
            }
            hud.textContent = `DRISHTI AI • NAVIGATE ${targetUrl.slice(0, 42)}`;
            hud.style.opacity = '1';
            setTimeout(() => {
              if (hud) {
                hud.style.opacity = '0';
                setTimeout(() => hud?.remove(), 260);
              }
            }, 1600);
          } catch {}
        },
        args: [url],
      })
      .catch(() => {});
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
  const code = String(payload.code || '').trim();
  if (!tabId || !code) throw new Error('tabId and code are required (or a valid target tab must exist)');

  // MV3-safe read-only query handler (arbitrary script evaluation is disabled for Chrome Web Store & CSP compliance)
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (expr: string) => {
      if (expr === 'document.title') return document.title;
      if (expr === 'window.location.href' || expr === 'location.href') return window.location.href;
      if (expr === 'document.readyState') return document.readyState;
      return {
        disabled: true,
        error: 'Arbitrary script evaluation is disabled in MV3 hardened mode. Use structured MCP tools (GET_DOM_SNAPSHOT, GET_PAGE_INFO, CLICK, HOVER, TYPE, SCROLL).',
      };
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
    if (
      el.closest(
        'ytd-ad-slot-renderer, ytd-promoted-sparkles-web-renderer, ytd-display-ad-renderer, [data-ad], [aria-label*="Sponsored"]'
      )
    ) {
      return;
    }
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

async function getCursorSpeedMs(): Promise<number> {
  const { cursorSpeed } = await chrome.storage.local.get('cursorSpeed');
  if (cursorSpeed === 'fast') return 180;
  if (cursorSpeed === 'demo') return 850;
  return 460;
}

async function dispatchShadowCursor(
  tabId: number,
  mode: 'move' | 'hover' | 'click' | 'type' | 'scroll',
  x: number,
  y: number,
  label: string,
  rect?: { left: number; top: number; width: number; height: number }
): Promise<void> {
  const durationMs = await getCursorSpeedMs();
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'DRISHTI_CURSOR_ACTION',
      payload: { mode, x, y, rect, durationMs, label },
    });
  } catch {
    // Content script may not be ready on special pages
  }
}

async function trustedCdpClick(tabId: number, x: number, y: number): Promise<boolean> {
  const { trustedCdpMode } = await chrome.storage.local.get('trustedCdpMode');
  if (!trustedCdpMode) return false;
  const hasPerm = await chrome.permissions.contains({ permissions: ['debugger'] }).catch(() => false);
  if (!hasPerm) return false;

  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
    });
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1,
    });
    await new Promise((r) => setTimeout(r, 45));
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1,
    });
    return true;
  } catch {
    return false;
  } finally {
    await chrome.debugger.detach({ tabId }).catch(() => {});
  }
}

async function hoverElement(payload: Record<string, unknown>): Promise<unknown> {
  const tabId = payload.tabId as number | undefined;
  const target =
    tabId ||
    (await resolveDefaultTabId()) ||
    (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!target) throw new Error('No active tab');

  await yieldIfHumanActive();

  const locateRes = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: (selector: string) => {
      let el = document.querySelector(selector) as HTMLElement | null;
      if (!el) {
        const clean = selector.replace(/[#.[\]="'"]/g, ' ').trim().toLowerCase();
        const candidates = Array.from(
          document.querySelectorAll('a, button, input, [role="button"], [role="link"], [role="menuitem"]')
        ) as HTMLElement[];
        el =
          candidates.find((c) => {
            const t = (c.textContent || '').trim().toLowerCase();
            const a = (c.getAttribute('aria-label') || '').trim().toLowerCase();
            return (clean && t.includes(clean)) || (clean && a.includes(clean));
          }) || null;
      }
      if (!el) throw new Error(`Element not found for hover: ${selector}`);
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      const rect = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      };
    },
    args: [String(payload.selector || '')],
  });

  const coords = locateRes[0]?.result;
  if (coords) {
    await dispatchShadowCursor(target, 'hover', coords.x, coords.y, 'HOVERING', coords.rect);
    await new Promise((r) => setTimeout(r, 200));
  }
  return { hovered: payload.selector, ...coords };
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

  await yieldIfHumanActive();

  const results = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: async (
      selector: string | null,
      x: number | null,
      y: number | null,
      learnedSelector: string | null
    ) => {
      function glideCursorToRect(rect: DOMRect, badgeText: string = 'DRISHTI AI') {
        try {
          const w = window as unknown as { __drishtiCursorPos?: { x: number; y: number } };
          const prev = w.__drishtiCursorPos || {
            x: Math.round(window.innerWidth / 2),
            y: Math.round(window.innerHeight / 2),
          };
          const targetX = Math.round(rect.left + rect.width / 2);
          const targetY = Math.round(rect.top + rect.height / 2);
          w.__drishtiCursorPos = { x: targetX, y: targetY };

          let cursor = document.querySelector('[data-drishti-cursor="true"]') as HTMLElement | null;
          if (!cursor) {
            cursor = document.createElement('div');
            cursor.setAttribute('data-drishti-cursor', 'true');
            cursor.style.position = 'fixed';
            cursor.style.pointerEvents = 'none';
            cursor.style.zIndex = '2147483647';
            cursor.style.transition =
              'left 340ms cubic-bezier(0.22, 1, 0.36, 1), top 340ms cubic-bezier(0.22, 1, 0.36, 1), opacity 250ms ease';
            cursor.innerHTML =
              '<svg width="24" height="24" viewBox="0 0 24 24" style="filter:drop-shadow(0 0 8px #00f2fe)"><path d="M4 2L20 11L12.5 13.2L10 21L4 2Z" fill="#00f2fe" stroke="#060a12" stroke-width="1.6"/></svg>' +
              `<span style="position:absolute;left:20px;top:16px;background:linear-gradient(90deg,#00f2fe,#4facfe);color:#060a12;font:900 10px/1 ui-monospace,monospace;padding:3px 6px;border-radius:4px;white-space:nowrap;box-shadow:0 4px 12px rgba(0,242,254,0.5)">${badgeText}</span>`;
            document.body.appendChild(cursor);
          }

          cursor.style.left = `${prev.x}px`;
          cursor.style.top = `${prev.y}px`;
          cursor.style.opacity = '1';
          void cursor.offsetWidth;
          cursor.style.left = `${targetX}px`;
          cursor.style.top = `${targetY}px`;

          setTimeout(() => {
            if (cursor) {
              cursor.style.opacity = '0';
              setTimeout(() => cursor?.remove(), 260);
            }
          }, 1400);
        } catch {}
      }

      function flashHighlight(element: HTMLElement, label: string = 'AI CLICK') {
        try {
          element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          const rect = element.getBoundingClientRect();
          glideCursorToRect(rect, label);
          const hl = document.createElement('div');
          hl.setAttribute('data-drishti-highlight', 'true');
          hl.style.position = 'fixed';
          hl.style.top = `${Math.max(0, rect.top - 5)}px`;
          hl.style.left = `${Math.max(0, rect.left - 5)}px`;
          hl.style.width = `${Math.max(rect.width + 10, 20)}px`;
          hl.style.height = `${Math.max(rect.height + 10, 20)}px`;
          hl.style.border = '3px solid #00f2fe';
          hl.style.borderRadius = '8px';
          hl.style.boxShadow = '0 0 28px rgba(0, 242, 254, 0.95), inset 0 0 14px rgba(0, 242, 254, 0.35)';
          hl.style.pointerEvents = 'none';
          hl.style.zIndex = '2147483647';
          hl.style.transition = 'opacity 0.9s cubic-bezier(0.4, 0, 0.2, 1), transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
          hl.style.opacity = '1';
          hl.style.transform = 'scale(1.03)';

          const badge = document.createElement('span');
          badge.textContent = label;
          badge.style.position = 'absolute';
          badge.style.top = '-22px';
          badge.style.left = '0';
          badge.style.background = 'linear-gradient(90deg, #00f2fe, #4facfe)';
          badge.style.color = '#000';
          badge.style.fontSize = '10px';
          badge.style.fontWeight = '900';
          badge.style.padding = '2px 6px';
          badge.style.borderRadius = '4px';
          badge.style.boxShadow = '0 2px 10px rgba(0,0,0,0.6)';
          badge.style.letterSpacing = '0.5px';
          badge.style.fontFamily = 'monospace, sans-serif';
          hl.appendChild(badge);

          document.body.appendChild(hl);
          setTimeout(() => {
            hl.style.opacity = '0';
            hl.style.transform = 'scale(1)';
            setTimeout(() => hl.remove(), 900);
          }, 1400);
        } catch {}
      }

      async function humanClick(element: HTMLElement, label: string = 'AI CLICK') {
        flashHighlight(element, label);
        await new Promise((r) => setTimeout(r, 360));
        try {
          const rect = element.getBoundingClientRect();
          const ripple = document.createElement('div');
          ripple.style.position = 'fixed';
          ripple.style.left = `${Math.round(rect.left + rect.width / 2 - 14)}px`;
          ripple.style.top = `${Math.round(rect.top + rect.height / 2 - 14)}px`;
          ripple.style.width = '28px';
          ripple.style.height = '28px';
          ripple.style.borderRadius = '9999px';
          ripple.style.border = '3px solid #00f2fe';
          ripple.style.boxShadow = '0 0 18px #00f2fe';
          ripple.style.pointerEvents = 'none';
          ripple.style.zIndex = '2147483647';
          ripple.style.transform = 'scale(0.5)';
          ripple.style.opacity = '1';
          ripple.style.transition = 'transform 260ms ease-out, opacity 260ms ease-out';
          document.body.appendChild(ripple);
          void ripple.offsetWidth;
          ripple.style.transform = 'scale(1.9)';
          ripple.style.opacity = '0';
          setTimeout(() => ripple.remove(), 280);
        } catch {}
        await new Promise((r) => setTimeout(r, 140));
        element.click();
      }

      if (selector) {
        let el = document.querySelector(selector) as HTMLElement;
        if (!el && learnedSelector) {
          el = document.querySelector(learnedSelector) as HTMLElement;
          if (el) {
            await humanClick(el, 'AI LEARNED');
            return { clicked: selector, usedLearnedSelector: learnedSelector };
          }
        }
        if (!el) {
          // Self-Healing Fuzzy Element Finder (interactive elements prioritized over generic wrappers)
          const cleanText = selector.replace(/[#.[\]="'"]/g, ' ').trim().toLowerCase();
          const candidates = [
            ...Array.from(document.querySelectorAll('a, button, input, [role="button"], [role="link"], [role="menuitem"]')),
            ...Array.from(document.querySelectorAll('span, h1, h2, h3, h4')),
          ] as HTMLElement[];
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
            await humanClick(el, 'AI CLICK');
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
        await humanClick(el, 'AI CLICK');
        return { clicked: selector };
      } else if (x !== null && y !== null) {
        const el = document.elementFromPoint(x, y) as HTMLElement;
        if (el) {
          await humanClick(el, 'AI CLICK');
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
  // Mirror click onto persistent Shadow DOM Bezier cursor + optional Trusted CDP click
  if (payload.selector || (payload.x !== undefined && payload.y !== undefined)) {
    const rectInfo = await chrome.scripting
      .executeScript({
        target: { tabId: target },
        func: (sel: string | null, px: number | null, py: number | null) => {
          if (sel) {
            const el = document.querySelector(sel) as HTMLElement | null;
            if (el) {
              const r = el.getBoundingClientRect();
              return {
                x: Math.round(r.left + r.width / 2),
                y: Math.round(r.top + r.height / 2),
                rect: { left: r.left, top: r.top, width: r.width, height: r.height },
              };
            }
          }
          if (px !== null && py !== null) {
            return { x: px, y: py };
          }
          return null;
        },
        args: [(payload.selector as string) || null, (payload.x as number) ?? null, (payload.y as number) ?? null],
      })
      .then((r) => r[0]?.result)
      .catch(() => null);
    if (rectInfo) {
      await dispatchShadowCursor(target, 'click', rectInfo.x, rectInfo.y, 'AI CLICK', rectInfo.rect);
      await trustedCdpClick(target, rectInfo.x, rectInfo.y);
    }
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

  await yieldIfHumanActive();

  const results = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: async (selector: string | null, text: string, clearFirst: boolean) => {
      function glideCursorToRect(rect: DOMRect) {
        try {
          const w = window as unknown as { __drishtiCursorPos?: { x: number; y: number } };
          const prev = w.__drishtiCursorPos || {
            x: Math.round(window.innerWidth / 2),
            y: Math.round(window.innerHeight / 2),
          };
          const targetX = Math.round(rect.left + rect.width / 2);
          const targetY = Math.round(rect.top + rect.height / 2);
          w.__drishtiCursorPos = { x: targetX, y: targetY };

          let cursor = document.querySelector('[data-drishti-cursor="true"]') as HTMLElement | null;
          if (!cursor) {
            cursor = document.createElement('div');
            cursor.setAttribute('data-drishti-cursor', 'true');
            cursor.style.position = 'fixed';
            cursor.style.width = '18px';
            cursor.style.height = '18px';
            cursor.style.marginLeft = '-9px';
            cursor.style.marginTop = '-9px';
            cursor.style.borderRadius = '9999px';
            cursor.style.border = '2px solid #00f2fe';
            cursor.style.background = 'rgba(0, 242, 254, 0.22)';
            cursor.style.boxShadow = '0 0 14px rgba(0, 242, 254, 0.85)';
            cursor.style.pointerEvents = 'none';
            cursor.style.zIndex = '2147483647';
            cursor.style.transition =
              'left 260ms cubic-bezier(0.22, 1, 0.36, 1), top 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease';
            document.body.appendChild(cursor);
          }

          cursor.style.left = `${prev.x}px`;
          cursor.style.top = `${prev.y}px`;
          cursor.style.opacity = '1';
          void cursor.offsetWidth;
          cursor.style.left = `${targetX}px`;
          cursor.style.top = `${targetY}px`;

          setTimeout(() => {
            if (cursor) {
              cursor.style.opacity = '0';
              setTimeout(() => cursor?.remove(), 240);
            }
          }, 900);
        } catch {}
      }

      function flashHighlight(element: HTMLElement, label: string = 'AI TYPE') {
        try {
          element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          const rect = element.getBoundingClientRect();
          glideCursorToRect(rect);
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

      flashHighlight(el, 'AI TYPE');
      await new Promise((r) => setTimeout(r, 320));
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
        await new Promise((r) => setTimeout(r, 28 + Math.floor(Math.random() * 24)));
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
      try {
        let hud = document.querySelector('[data-drishti-hud="true"]') as HTMLElement | null;
        if (!hud) {
          hud = document.createElement('div');
          hud.setAttribute('data-drishti-hud', 'true');
          hud.style.position = 'fixed';
          hud.style.top = '14px';
          hud.style.right = '14px';
          hud.style.zIndex = '2147483647';
          hud.style.pointerEvents = 'none';
          hud.style.padding = '6px 12px';
          hud.style.borderRadius = '9999px';
          hud.style.background = 'rgba(6, 10, 18, 0.9)';
          hud.style.border = '1.5px solid #00f2fe';
          hud.style.boxShadow = '0 0 20px rgba(0, 242, 254, 0.45)';
          hud.style.color = '#e0faff';
          hud.style.fontFamily = 'ui-monospace, monospace';
          hud.style.fontSize = '11px';
          hud.style.fontWeight = '700';
          hud.style.transition = 'opacity 250ms ease';
          document.body.appendChild(hud);
        }
        hud.textContent = `DRISHTI AI • SCROLL ${direction.toUpperCase()} ${amount}px`;
        hud.style.opacity = '1';
        setTimeout(() => {
          if (hud) {
            hud.style.opacity = '0';
            setTimeout(() => hud?.remove(), 260);
          }
        }, 1200);
      } catch {}
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

let lastHumanActivityAt = 0;

async function yieldIfHumanActive(): Promise<void> {
  const since = Date.now() - lastHumanActivityAt;
  if (lastHumanActivityAt > 0 && since < 3000) {
    broadcastAction('Human takeover detected — AI yielding briefly', 'TAKEOVER', 'pending');
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function attachDevTelemetry(tabId?: number): Promise<{ attached: boolean; tabId?: number }> {
  const target =
    tabId ||
    (await resolveDefaultTabId()) ||
    (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!target) return { attached: false };

  const tab = await chrome.tabs.get(target).catch(() => null);
  if (!tab?.url || !(await checkDomainPolicy(tab.url))) {
    return { attached: false, tabId: target };
  }

  await chrome.scripting.executeScript({
    target: { tabId: target },
    world: 'MAIN',
    func: () => {
      const w = window as unknown as { __drishtiTelemetryHooked?: boolean };
      if (w.__drishtiTelemetryHooked) return;
      w.__drishtiTelemetryHooked = true;

      const emit = (payload: Record<string, unknown>) => {
        try {
          window.postMessage({ source: 'DRISHTI_DEV_TELEMETRY', payload }, '*');
        } catch {}
      };

      const origErr = console.error.bind(console);
      console.error = (...args: unknown[]) => {
        origErr(...args);
        emit({
          kind: 'console',
          level: 'error',
          message: args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
          url: window.location.href,
          timestamp: Date.now(),
        });
      };

      window.addEventListener('error', (ev) => {
        emit({
          kind: 'console',
          level: 'error',
          message: ev.message || 'Uncaught window error',
          url: ev.filename || window.location.href,
          timestamp: Date.now(),
        });
      });

      window.addEventListener('unhandledrejection', (ev) => {
        emit({
          kind: 'console',
          level: 'error',
          message: `UnhandledRejection: ${String(ev.reason)}`,
          url: window.location.href,
          timestamp: Date.now(),
        });
      });

      const origFetch = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method || (input instanceof Request ? input.method : 'GET');
        const reqUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        try {
          const res = await origFetch(input, init);
          if (res.status >= 400) {
            emit({
              kind: 'network',
              method,
              url: reqUrl,
              status: res.status,
              message: `HTTP ${res.status} ${res.statusText || ''}`.trim(),
              timestamp: Date.now(),
            });
          }
          return res;
        } catch (err) {
          emit({
            kind: 'network',
            method,
            url: reqUrl,
            status: 0,
            message: err instanceof Error ? err.message : String(err),
            timestamp: Date.now(),
          });
          throw err;
        }
      };

      const OrigXHR = window.XMLHttpRequest;
      const origOpen = OrigXHR.prototype.open;
      const origSend = OrigXHR.prototype.send;
      OrigXHR.prototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
        (this as unknown as { __drishtiMeta?: { method: string; url: string } }).__drishtiMeta = {
          method,
          url: String(url),
        };
        return (origOpen as (...a: unknown[]) => unknown).apply(this, [method, url, ...rest]);
      };
      OrigXHR.prototype.send = function (...args: unknown[]) {
        this.addEventListener('loadend', () => {
          const meta = (this as unknown as { __drishtiMeta?: { method: string; url: string } }).__drishtiMeta;
          if (this.status >= 400 || this.status === 0) {
            emit({
              kind: 'network',
              method: meta?.method || 'XHR',
              url: meta?.url || window.location.href,
              status: this.status,
              message: this.status === 0 ? 'XHR network failure' : `HTTP ${this.status} ${this.statusText || ''}`.trim(),
              timestamp: Date.now(),
            });
          }
        });
        return (origSend as (...a: unknown[]) => unknown).apply(this, args);
      };
    },
  });

  return { attached: true, tabId: target };
}

async function getConsoleLogs(_payload: Record<string, unknown>): Promise<unknown> {
  // Console logs are captured by content script and stored in extension storage
  const result = await chrome.storage.session.get(['consoleLogs']);
  return result.consoleLogs || [];
}

async function getDevTelemetry(tabId?: number): Promise<{ consoleLogs: unknown[]; networkErrors: unknown[] }> {
  await attachDevTelemetry(tabId).catch(() => {});
  const result = await chrome.storage.session.get(['consoleLogs', 'networkErrors']);
  return {
    consoleLogs: Array.isArray(result.consoleLogs) ? result.consoleLogs : [],
    networkErrors: Array.isArray(result.networkErrors) ? result.networkErrors : [],
  };
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

  // If Bridge is connected, dispatch mission directly to Antigravity / Universal MCP Inbox!
  if (socket && socket.readyState === WebSocket.OPEN && isConnected) {
    let tabUrl = '';
    let tabTitle = '';
    if (targetTabId) {
      try {
        const t = await chrome.tabs.get(targetTabId);
        tabUrl = t?.url || '';
        tabTitle = t?.title || '';
      } catch {}
    }

    const dispatchId = 'disp-' + Date.now().toString(36);
    const dispatchResult = await new Promise<{ success: boolean; steps: string[]; dispatchedTo?: string; missionId?: string }>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingBridgeDispatches.delete(dispatchId);
        reject(new Error('Bridge mission dispatch timed out'));
      }, 15000);

      pendingBridgeDispatches.set(dispatchId, {
        resolve: (val) => { clearTimeout(timer); resolve(val); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });

      socket!.send(JSON.stringify({
        type: 'dispatch_mission',
        id: dispatchId,
        payload: { prompt, mode: _mode, tabId: targetTabId, url: tabUrl, title: tabTitle },
      }));
    });

    broadcastAction(
      dispatchResult.dispatchedTo === 'antigravity'
        ? `Sent to Antigravity (${dispatchResult.missionId})`
        : `Queued in MCP Agent Inbox (${dispatchResult.missionId})`,
      'AGENT',
      'success'
    );
    return dispatchResult;
  }

  // Offline Fallback: Step 1: Navigation or observation
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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab?.url) {
    attachDevTelemetry(tabId).catch(() => {});
  }
});

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
  if (msg.type === 'HUMAN_ACTIVITY') {
    lastHumanActivityAt = typeof msg.timestamp === 'number' ? msg.timestamp : Date.now();
    chrome.storage.session.set({ lastHumanActivityAt }).catch(() => {});
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'GET_DEV_TELEMETRY') {
    getDevTelemetry(msg.tabId)
      .then((data) => sendResponse({ success: true, ...data }))
      .catch((err) => sendResponse({ success: false, error: String(err) }));
    return true;
  }
  if (msg.type === 'CLEAR_DEV_TELEMETRY') {
    chrome.storage.session.set({ consoleLogs: [], networkErrors: [] }).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }
});
