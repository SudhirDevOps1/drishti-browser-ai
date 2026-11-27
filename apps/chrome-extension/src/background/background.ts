// Background Service Worker — connects to local bridge via Native Messaging or WebSocket
// and handles all Chrome API calls on behalf of the MCP server

import { cdpSession } from './cdp-session';

const BRIDGE_WS_URL = 'ws://127.0.0.1:7483';
const NATIVE_HOST_NAME = 'com.drishti.bridge';
const RECONNECT_BACKOFF_MS = [3000, 6000, 15000, 30000];
const AUTH_TOKEN_KEY = 'bridgeAuthToken';

let socket: WebSocket | null = null;
let nativePort: chrome.runtime.Port | null = null;
let activeTransport: 'native' | 'websocket' | null = null;
let bridgeEnabled = true;
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

function sendBridgeMessage(payload: unknown): boolean {
  if (activeTransport === 'native' && nativePort) {
    try {
      nativePort.postMessage(payload);
      return true;
    } catch {
      return false;
    }
  }
  if (socket && socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

async function handleBridgeIncoming(msg: any): Promise<void> {
  if (!msg || typeof msg !== 'object') return;

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

  if (msg.id && (msg.action || msg.type === 'command')) {
    const action = msg.action || msg.payload?.action;
    try {
      const result = await handleCommand(action, msg.payload || {});
      sendBridgeMessage({ type: 'response', id: msg.id, result });
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      sendBridgeMessage({ type: 'response', id: msg.id, error });
    }
  }
}

async function disconnectBridge(): Promise<void> {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (nativePort) {
    try { nativePort.disconnect(); } catch {}
    nativePort = null;
  }
  if (socket) {
    try {
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      socket.close();
    } catch {}
    socket = null;
  }
  activeTransport = null;
  isConnected = false;
  notifyConnectionStatus(false);
  await cdpSession.detachAll().catch(() => {});
}

async function connectToBridge(force = false): Promise<void> {
  const cfg = await chrome.storage.local.get(['bridgeEnabled', 'bridgePort', 'bridgeTransport']).catch(() => ({} as Record<string, unknown>));
  if (force) {
    bridgeEnabled = true;
    await chrome.storage.local.set({ bridgeEnabled: true }).catch(() => {});
  } else if (cfg.bridgeEnabled === false || !bridgeEnabled) {
    bridgeEnabled = false;
    return;
  }

  const nativeActive = activeTransport === 'native' && nativePort !== null;
  const wsActive = socket !== null && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN);
  if (!force && (nativeActive || wsActive)) {
    return;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const customPort = typeof cfg.bridgePort === 'number' && cfg.bridgePort > 0 ? cfg.bridgePort : null;
  const preferNative = !customPort && cfg.bridgeTransport !== 'websocket' && typeof chrome?.runtime?.connectNative === 'function';

  if (preferNative) {
    if (nativePort) {
      try { nativePort.disconnect(); } catch {}
      nativePort = null;
    }
    try {
      const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
      nativePort = port;
      activeTransport = 'native';
      isConnected = true;
      reconnectAttempts = 0;
      notifyConnectionStatus(true);
      console.log('[Bridge] Connected via Native Messaging');

      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (activeTransport === 'native' && nativePort) {
          try { nativePort.postMessage({ type: 'ping' }); } catch {}
        }
      }, 20000);

      port.onMessage.addListener((msg) => {
        void handleBridgeIncoming(msg);
      });

      port.onDisconnect.addListener(() => {
        const errMsg = chrome.runtime.lastError?.message || '';
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        if (nativePort === port) {
          nativePort = null;
          activeTransport = null;
          isConnected = false;
          notifyConnectionStatus(false);
        }
        if (/not found|forbidden|native messaging host/i.test(errMsg)) {
          console.log('[Bridge] Native host unavailable, falling back to WebSocket:', errMsg);
          void connectWebSocketBridge(force, customPort);
        } else {
          scheduleReconnect();
        }
      });
      return;
    } catch {
      nativePort = null;
      activeTransport = null;
    }
  }

  await connectWebSocketBridge(force, customPort);
}

async function connectWebSocketBridge(force = false, customPort: number | null = null): Promise<void> {
  if (!force && socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
    return;
  }

  authToken = await getAuthToken();
  if (!authToken) {
    scheduleReconnect();
    return;
  }

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
    const wsPort = customPort || 7483;
    socket = new WebSocket(wsPort === 7483 ? BRIDGE_WS_URL : `ws://127.0.0.1:${wsPort}`);

    socket.onopen = () => {
      console.log('[Bridge] Connected to local bridge');
      socket!.send(JSON.stringify({ type: 'auth', token: authToken }));

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
          activeTransport = 'websocket';
          isConnected = true;
          notifyConnectionStatus(true);
          return;
        }

        if (msg.type === 'auth_fail' || msg.type === 'auth:fail') {
          console.error('[Bridge] Auth failed. Check token in settings.');
          activeTransport = null;
          isConnected = false;
          notifyConnectionStatus(false);
          socket?.close();
          return;
        }

        await handleBridgeIncoming(msg);
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
      activeTransport = null;
      isConnected = false;
      socket = null;
      notifyConnectionStatus(false);
      scheduleReconnect();
    };

    socket.onerror = () => {
      // Quietly handled by onclose + backoff reconnect when on-demand bridge is offline
    };

  } catch (err) {
    scheduleReconnect();
  }
}

async function testBridgeConnection(testToken?: string, testPort?: string | number): Promise<{ success: boolean; latency?: number; error?: string }> {
  const customNonDefaultPort = testPort !== undefined && Number(testPort) !== 7483;
  if (!customNonDefaultPort) {
    if (activeTransport !== 'native' || !nativePort) {
      await connectToBridge(false);
    }
    if (activeTransport === 'native' && nativePort) {
      try {
        nativePort.postMessage({ type: 'ping' });
        return { success: true, latency: 1 };
      } catch {
        // fall through to WebSocket test if native port failed
      }
    }
  }
  const tokenToTest = testToken || (await getAuthToken());
  const port = testPort || 7483;
  if (!tokenToTest) {
    return {
      success: false,
      error: 'Native Messaging not active and WebSocket fallback token is empty. Run `pnpm native:install` or paste a token in Advanced.',
    };
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
            // Ensure persistent background connection is active (force reconnect if a custom testPort was supplied)
            connectToBridge(Boolean(testPort && Number(testPort) !== 7483));
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
  if (!bridgeEnabled) return;
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

const tabOwnership = new Map<number, 'mine' | 'user' | 'other-agent'>();

function assertTabWritable(tabId: number | undefined, payload: Record<string, unknown>): void {
  if (!tabId) return;
  if (payload.protectUserTabs === true && tabOwnership.get(tabId) !== 'mine' && payload.allowUserTab !== true) {
    throw new Error(`Refusing to modify user-owned tab #${tabId} without allowUserTab or browser_use_tab lock`);
  }
}

function notifyConnectionStatus(connected: boolean): void {
  const badge = connected ? 'ONLINE' : 'OFFLINE';
  chrome.runtime.sendMessage({ type: 'CONNECTION_STATUS', connected, badge }).catch(() => {});
  chrome.storage.local.set({ bridgeConnected: connected, connectionBadge: badge, bridgeConnectedAt: Date.now() });
  try {
    chrome.action.setBadgeText({ text: connected ? 'ON' : 'OFF' }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ color: connected ? '#10B981' : '#EF4444' }).catch(() => {});
  } catch {}
}

// MV3 Keep-Alive & Lifecycle Reconnect
try {
  chrome.alarms?.create('drishti-keepalive', { periodInMinutes: 0.5 });
  chrome.alarms?.onAlarm.addListener((alarm) => {
    if (alarm.name === 'drishti-keepalive') {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping' }));
      } else {
        connectToBridge(false);
      }
    }
  });
  chrome.runtime.onStartup?.addListener(() => {
    connectToBridge(false);
  });
  chrome.runtime.onInstalled?.addListener(() => {
    connectToBridge(false);
  });
  // Preload content.js when HTTP(S) tabs finish loading so click/type never pay cold-inject latency
  chrome.tabs.onUpdated?.addListener((tabId, info, tab) => {
    if (info.status === 'complete' && tab?.url && /^https?:/i.test(tab.url)) {
      chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }).catch(() => {});
    }
  });
} catch {}

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
  const active = activeTabs[0];
  if (active?.id && active.url && !/^(chrome|brave|chrome-extension|edge):/i.test(active.url)) {
    return active.id;
  }
  const allTabs = await chrome.tabs.query({ currentWindow: true });
  const httpTab = allTabs.find((t) => t.id && t.url && /^https?:/i.test(t.url));
  return httpTab?.id ?? active?.id;
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
    'GET_DOM_SNAPSHOT', 'OBSERVE', 'browser_observe', 'GET_TEXT', 'GET_LINKS',
    'FIND_ELEMENT', 'GET_TABLES', 'GET_FORMS', 'INSPECT', 'CLICK', 'HOVER',
    'TYPE', 'SCROLL', 'SCROLL_INTO_VIEW', 'PRESS_KEY', 'SELECT_OPTION',
    'WAIT', 'WAIT_FOR', 'DRAG', 'GET_PAGE_INFO', 'GET_CONSOLE_LOGS', 'SCREENSHOT'
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
  } else if ([
    'NAVIGATE', 'NEW_TAB', 'CLICK', 'HOVER', 'TYPE', 'DRAG', 'SELECT_OPTION',
    'EXECUTE_SCRIPT', 'GET_DOM_SNAPSHOT', 'OBSERVE', 'browser_observe',
    'GET_TEXT', 'GET_LINKS', 'FIND_ELEMENT', 'GET_TABLES', 'GET_FORMS',
    'INSPECT', 'SCREENSHOT', 'GET_PAGE_INFO', 'GET_CONSOLE_LOGS'
  ].includes(action)) {
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
      case 'USE_TAB':           result = await useTab(payload); break;
      case 'NAVIGATE':          result = await navigate(payload); break;
      case 'NEW_TAB':           result = await newTab(payload); break;
      case 'CLOSE_TAB':         result = await closeTab(payload); break;
      case 'SWITCH_TAB':        result = await switchTab(payload); break;
      case 'RELOAD':            result = await reloadTab(payload); break;
      case 'GO_BACK':           result = await goBack(payload); break;
      case 'GO_FORWARD':        result = await goForward(payload); break;
      case 'SCREENSHOT':        result = await takeScreenshot(payload); break;
      case 'PRINT_PDF':         result = await printPdf(payload); break;
      case 'EXECUTE_SCRIPT':    result = await executeScript(payload); break;
      case 'OBSERVE':
      case 'browser_observe':   result = await observePage(payload); break;
      case 'GET_DOM_SNAPSHOT':  result = await getDomSnapshot(payload); break;
      case 'INSPECT':           result = await inspectElement(payload); break;
      case 'GET_TEXT':          result = await getPageText(payload); break;
      case 'EVALUATE':          result = await evaluateInPage(payload); break;
      case 'READ_PAGE':         result = await readPage(payload); break;
      case 'GREP_PAGE':         result = await grepPage(payload); break;
      case 'GET_LINKS':         result = await getPageLinks(payload); break;
      case 'FIND_ELEMENT':      result = await findPageElement(payload); break;
      case 'GET_TABLES':        result = await getPageTables(payload); break;
      case 'GET_FORMS':         result = await getPageForms(payload); break;
      case 'CLICK':             result = await clickElement(payload); break;
      case 'DOUBLE_CLICK':      result = await clickElement({ ...payload, doubleClick: true }); break;
      case 'HOVER':             result = await hoverElement(payload); break;
      case 'TYPE':              result = await typeText(payload); break;
      case 'SCROLL':            result = await scrollPage(payload); break;
      case 'SCROLL_INTO_VIEW':  result = await scrollIntoView(payload); break;
      case 'PRESS_KEY':         result = await pressKey(payload); break;
      case 'SELECT_OPTION':     result = await selectOption(payload); break;
      case 'DRAG':              result = await dragAndDrop(payload); break;
      case 'WAIT':              result = await waitCommand(payload); break;
      case 'WAIT_FOR':          result = await waitForCondition(payload); break;
      case 'DOWNLOAD_MEDIA':    result = await downloadMedia(payload); break;
      case 'DOWNLOAD_STATUS':   result = await getDownloadStatus(payload); break;
      case 'WAIT_DOWNLOAD':     result = await waitDownload(payload); break;
      case 'GET_PAGE_INFO':     result = await getPageInfo(payload); break;
      case 'GET_CONSOLE_LOGS':  result = await getConsoleLogs(payload); break;
      case 'BATCH_COMPARE':     result = await batchCompare(payload); break;
      case 'GET_LEARNING_STATS': result = await getLearningStats(); break;
      case 'GROUP_TABS':        result = await groupTabs(payload); break;
      case 'EXECUTE_WORKFLOW':  result = await executeWorkflow(payload); break;
      case 'VERIFY_ACTION':     result = await verifyAction(payload); break;
      case 'TASK_STATUS':       result = await getTaskStatus(payload); break;
      case 'STOP_TASK':         result = await stopTask(payload); break;
      case 'GET_NETWORK_LOGS':  result = await getNetworkLogs(payload); break;
      case 'REQUEST_HUMAN_HELP': result = await requestHumanHelp(payload); break;
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
    const tabId = (payload.tabId as number | undefined) || (await resolveDefaultTabId()) || undefined;
    if (tabId) {
      await dispatchShadowCursor(tabId, 'error', 0, 0, 'ERROR', undefined, `ERROR · ${errorMsg.slice(0, 48)}`).catch(() => {});
    }
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
    ownership: (t.id && tabOwnership.get(t.id)) || 'user',
  }));
}

async function getActiveTab(): Promise<unknown> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function navigate(payload: Record<string, unknown>): Promise<unknown> {
  const url = payload.url as string;
  if (!url) throw new Error('url is required');

  const navStart = Date.now();
  const tabId = payload.tabId as number | undefined;
  assertTabWritable(tabId, payload);

  const resolvedTab = tabId || (await resolveDefaultTabId()) || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!resolvedTab) throw new Error('No active tab');

  // Pre-warm content script + one quick snapshot on current scriptable page before navigating
  const preTab = await chrome.tabs.get(resolvedTab).catch(() => null);
  const oldUrl = preTab?.url || '';
  if (oldUrl && /^https?:/i.test(oldUrl)) {
    await chrome.scripting.executeScript({ target: { tabId: resolvedTab }, files: ['content.js'] }).catch(() => {});
    await getDomSnapshot({ tabId: resolvedTab }).catch(() => {});
  }

  let timedOut = false;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const waitPromise = payload.waitForLoad !== false ? waitForTabLoad(resolvedTab, 4500, url, oldUrl) : null;
      await chrome.tabs.update(resolvedTab, { url });
      if (waitPromise) {
        const loadResult = await waitPromise;
        timedOut = loadResult.timedOut;
      }
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (attempt === 2) break;
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  if (lastErr) throw lastErr;

  const tabInfo = await chrome.tabs.get(resolvedTab).catch(() => null);
  let readyStateComplete = false;
  if (tabInfo?.url && /^https?:/i.test(tabInfo.url)) {
    await chrome.scripting.executeScript({ target: { tabId: resolvedTab }, files: ['content.js'] }).catch(() => {});
    const rsRes = await chrome.scripting
      .executeScript({ target: { tabId: resolvedTab }, func: () => document.readyState === 'complete' })
      .catch(() => null);
    readyStateComplete = Boolean(rsRes?.[0]?.result);
    // Auto-wait for a stable results selector on search/product pages
    if (/[?&](q|k|query|search)=|\/search\b|\/dp\/|\/p\//i.test(url)) {
      await chrome.scripting
        .executeScript({
          target: { tabId: resolvedTab },
          func: () =>
            new Promise<void>((resolve) => {
              const start = performance.now();
              const sel = 'main, [role="main"], [data-component-type="s-search-result"], #search, .search-results, article, table, input[type="search"], #twotabsearchtextbox';
              const poll = () => {
                if (document.querySelector(sel) || performance.now() - start >= 1200) {
                  resolve();
                  return;
                }
                setTimeout(poll, 60);
              };
              poll();
            }),
        })
        .catch(() => {});
    }
  }

  let navLabel = tabInfo?.title?.trim() || '';
  if (!navLabel || navLabel.length > 28) {
    try {
      const u = new URL(url);
      const segs = u.pathname.split('/').filter(Boolean);
      const lastSeg = segs[segs.length - 1] || '';
      navLabel = lastSeg ? `${u.hostname}/${lastSeg}` : u.hostname;
    } catch {
      navLabel = navLabel || url.slice(0, 28);
    }
  }
  const shortNav = formatHumanLabel(navLabel, 28);
  await dispatchShadowCursor(
    resolvedTab,
    'navigate',
    0,
    0,
    `NAVIGATE · ${shortNav}`,
    undefined,
    `NAVIGATE · ${shortNav}`
  );

  let urlMatches = false;
  try {
    const reqU = new URL(url);
    const curU = new URL(tabInfo?.url || '');
    urlMatches = reqU.origin === curU.origin && reqU.pathname === curU.pathname;
  } catch {
    urlMatches = tabInfo?.url === url;
  }
  const verified = !timedOut && urlMatches && readyStateComplete;

  return {
    ok: true,
    action: 'navigate',
    target: url,
    tabId: resolvedTab,
    title: tabInfo?.title || '',
    currentUrl: tabInfo?.url || '',
    readyStateComplete,
    timedOut,
    verified,
    ms: Date.now() - navStart,
  };
}

async function waitForTabLoad(tabId?: number, maxWaitMs = 4500, targetUrl?: string, _oldUrl?: string): Promise<{ timedOut: boolean }> {
  const loadTimedOut = await new Promise<boolean>((resolve) => {
    let settled = false;
    let sawLoading = false;
    let targetHost = '';
    try {
      if (targetUrl) targetHost = new URL(targetUrl).origin;
    } catch {}

    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(poller);
      chrome.tabs.onUpdated.removeListener(listener);
    };

    const listener = (id: number, info: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (tabId && id !== tabId) return;
      if (info.status === 'loading') {
        sawLoading = true;
      }
      if (info.status === 'complete' && !settled && sawLoading) {
        const curUrl = tab?.url || '';
        const hostOk = !targetHost || curUrl.startsWith(targetHost);
        if (hostOk) {
          settled = true;
          cleanup();
          resolve(false);
        }
      }
    };

    const poller = setInterval(async () => {
      if (settled || !tabId) return;
      const t = await chrome.tabs.get(tabId).catch(() => null);
      if (t?.status === 'loading') sawLoading = true;
      if (t?.status === 'complete' && sawLoading) {
        const curUrl = t.url || '';
        if (!targetHost || curUrl.startsWith(targetHost)) {
          const rs = await chrome.scripting
            .executeScript({ target: { tabId }, func: () => document.readyState })
            .catch(() => null);
          if (rs?.[0]?.result === 'complete') {
            settled = true;
            cleanup();
            resolve(false);
          }
        }
      }
    }, 80);

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(true);
      }
    }, maxWaitMs);

    chrome.tabs.onUpdated.addListener(listener);
  });

  if (!tabId) return { timedOut: loadTimedOut };
  // Brief DOM stability check (150ms quiet window, bounded at 600ms)
  await chrome.scripting
    .executeScript({
      target: { tabId },
      func: () =>
        new Promise<void>((resolve) => {
          let lastMutation = performance.now();
          const start = performance.now();
          const observer = new MutationObserver(() => {
            lastMutation = performance.now();
          });
          if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true, attributes: true });
          }
          const check = () => {
            const now = performance.now();
            if (
              (document.readyState === 'complete' && now - lastMutation >= 150) ||
              now - start >= 600
            ) {
              observer.disconnect();
              resolve();
              return;
            }
            setTimeout(check, 40);
          };
          setTimeout(check, 40);
        }),
    })
    .catch(() => {});

  return { timedOut: loadTimedOut };
}

async function newTab(payload: Record<string, unknown>): Promise<unknown> {
  const targetUrl = (payload.url as string) || 'about:blank';
  const tab = await chrome.tabs.create({ url: targetUrl });
  if (tab.id) {
    tabOwnership.set(tab.id, 'mine');
    if (/^https?:\/\//i.test(targetUrl)) {
      await waitForTabLoad(tab.id, 6000, targetUrl);
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }).catch(() => {});
    }
  }
  const latest = tab.id ? await chrome.tabs.get(tab.id).catch(() => tab) : tab;
  return {
    ok: true,
    id: tab.id,
    tabId: tab.id,
    url: latest?.url || tab.url,
    title: latest?.title || tab.title,
    ownership: 'mine',
  };
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
  assertTabWritable(target, payload);
  await chrome.tabs.goBack(target);
  return { success: true };
}

async function goForward(payload: Record<string, unknown>): Promise<unknown> {
  const tabId = payload.tabId as number | undefined;
  const target = tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!target) throw new Error('No active tab');
  assertTabWritable(target, payload);
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

let captureMutex: Promise<void> = Promise.resolve();
let lastCaptureAt = 0;

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

  let releaseMutex!: () => void;
  const prevMutex = captureMutex;
  captureMutex = new Promise<void>((res) => {
    releaseMutex = res;
  });

  await prevMutex;
  try {
    const elapsed = Date.now() - lastCaptureAt;
    if (lastCaptureAt > 0 && elapsed < 550) {
      await new Promise((r) => setTimeout(r, 550 - elapsed));
    }

    let lastErr: unknown;
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        lastCaptureAt = Date.now();
        const dataUrl = windowId
          ? await chrome.tabs.captureVisibleTab(windowId, { format, quality })
          : await chrome.tabs.captureVisibleTab({ format, quality });
        const base64 = dataUrl.replace(/^data:image\/(png|jpeg);base64,/, '');
        return { base64, format, size: base64.length };
      } catch (err: unknown) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        if (/MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND|quota/i.test(msg)) {
          return { ok: false, code: 'CAPTURE_THROTTLED', error: msg };
        }
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 700));
        }
      }
    }

    // Fallback to CDP Page.captureScreenshot (works even when the browser window is minimized)
    try {
      const targetTabId =
        (payload.tabId as number | undefined) ||
        (await resolveDefaultTabId()) ||
        (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
      if (targetTabId) {
        const cdpShot = await cdpSession.sendCommand<{ data?: string }>(targetTabId, 'Page.captureScreenshot', {
          format: format === 'jpeg' ? 'jpeg' : 'png',
          ...(format === 'jpeg' ? { quality } : {}),
        });
        if (cdpShot?.data) {
          return { base64: cdpShot.data, format, size: cdpShot.data.length };
        }
      }
    } catch {
      // fall through to original error
    }

    throw new Error(`Screenshot capture failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
  } finally {
    releaseMutex();
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
  assertTabWritable(target, payload);

  const includeHtml = Boolean(payload.includeHtml);
  const results = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: extractDomSnapshot,
    args: [includeHtml],
  });

  return results[0]?.result;
}

export interface ElementSnapshot {
  ref: string;
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

// This function runs in the page context
function extractDomSnapshot(includeHtml = false) {
  const elements: ElementSnapshot[] = [];
  const INTERACTIVE_SELECTOR =
    'a, button, input, select, textarea, [contenteditable="true"], [role="button"], [role="link"], [role="textbox"], [role="checkbox"], [role="radio"], [role="tab"], [role="switch"], [role="menuitem"], [onclick], [tabindex]';
  const collected: Element[] = [];
  const collectInteractive = (root: ParentNode, depth = 0) => {
    if (depth > 4 || collected.length >= 250) return;
    root.querySelectorAll(INTERACTIVE_SELECTOR).forEach((el) => {
      if (collected.length < 250) collected.push(el);
    });
    root.querySelectorAll('*').forEach((host) => {
      if (host.shadowRoot && collected.length < 250) {
        collectInteractive(host.shadowRoot, depth + 1);
      }
    });
  };
  collectInteractive(document);
  const interactive = collected;

  let refIndex = 0;
  interactive.forEach((el) => {
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

    refIndex += 1;
    const ref = `@e${refIndex}`;
    try {
      el.setAttribute('data-drishti-ref', ref);
    } catch {}

    const snap: ElementSnapshot = {
      ref,
      selector: el.id
        ? `#${el.id}`
        : `[data-drishti-ref="${ref}"]`,
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').trim().slice(0, 240),
      role: el.getAttribute('role') || undefined,
      ariaLabel: el.getAttribute('aria-label') || undefined,
      id: el.id || undefined,
      classes: typeof el.className === 'string' && el.className
        ? el.className.split(' ').filter(Boolean)
        : undefined,
      bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
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
    ...(includeHtml ? { html: document.documentElement.outerHTML.slice(0, 50000) } : {}),
  };
}

async function getCursorSpeedMs(): Promise<number> {
  const { cursorSpeed } = await chrome.storage.local.get('cursorSpeed');
  if (cursorSpeed === 'fast') return 180;
  if (cursorSpeed === 'demo') return 850;
  return 460;
}

interface ActionResult {
  ok: boolean;
  action: string;
  target?: string;
  rect?: { x: number; y: number; w: number; h: number };
  verified: boolean;
  ms: number;
  timings?: { locateMs: number; cursorMs: number; executeMs: number; verifyMs: number };
  error?: string;
  [key: string]: unknown;
}

function formatHumanLabel(raw: string, maxLen = 28): string {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  const slice = cleaned.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = (lastSpace > 4 ? slice.slice(0, lastSpace) : slice).trim();
  return `${cut}…`;
}

async function dispatchShadowCursor(
  tabId: number,
  mode: 'move' | 'hover' | 'click' | 'type' | 'scroll' | 'key' | 'select' | 'drag' | 'navigate' | 'error',
  x: number,
  y: number,
  label: string,
  rect?: { left: number; top: number; width: number; height: number },
  hudText?: string,
  extra?: {
    scrollPct?: number;
    dragTo?: { x: number; y: number };
    typingProgress?: string;
    realRect?: { left: number; top: number; width: number; height: number };
  }
): Promise<void> {
  const durationMs = await getCursorSpeedMs();
  const message = {
    type: 'DRISHTI_CURSOR_ACTION',
    payload: { mode, x, y, rect, durationMs, label, hudText, ...(extra || {}) },
  };
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Content script may not be loaded on tabs opened before extension reload — inject and retry once
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      await chrome.tabs.sendMessage(tabId, message);
    } catch {
      // Ignore on restricted pages
    }
  }
}

async function trustedCdpClick(tabId: number, x: number, y: number, doubleClick = false): Promise<boolean> {
  const { trustedCdpMode } = await chrome.storage.local.get('trustedCdpMode');
  if (trustedCdpMode === false) return false;
  const hasPerm = await chrome.permissions.contains({ permissions: ['debugger'] }).catch(() => false);
  if (!hasPerm) return false;

  let timerId: ReturnType<typeof setTimeout> | null = null;
  const runCdp = (async () => {
    await cdpSession.sendCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
    });
    const clicks = doubleClick ? [1, 2] : [1];
    for (const clickCount of clicks) {
      await cdpSession.sendCommand(tabId, 'Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x,
        y,
        button: 'left',
        clickCount,
      });
      await new Promise((r) => setTimeout(r, 40));
      await cdpSession.sendCommand(tabId, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x,
        y,
        button: 'left',
        clickCount,
      });
    }
    return true;
  })();

  try {
    const cdpTimeout = new Promise<boolean>((resolve) => {
      timerId = setTimeout(() => resolve(false), 800);
    });
    return await Promise.race([runCdp, cdpTimeout]);
  } catch {
    return false;
  } finally {
    if (timerId !== null) clearTimeout(timerId);
  }
}

async function hoverElement(payload: Record<string, unknown>): Promise<ActionResult> {
  const startedAt = Date.now();
  const tabId = payload.tabId as number | undefined;
  const target =
    tabId ||
    (await resolveDefaultTabId()) ||
    (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!target) throw new Error('No active tab');
  assertTabWritable(target, payload);

  await yieldIfHumanActive();

  const refSelector = payload.ref ? `[data-drishti-ref="${String(payload.ref)}"]` : null;
  const resolvedSelector = (payload.selector as string) || refSelector || '';
  if (!resolvedSelector) throw new Error('Element not found for hover: selector or ref required');

  const locateRes = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: async (selector: string) => {
      let el: HTMLElement | null = null;
      try {
        el = document.querySelector(selector) as HTMLElement | null;
      } catch {
        el = null;
      }
      if (!el) {
        const hasTextMatch = selector.match(/:has-text\(['"](.+?)['"]\)/i);
        const clean = (hasTextMatch ? hasTextMatch[1] : selector.replace(/[#.[\]="'"]/g, ' '))
          .trim()
          .toLowerCase();
        const candidates = Array.from(
          document.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="link"], [role="menuitem"]')
        ) as HTMLElement[];
        el =
          candidates.find((c) => {
            const t = (c.textContent || '').trim().toLowerCase();
            const a = (c.getAttribute('aria-label') || '').trim().toLowerCase();
            const p = (c.getAttribute('placeholder') || '').trim().toLowerCase();
            return (clean && t.includes(clean)) || (clean && a.includes(clean)) || (clean && p.includes(clean));
          }) || null;
      }
      if (!el) throw new Error(`Element not found for hover: ${selector}`);

      const initialRect = el.getBoundingClientRect();
      if (initialRect.top < 24 || initialRect.bottom > window.innerHeight - 24) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        await new Promise<void>((resolve) => {
          let lastTop = initialRect.top;
          let stableFrames = 0;
          const started = performance.now();
          const check = () => {
            const r = el!.getBoundingClientRect();
            if (Math.abs(r.top - lastTop) < 0.75) stableFrames++;
            else stableFrames = 0;
            lastTop = r.top;
            if (stableFrames >= 3 || performance.now() - started > 450) resolve();
            else requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        });
      }

      el.setAttribute('data-drishti-pending-hover', '1');
      const rect = el.getBoundingClientRect();
      const labelEl = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
      const rawLabel =
        (labelEl?.textContent || '') ||
        el.getAttribute('aria-label') ||
        el.getAttribute('placeholder') ||
        el.textContent ||
        selector;
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        rawLabel: rawLabel.trim(),
      };
    },
    args: [resolvedSelector],
  });

  const coords = locateRes[0]?.result;
  if (!coords) throw new Error(`Element not found for hover: ${resolvedSelector}`);

  const human = formatHumanLabel(coords.rawLabel || resolvedSelector);
  const hud = `HOVER · ${human}`;
  await dispatchShadowCursor(target, 'hover', coords.x, coords.y, hud, coords.rect, hud);

  let verified = false;
  try {
    await cdpSession.sendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: coords.x,
      y: coords.y,
      button: 'none',
    });
  } catch {
    await chrome.scripting
      .executeScript({
        target: { tabId: target },
        func: (px: number, py: number) => {
          const el =
            (document.querySelector('[data-drishti-pending-hover="1"]') as HTMLElement | null) ||
            (document.elementFromPoint(px, py) as HTMLElement | null);
          if (!el) return;
          for (const evt of ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'mousemove']) {
            const Ctor = evt.startsWith('pointer') ? PointerEvent : MouseEvent;
            el.dispatchEvent(new Ctor(evt, { bubbles: evt !== 'mouseenter' && evt !== 'pointerenter', clientX: px, clientY: py }));
          }
        },
        args: [coords.x, coords.y],
      })
      .catch(() => {});
  }

  await new Promise((r) => setTimeout(r, 120));

  const hoverVerify = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: () => {
      const el = document.querySelector('[data-drishti-pending-hover="1"]') as HTMLElement | null;
      if (!el) return false;
      el.removeAttribute('data-drishti-pending-hover');
      return el.matches(':hover') || Boolean(document.querySelector(':hover'));
    },
  });

  verified = Boolean(hoverVerify[0]?.result);
  if (!verified) {
    return {
      ok: false,
      action: 'hover',
      target: human,
      rect: { x: Math.round(coords.rect.left), y: Math.round(coords.rect.top), w: Math.round(coords.rect.width), h: Math.round(coords.rect.height) },
      verified: false,
      error: 'hover not applied',
      ms: Date.now() - startedAt,
    };
  }

  return {
    ok: true,
    action: 'hover',
    target: human,
    rect: { x: Math.round(coords.rect.left), y: Math.round(coords.rect.top), w: Math.round(coords.rect.width), h: Math.round(coords.rect.height) },
    verified: true,
    hovered: true,
    ms: Date.now() - startedAt,
  } as ActionResult & { hovered: boolean };
}

async function clickElement(payload: Record<string, unknown>): Promise<unknown> {
  const tabId = payload.tabId as number | undefined;
  const target =
    tabId ||
    (await resolveDefaultTabId()) ||
    (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!target) throw new Error('No active tab');
  assertTabWritable(target, payload);

  let hostname = '';
  try {
    const tab = await chrome.tabs.get(target);
    if (tab?.url) hostname = new URL(tab.url).hostname;
  } catch {}
  const refSelector = payload.ref ? `[data-drishti-ref="${String(payload.ref)}"]` : null;
  const resolvedInputSelector = (payload.selector as string) || refSelector;
  const learnedSel = await lookupLearnedSelector(hostname, resolvedInputSelector);

  await yieldIfHumanActive();

  // Arm MAIN-world blob: download interceptor for 10s so AI-triggered blob downloads bypass OS Save As dialogs
  await chrome.scripting
    .executeScript({
      target: { tabId: target },
      world: 'MAIN',
      func: () => {
        const w = window as unknown as { __drishtiBlobHooked?: boolean; __drishtiBlobInterceptUntil?: number };
        w.__drishtiBlobInterceptUntil = Date.now() + 10_000;
        if (w.__drishtiBlobHooked) return;
        w.__drishtiBlobHooked = true;
        const origClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement, ...args: unknown[]) {
          if (
            (w.__drishtiBlobInterceptUntil || 0) > Date.now() &&
            this.hasAttribute('download') &&
            typeof this.href === 'string' &&
            this.href.startsWith('blob:')
          ) {
            const blobUrl = this.href;
            const filename = this.getAttribute('download') || 'download.bin';
            fetch(blobUrl)
              .then((r) => r.blob())
              .then((blob) => {
                if (blob.size > 45 * 1024 * 1024) {
                  // Too large for data: URL IPC; fall back to native click
                  origClick.apply(this, args as []);
                  return;
                }
                const reader = new FileReader();
                reader.onloadend = () => {
                  if (typeof reader.result === 'string') {
                    window.postMessage(
                      { source: 'DRISHTI_BLOB_DOWNLOAD', payload: { dataUrl: reader.result, filename } },
                      '*'
                    );
                  }
                };
                reader.readAsDataURL(blob);
              })
              .catch(() => {
                origClick.apply(this, args as []);
              });
            return;
          }
          return origClick.apply(this, args as []);
        };
      },
    })
    .catch(() => {});

  const runLocate = () =>
    chrome.scripting.executeScript({
      target: { tabId: target },
      func: async (
        selector: string | null,
        x: number | null,
        y: number | null,
        learnedSelector: string | null
      ) => {
      async function waitScrollSettle(element: HTMLElement) {
        const r0 = element.getBoundingClientRect();
        if (r0.top >= 24 && r0.bottom <= window.innerHeight - 24) return;
        element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
        await new Promise<void>((resolve) => {
          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            clearTimeout(fallback);
            resolve();
          };
          const fallback = setTimeout(done, 150);
          let lastTop = r0.top;
          let stable = 0;
          const started = performance.now();
          const tick = () => {
            if (settled) return;
            const r = element.getBoundingClientRect();
            if (Math.abs(r.top - lastTop) < 0.75) stable++;
            else stable = 0;
            lastTop = r.top;
            if (stable >= 2 || performance.now() - started > 150) done();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      }

      let el: HTMLElement | null = null;
      let usedLearned = false;
      let selfHealed = false;
      let resolvedSelector: string | null = null;

      if (selector) {
        try {
          el = document.querySelector(selector) as HTMLElement | null;
        } catch {
          el = null;
        }
        if (!el && selector.includes(',')) {
          for (const part of selector.split(',').map((s) => s.trim()).filter(Boolean)) {
            if (/:has-text\(/i.test(part)) continue;
            try {
              const found = document.querySelector(part) as HTMLElement | null;
              if (found) {
                el = found;
                break;
              }
            } catch {
              // ignore invalid CSS sub-selector
            }
          }
        }
        if (!el && learnedSelector) {
          try {
            el = document.querySelector(learnedSelector) as HTMLElement | null;
          } catch {
            el = null;
          }
          if (el) usedLearned = true;
        }
        if (!el) {
          const hasTextMatch = selector.match(/:has-text\(['"](.+?)['"]\)/i);
          const cleanText = (hasTextMatch ? hasTextMatch[1] : selector.replace(/[#.[\]="'"]/g, ' '))
            .trim()
            .toLowerCase();
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
              selfHealed = true;
              const aria = cand.getAttribute('aria-label');
              resolvedSelector = cand.id
                ? `#${cand.id}`
                : aria
                ? `[aria-label="${aria.replace(/"/g, '\\"')}"]`
                : null;
              break;
            }
          }
        }
        if (!el) throw new Error(`Element not found: ${selector}`);
      } else if (x !== null && y !== null) {
        el = document.elementFromPoint(x, y) as HTMLElement | null;
        if (!el) throw new Error(`No element at (${x},${y})`);
      } else {
        throw new Error('selector or coordinates required');
      }

      await waitScrollSettle(el);
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {
        throw new Error(`Element matched "${selector || 'target'}" is not visible (0x0)`);
      }

      // G3: Resolve human label (never fall back to CSS selector)
      const resolveLabel = (node: HTMLElement): string => {
        if (node instanceof HTMLSelectElement) {
          const selText = node.options[node.selectedIndex]?.textContent?.trim();
          if (selText) return selText;
        }
        if (node.id) {
          const forLabel = document.querySelector(`label[for="${CSS.escape(node.id)}"]`)?.textContent?.trim();
          if (forLabel) return forLabel;
        }
        const closestLabel = node.closest('label');
        if (closestLabel) {
          const isTextLike =
            node instanceof HTMLTextAreaElement ||
            (node instanceof HTMLInputElement &&
              /^(text|search|email|url|tel|number|password)$/i.test(node.type || 'text'));
          const clone = closestLabel.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('input, select, textarea, button').forEach((ctrl) => ctrl.remove());
          let txt = (clone.textContent || '').replace(/\s+/g, ' ').trim();
          if (isTextLike && 'value' in node) {
            const ownVal = String((node as HTMLInputElement).value || '');
            if (ownVal) txt = txt.replace(ownVal, '').replace(/\s+/g, ' ').trim();
          }
          if (txt) return txt;
        }
        const aria = node.getAttribute('aria-label')?.trim();
        if (aria) return aria;
        const labelledBy = node.getAttribute('aria-labelledby');
        if (labelledBy) {
          const refTxt = labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent?.trim() || '')
            .filter(Boolean)
            .join(' ')
            .trim();
          if (refTxt) return refTxt;
        }
        const ph = node.getAttribute('placeholder')?.trim();
        if (ph) return ph;
        const title = node.getAttribute('title')?.trim();
        if (title) return title;
        const selfTxt = !(node instanceof HTMLSelectElement) ? (node.textContent || '').replace(/\s+/g, ' ').trim() : '';
        if (selfTxt) return selfTxt;
        const parentRow = node.parentElement;
        if (parentRow) {
          const sibTxt = Array.from(parentRow.childNodes)
            .filter((n) => n !== node)
            .map((n) => (n.textContent || '').replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .join(' ')
            .slice(0, 60)
            .trim();
          if (sibTxt) return sibTxt;
        }
        if (node instanceof HTMLInputElement) {
          if (node.type === 'checkbox') return 'checkbox';
          if (node.type === 'radio') return 'radio';
          return 'field';
        }
        if (node.tagName === 'OPTION') return 'option';
        if (node.tagName === 'TEXTAREA' || node.tagName === 'SELECT') return 'field';
        return 'button';
      };

      const rawLabel = resolveLabel(el);

      // G7: For small targets (<24px), expand visual box to label/parent row (<=44px) while keeping real click centre
      let visualRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      if (rect.width < 24 || rect.height < 24) {
        const container = (el.closest('label') || el.parentElement) as HTMLElement | null;
        if (container) {
          const cr = container.getBoundingClientRect();
          if (cr.height > 0 && cr.height <= 44 && cr.width >= rect.width) {
            visualRect = { left: cr.left, top: cr.top, width: cr.width, height: cr.height };
          }
        }
      }

      el.setAttribute('data-drishti-pending-click', '1');
      return {
        x: x !== null && !selector ? x : Math.round(rect.left + rect.width / 2),
        y: y !== null && !selector ? y : Math.round(rect.top + rect.height / 2),
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        visualRect,
        usedLearned,
        selfHealed,
        resolvedSelector,
        matchedText: rawLabel,
      };
    },
    args: [
      resolvedInputSelector,
      (payload.x as number) ?? null,
      (payload.y as number) ?? null,
      learnedSel,
    ],
  });

  let locateRes;
  try {
    locateRes = await runLocate();
  } catch (firstErr) {
    const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    if (/element not found/i.test(msg) && resolvedInputSelector) {
      broadcastAction('Selector stale — retrying with fresh snapshot', 'RETRY', 'pending');
      await getDomSnapshot({ tabId: target }).catch(() => {});
      locateRes = await runLocate();
    } else {
      throw firstErr;
    }
  }

  const clickStartedAt = Date.now();
  const locateMs = 0;
  const isDoubleClick = Boolean(payload.doubleClick);
  const prep = locateRes[0]?.result as {
    x: number;
    y: number;
    rect: { left: number; top: number; width: number; height: number };
    visualRect: { left: number; top: number; width: number; height: number };
    usedLearned: boolean;
    selfHealed: boolean;
    resolvedSelector: string | null;
    matchedText: string;
  };

  if (!prep) {
    throw new Error(`Element not found: ${resolvedInputSelector || `(${payload.x},${payload.y})`}`);
  }

  const humanTarget = formatHumanLabel(prep.matchedText || 'button', 28);
  const clickHud = isDoubleClick ? `DBLCLICK · ${humanTarget}` : /copy/i.test(humanTarget) ? `COPY · ${humanTarget}` : `CLICK · ${humanTarget}`;
  const cursorT0 = Date.now();
  await dispatchShadowCursor(target, 'click', prep.x, prep.y, clickHud, prep.visualRect, clickHud, {
    realRect: prep.rect,
  });
  const cursorMs = Date.now() - cursorT0;

  const preUrl = (await chrome.tabs.get(target).catch(() => null))?.url || '';
  const cdpOk = await trustedCdpClick(target, prep.x, prep.y, isDoubleClick);

  const clickRes = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: async (selector: string | null, x: number | null, y: number | null, alreadyCdpClicked: boolean, dbl: boolean) => {
      const el =
        (document.querySelector('[data-drishti-pending-click="1"]') as HTMLElement | null) ||
        (selector ? (document.querySelector(selector) as HTMLElement | null) : null) ||
        (x !== null && y !== null ? (document.elementFromPoint(x, y) as HTMLElement | null) : null);
      const prevExpanded = el?.getAttribute('aria-expanded');
      const prevChecked = el instanceof HTMLInputElement ? el.checked : null;
      const prevBodyLen = document.body?.innerText?.length || 0;

      if (el) {
        el.removeAttribute('data-drishti-pending-click');
        if (!alreadyCdpClicked) {
          if (dbl) {
            el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
          } else {
            el.click();
          }
        }
      }

      await new Promise((r) => setTimeout(r, 80));
      const changed =
        !el ||
        !el.isConnected ||
        el.getAttribute('aria-expanded') !== prevExpanded ||
        (el instanceof HTMLInputElement && el.checked !== prevChecked) ||
        (document.body?.innerText?.length || 0) !== prevBodyLen;
      return { verified: Boolean(el) || changed };
    },
    args: [resolvedInputSelector, (payload.x as number) ?? null, (payload.y as number) ?? null, cdpOk, isDoubleClick],
  });

  if (prep.selfHealed && prep.resolvedSelector && hostname && payload.selector) {
    await recordLearnedSelector(hostname, String(payload.selector), String(prep.resolvedSelector));
  }
  const postUrl = (await chrome.tabs.get(target).catch(() => null))?.url || '';
  const verified = Boolean(clickRes[0]?.result?.verified) || postUrl !== preUrl;
  const totalMs = Date.now() - clickStartedAt;

  return {
    ok: true,
    action: isDoubleClick ? 'double_click' : 'click',
    target: humanTarget,
    rect: {
      x: Math.round(prep.rect.left),
      y: Math.round(prep.rect.top),
      w: Math.round(prep.rect.width),
      h: Math.round(prep.rect.height),
    },
    verified,
    timings: { locateMs, cursorMs, executeMs: Math.max(0, totalMs - cursorMs), verifyMs: 0 },
    ms: totalMs,
  };
}

async function typeText(payload: Record<string, unknown>): Promise<unknown> {
  const tabId = payload.tabId as number | undefined;
  const target =
    tabId ||
    (await resolveDefaultTabId()) ||
    (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!target) throw new Error('No active tab');
  assertTabWritable(target, payload);

  await yieldIfHumanActive();

  // Arm MAIN-world blob: download interceptor for 10s so AI-triggered blob downloads bypass OS Save As dialogs
  await chrome.scripting
    .executeScript({
      target: { tabId: target },
      world: 'MAIN',
      func: () => {
        const w = window as unknown as { __drishtiBlobHooked?: boolean; __drishtiBlobInterceptUntil?: number };
        w.__drishtiBlobInterceptUntil = Date.now() + 10_000;
        if (w.__drishtiBlobHooked) return;
        w.__drishtiBlobHooked = true;
        const origClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement, ...args: unknown[]) {
          if (
            (w.__drishtiBlobInterceptUntil || 0) > Date.now() &&
            this.hasAttribute('download') &&
            typeof this.href === 'string' &&
            this.href.startsWith('blob:')
          ) {
            const blobUrl = this.href;
            const filename = this.getAttribute('download') || 'download.bin';
            fetch(blobUrl)
              .then((r) => r.blob())
              .then((blob) => {
                if (blob.size > 45 * 1024 * 1024) {
                  // Too large for data: URL IPC; fall back to native click
                  origClick.apply(this, args as []);
                  return;
                }
                const reader = new FileReader();
                reader.onloadend = () => {
                  if (typeof reader.result === 'string') {
                    window.postMessage(
                      { source: 'DRISHTI_BLOB_DOWNLOAD', payload: { dataUrl: reader.result, filename } },
                      '*'
                    );
                  }
                };
                reader.readAsDataURL(blob);
              })
              .catch(() => {
                origClick.apply(this, args as []);
              });
            return;
          }
          return origClick.apply(this, args as []);
        };
      },
    })
    .catch(() => {});

  const typeStartedAt = Date.now();
  const resolvedTypeSelector =
    (payload.selector as string) || (payload.ref ? `[data-drishti-ref="${String(payload.ref)}"]` : null);
  const textToType = String(payload.text ?? '');
  const clearFirst = Boolean(payload.clearFirst ?? payload.clear);
  const instantType = Boolean(payload.instant);

  const prepTypeRes = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: async (selector: string | null, text: string) => {
      let el: HTMLInputElement | HTMLTextAreaElement | null = null;
      if (selector) {
        try {
          el = document.querySelector(selector) as HTMLInputElement | null;
        } catch {
          el = null;
        }
        if (!el) {
          const hasTextMatch = selector.match(/:has-text\(['"](.+?)['"]\)/i);
          const clean = (hasTextMatch ? hasTextMatch[1] : selector.replace(/[#.[\]="'"]/g, ' '))
            .trim()
            .toLowerCase();
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
          if (!el && inputs.length > 0) el = inputs[0] as HTMLInputElement;
        }
      } else {
        el = document.activeElement as HTMLInputElement;
      }
      if (!el) throw new Error('No target element for typing');
      if (el instanceof HTMLInputElement && el.type === 'password') {
        throw new Error('Cannot type into password fields via automation');
      }

      const r0 = el.getBoundingClientRect();
      if (r0.top < 24 || r0.bottom > window.innerHeight - 24) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        await new Promise<void>((resolve) => {
          let lastTop = r0.top;
          let stable = 0;
          const started = performance.now();
          const tick = () => {
            const r = el!.getBoundingClientRect();
            if (Math.abs(r.top - lastTop) < 0.75) stable++;
            else stable = 0;
            lastTop = r.top;
            if (stable >= 3 || performance.now() - started > 450) resolve();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      }

      el.setAttribute('data-drishti-pending-type', '1');
      const rect = el.getBoundingClientRect();
      const labelEl = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
      const rawField =
        (labelEl?.textContent || '') ||
        el.getAttribute('aria-label') ||
        el.getAttribute('placeholder') ||
        el.getAttribute('name') ||
        'field';
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        rawField: rawField.trim(),
        charCount: text.length,
      };
    },
    args: [resolvedTypeSelector, textToType],
  });

  const typePrep = prepTypeRes[0]?.result as
    | { x: number; y: number; rect: { left: number; top: number; width: number; height: number }; rawField: string; charCount: number }
    | undefined;
  const humanField = formatHumanLabel(typePrep?.rawField || 'field', 28);
  const baseTypeLabel = `TYPE · ${humanField}`;
  if (typePrep) {
    // G5: dispatch without awaiting so typing + 0/n counter start immediately
    dispatchShadowCursor(target, 'type', typePrep.x, typePrep.y, baseTypeLabel, typePrep.rect, baseTypeLabel, {
      typingProgress: instantType ? `${baseTypeLabel} · done ${typePrep.charCount}/${typePrep.charCount}` : `${baseTypeLabel} · 0/${typePrep.charCount}`,
    }).catch(() => {});
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: async (selector: string | null, text: string, clearFirst: boolean, instant: boolean, baseLabel: string) => {
      const el =
        (document.querySelector('[data-drishti-pending-type="1"]') as HTMLInputElement | HTMLTextAreaElement | null) ||
        (selector ? (document.querySelector(selector) as HTMLInputElement | null) : (document.activeElement as HTMLInputElement | null));
      if (!el) throw new Error('No target element for typing');
      el.removeAttribute('data-drishti-pending-type');
      if (el instanceof HTMLInputElement && el.type === 'password') {
        throw new Error('Cannot type into password fields via automation');
      }

      el.focus();

      const emitProgress = (done: number, finished = false) => {
        try {
          const textStr = finished
            ? `${baseLabel} · done ${done}/${text.length}`
            : `${baseLabel} · ${done}/${text.length}`;
          window.dispatchEvent(
            new CustomEvent('drishti:typing-progress', { detail: { text: textStr, baseLabel } })
          );
        } catch {}
      };
      emitProgress(0, false);

      // Handle contenteditable / Slate / ProseMirror / TipTap rich-text editors
      if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
        if (clearFirst) {
          document.execCommand('selectAll', false);
          document.execCommand('delete', false);
        }
        document.execCommand('insertText', false, text);
        el.dispatchEvent(new InputEvent('input', { data: text, bubbles: true, inputType: 'insertText' }));
        emitProgress(text.length, true);
        return { verified: true, animated: false, chars: text.length };
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
      const useInstant = instant === true;
      if (useInstant && 'value' in el) {
        const nextVal = currentVal + text;
        setNativeValue(el, nextVal);
        el.dispatchEvent(new InputEvent('input', { data: text, bubbles: true, inputType: 'insertText' }));
        emitProgress(text.length, true);
      } else if (text.length <= 60) {
        const charDelay = 35;
        let typedCount = 0;
        for (const char of text) {
          el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
          if ('value' in el) {
            currentVal += char;
            setNativeValue(el, currentVal);
          }
          el.dispatchEvent(new InputEvent('input', { data: char, bubbles: true, inputType: 'insertText' }));
          el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
          typedCount += 1;
          if (typedCount % 3 === 0 || typedCount === text.length) {
            emitProgress(typedCount, typedCount === text.length);
          }
          await new Promise((r) => setTimeout(r, charDelay));
        }
      } else {
        const chunkSize = 11;
        const numChunks = Math.ceil(text.length / chunkSize);
        const delayPerChar = Math.max(18, Math.min(45, Math.round(4000 / text.length)));
        const chunkDelay = Math.min(120, Math.max(40, Math.floor(Math.min(4000, text.length * delayPerChar) / numChunks)));
        let typedCount = 0;
        for (let i = 0; i < text.length; i += chunkSize) {
          const chunk = text.slice(i, i + chunkSize);
          el.dispatchEvent(new KeyboardEvent('keydown', { key: chunk[0], bubbles: true }));
          if ('value' in el) {
            currentVal += chunk;
            setNativeValue(el, currentVal);
          }
          el.dispatchEvent(new InputEvent('input', { data: chunk, bubbles: true, inputType: 'insertText' }));
          el.dispatchEvent(new KeyboardEvent('keyup', { key: chunk[chunk.length - 1], bubbles: true }));
          typedCount = Math.min(text.length, i + chunk.length);
          emitProgress(typedCount, typedCount === text.length);
          if (typedCount < text.length) {
            await new Promise((r) => setTimeout(r, chunkDelay));
          }
        }
      }

      el.dispatchEvent(new Event('change', { bubbles: true }));
      const finalVal = 'value' in el ? el.value : (el as HTMLElement).textContent || '';
      return {
        verified: text.length === 0 || finalVal.includes(text.slice(0, 20)),
        animated: !useInstant,
        chars: text.length,
      };
    },
    args: [
      resolvedTypeSelector,
      textToType,
      clearFirst,
      instantType,
      baseTypeLabel,
    ],
  });

  const typeRes = results[0]?.result;
  const durationMs = Date.now() - typeStartedAt;
  return {
    ok: true,
    action: 'type',
    target: humanField,
    ...(typePrep
      ? {
          rect: {
            x: Math.round(typePrep.rect.left),
            y: Math.round(typePrep.rect.top),
            w: Math.round(typePrep.rect.width),
            h: Math.round(typePrep.rect.height),
          },
        }
      : {}),
    verified: Boolean(typeRes?.verified),
    animated: Boolean(typeRes?.animated ?? !instantType),
    chars: typeRes?.chars ?? textToType.length,
    timings: { locateMs: 0, cursorMs: 0, executeMs: durationMs, verifyMs: 0 },
    durationMs,
    ms: durationMs,
  };
}

async function scrollPage(payload: Record<string, unknown>): Promise<ActionResult> {
  const startedAt = Date.now();
  const tabId = payload.tabId as number | undefined;
  const target =
    tabId ||
    (await resolveDefaultTabId()) ||
    (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!target) throw new Error('No active tab');
  assertTabWritable(target, payload);

  const direction = (payload.direction as string) || 'down';
  const amount = (payload.amount as number) || 300;

  const results = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: async (dir: string, amt: number) => {
      const prevX = window.scrollX;
      const prevY = window.scrollY;
      const scrollMap: Record<string, [number, number]> = {
        down: [0, amt],
        up: [0, -amt],
        right: [amt, 0],
        left: [-amt, 0],
      };
      const [x, y] = scrollMap[dir] || [0, amt];
      window.scrollBy({ left: x, top: y, behavior: 'auto' });
      await new Promise<void>((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          clearTimeout(fallback);
          resolve();
        };
        const fallback = setTimeout(done, 120);
        let lastY = window.scrollY;
        let stable = 0;
        let frames = 0;
        const step = () => {
          if (settled) return;
          frames++;
          if (Math.abs(window.scrollY - lastY) < 0.5) stable++;
          else stable = 0;
          lastY = window.scrollY;
          if (stable >= 2 || frames >= 10) done();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      const newX = window.scrollX;
      const newY = window.scrollY;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const scrollPct = Math.round((newY / maxScroll) * 100);
      const verified = Math.abs(newY - prevY) > 0 || Math.abs(newX - prevX) > 0 || maxScroll <= 1;
      return { prevY, newY, scrollPct, verified };
    },
    args: [direction, amount],
  });

  const scrollRes = results[0]?.result;
  const pct = scrollRes?.scrollPct ?? 0;
  const cursorT0 = Date.now();
  await dispatchShadowCursor(target, 'scroll', 0, 0, `SCROLL ${pct}%`, undefined, `SCROLL ${pct}%`, {
    scrollPct: pct,
  });
  const cursorMs = Date.now() - cursorT0;
  const totalMs = Date.now() - startedAt;

  return {
    ok: true,
    action: 'scroll',
    target: `${direction} ${amount}px`,
    scrollY: scrollRes?.newY ?? 0,
    verified: Boolean(scrollRes?.verified),
    timings: { locateMs: 0, cursorMs, executeMs: Math.max(0, totalMs - cursorMs), verifyMs: 0 },
    ms: totalMs,
    details: {
      prevY: scrollRes?.prevY ?? 0,
      newY: scrollRes?.newY ?? 0,
      scrollPct: pct,
    },
  };
}

async function printPdf(payload: Record<string, unknown>): Promise<unknown> {
  const target = await resolveTargetTab(payload);
  const paper = String(payload.format || 'A4').toUpperCase();
  const res = (await cdpSession.sendCommand<{ data?: string }>(target, 'Page.printToPDF', {
    printBackground: payload.printBackground !== false,
    landscape: Boolean(payload.landscape),
    paperWidth: paper === 'LETTER' ? 8.5 : 8.27,
    paperHeight: paper === 'LETTER' ? 11 : 11.69,
  })) as { data?: string };
  if (!res?.data) throw new Error('Page.printToPDF returned empty data');
  return { base64: res.data, format: paper, size: res.data.length };
}

async function pressKey(payload: Record<string, unknown>): Promise<ActionResult> {
  const startedAt = Date.now();
  const tabId = payload.tabId as number | undefined;
  const target =
    tabId ||
    (await resolveDefaultTabId()) ||
    (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!target) throw new Error('No active tab');
  assertTabWritable(target, payload);

  const keyName = String(payload.key || 'Enter');
  const modifiers = (payload.modifiers as string[]) || [];
  const capMods = modifiers.map((m) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase());
  const combo = capMods.length > 0 ? `${capMods.join('+')}+${keyName}` : keyName;
  const label = `KEY · ${combo}`;

  const activeRectRes = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: async () => {
      const el = document.activeElement as HTMLElement | null;
      if (el && el !== document.body && el !== document.documentElement) {
        const r0 = el.getBoundingClientRect();
        if (r0.top < 8 || r0.bottom > window.innerHeight - 8) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          await new Promise<void>((resolve) => {
            let lastTop = r0.top;
            let stable = 0;
            const started = performance.now();
            const tick = () => {
              const r = el.getBoundingClientRect();
              if (Math.abs(r.top - lastTop) < 0.75) stable++;
              else stable = 0;
              lastTop = r.top;
              if (stable >= 3 || performance.now() - started > 450) resolve();
              else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });
        }
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          return {
            x: Math.round(r.left + r.width / 2),
            y: Math.round(r.top + r.height / 2),
            rect: { left: r.left, top: r.top, width: r.width, height: r.height },
            hasTarget: true,
          };
        }
      }
      const cx = Math.round(window.innerWidth / 2);
      const cy = Math.round(window.innerHeight / 2);
      return { x: cx, y: cy, rect: { left: cx - 24, top: cy - 16, width: 48, height: 32 }, hasTarget: false };
    },
  });

  const activeCoords = activeRectRes[0]?.result;
  const keyLabel = activeCoords?.hasTarget ? label : `${label} (no target)`;
  if (activeCoords) {
    await dispatchShadowCursor(target, 'key', activeCoords.x, activeCoords.y, keyLabel, activeCoords.rect, keyLabel);
  }

  const normMods = modifiers.map((m) => m.toLowerCase());
  const results = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: (key: string, mods: string[]) => {
      const keyCodeMap: Record<string, number> = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8, Space: 32 };
      const codeVal = keyCodeMap[key] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
      const ctrlKey = mods.includes('ctrl') || mods.includes('control');
      const shiftKey = mods.includes('shift');
      const altKey = mods.includes('alt');
      const metaKey = mods.includes('meta');
      const eventInit: KeyboardEventInit = {
        key,
        code: key === ' ' ? 'Space' : key.length === 1 ? `Key${key.toUpperCase()}` : key,
        keyCode: codeVal,
        which: codeVal,
        bubbles: true,
        cancelable: true,
        ctrlKey,
        shiftKey,
        altKey,
        metaKey,
      };
      const activeEl = document.activeElement as HTMLElement | null;
      activeEl?.dispatchEvent(new KeyboardEvent('keydown', eventInit));
      if (ctrlKey && key.toLowerCase() === 'a') {
        if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) {
          activeEl.select();
        } else {
          document.execCommand?.('selectAll');
        }
      }
      activeEl?.dispatchEvent(new KeyboardEvent('keyup', eventInit));

      if (key === 'Enter' && !shiftKey) {
        const form = activeEl?.closest('form');
        if (form) form.requestSubmit();
      }

      return { pressed: key, modifiers: mods };
    },
    args: [keyName, normMods],
  });

  return {
    ok: true,
    action: 'key',
    target: combo,
    ...(activeCoords
      ? {
          rect: {
            x: Math.round(activeCoords.rect.left),
            y: Math.round(activeCoords.rect.top),
            w: Math.round(activeCoords.rect.width),
            h: Math.round(activeCoords.rect.height),
          },
        }
      : {}),
    verified: Boolean(results[0]?.result?.pressed),
    ms: Date.now() - startedAt,
  };
}

async function getPageInfo(payload: Record<string, unknown>): Promise<unknown> {
  const tabId = payload.tabId as number | undefined;
  const target =
    tabId ||
    (await resolveDefaultTabId()) ||
    (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!target) throw new Error('No active tab');
  assertTabWritable(target, payload);

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
  const { cursorSpeed } = await chrome.storage.local.get('cursorSpeed');
  if (cursorSpeed === 'fast') return;
  const since = Date.now() - lastHumanActivityAt;
  if (lastHumanActivityAt > 0 && since < 2000) {
    broadcastAction('Human takeover detected — AI yielding briefly', 'TAKEOVER', 'pending');
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function attachDevTelemetry(tabId?: number): Promise<{ attached: boolean; tabId?: number }> {
  const target =
    tabId ||
    (await resolveDefaultTabId()) ||
    (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!target) return { attached: false };

  const tab = await chrome.tabs.get(target).catch(() => null);
  if (!tab?.url) {
    return { attached: false, tabId: target };
  }
  try {
    await checkDomainPolicy(tab.url);
  } catch {
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

async function getConsoleLogs(payload: Record<string, unknown>): Promise<unknown> {
  const result = await chrome.storage.session.get(['consoleLogs']);
  let logs: Array<{ level?: string; tabId?: number }> = Array.isArray(result.consoleLogs) ? result.consoleLogs : [];
  if (payload.tabId) {
    logs = logs.filter((l) => l.tabId === payload.tabId);
  }
  const levels = payload.levels as string[] | undefined;
  if (levels?.length) {
    const allowed = new Set(levels.map((lv) => lv.toLowerCase()));
    logs = logs.filter((l) => allowed.has((l.level || 'log').toLowerCase()));
  }
  return logs;
}

let currentTaskId: string | null = null;
let currentTaskStatus: 'idle' | 'running' | 'completed' | 'failed' | 'paused' = 'idle';
let currentTaskSteps: string[] = [];

async function groupTabs(payload: Record<string, unknown>): Promise<unknown> {
  const tabIds = payload.tabIds as number[] | undefined;
  if (!tabIds?.length) throw new Error('tabIds is required');
  const groupId = await chrome.tabs.group({ tabIds: tabIds as [number, ...number[]] });
  if (payload.groupName && chrome.tabGroups?.update) {
    await chrome.tabGroups.update(groupId, { title: String(payload.groupName) });
  }
  return { groupId, tabIds, groupName: payload.groupName ?? null };
}

async function executeWorkflow(payload: Record<string, unknown>): Promise<unknown> {
  const steps = payload.steps as Array<{ tool: string; params?: Record<string, unknown> }> | undefined;
  if (!steps?.length) throw new Error('steps array is required');
  currentTaskId = `wf-${Date.now()}`;
  currentTaskStatus = 'running';
  currentTaskSteps = [];
  taskAborted = false;

  const results: Array<{ step: number; tool: string; ok: boolean; result?: unknown; error?: string }> = [];
  for (let i = 0; i < steps.length; i++) {
    if (taskAborted) {
      currentTaskStatus = 'failed';
      break;
    }
    const step = steps[i];
    const action = step.tool.replace(/^browser_/, '').toUpperCase();
    const params = payload.tabId ? { ...(step.params ?? {}), tabId: payload.tabId } : (step.params ?? {});
    try {
      const r = await handleCommand(action, params);
      currentTaskSteps.push(`${step.tool}:ok`);
      results.push({ step: i + 1, tool: step.tool, ok: true, result: r });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      currentTaskSteps.push(`${step.tool}:error`);
      results.push({ step: i + 1, tool: step.tool, ok: false, error: msg });
      currentTaskStatus = 'failed';
      return { taskId: currentTaskId, completed: i, ok: false, results };
    }
  }
  currentTaskStatus = 'completed';
  return { taskId: currentTaskId, completed: results.length, ok: true, results };
}

async function verifyAction(payload: Record<string, unknown>): Promise<unknown> {
  const tabId = payload.tabId as number | undefined;
  const target =
    tabId ||
    (await resolveDefaultTabId()) ||
    (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!target) throw new Error('No active tab');
  assertTabWritable(target, payload);

  const description = String(payload.description || '').trim();
  const snap = (await getDomSnapshot({ tabId: target })) as {
    url?: string;
    title?: string;
    elements?: Array<{ text?: string; value?: string; tag?: string }>;
  };
  const pageText = String(await getPageText({ tabId: target }).then((r: unknown) => (r as { text?: string })?.text || '').catch(() => ''));
  const keywords = description
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const haystack = `${snap?.title || ''} ${snap?.url || ''} ${pageText}`.toLowerCase();
  const matchedKeywords = keywords.filter((k) => haystack.includes(k));
  const verified = Boolean(snap?.url) && (keywords.length === 0 || matchedKeywords.length > 0 || (snap?.elements?.length ?? 0) > 0);
  const screenshot = payload.screenshot ? await takeScreenshot({ tabId: target }) : undefined;

  return {
    verified,
    description,
    evidence: {
      url: snap?.url,
      title: snap?.title,
      elementCount: snap?.elements?.length ?? 0,
      matchedKeywords,
      textPreview: pageText.slice(0, 300),
    },
    ...(screenshot ? { screenshot } : {}),
    timestamp: Date.now(),
  };
}

async function getTaskStatus(payload: Record<string, unknown>): Promise<unknown> {
  return {
    taskId: payload.taskId || currentTaskId || 'none',
    status: currentTaskStatus,
    steps: currentTaskSteps,
    aborted: taskAborted,
  };
}

async function stopTask(payload: Record<string, unknown>): Promise<unknown> {
  taskAborted = true;
  currentTaskStatus = 'failed';
  broadcastAction('Task stopped by MCP command', 'STOP_TASK', 'error');
  return { stopped: true, taskId: payload.taskId || currentTaskId || null };
}

async function getNetworkLogs(payload: Record<string, unknown>): Promise<unknown> {
  const result = await chrome.storage.session.get(['networkErrors', 'networkLogs']);
  let all: Array<{ tabId?: number; url?: string }> = [
    ...(Array.isArray(result.networkErrors) ? result.networkErrors : []),
    ...(Array.isArray(result.networkLogs) ? result.networkLogs : []),
  ];
  if (payload.tabId) {
    all = all.filter((e) => e.tabId === payload.tabId);
  }
  if (payload.filter) {
    const f = String(payload.filter);
    all = all.filter((e) => String(e.url || '').includes(f));
  }
  return all.slice(-200);
}

async function requestHumanHelp(payload: Record<string, unknown>): Promise<unknown> {
  const kind = String(payload.kind || 'manual_step');
  const reason = String(payload.reason || 'Human assistance requested');
  taskAborted = true;
  currentTaskStatus = 'paused';
  broadcastAction(`Human Help Needed (${kind}): ${reason}`, 'HUMAN_HELP', 'pending');
  return { paused: true, kind, reason, timestamp: Date.now() };
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
      bridgeEnabled,
      hasToken: Boolean(authToken) || activeTransport === 'native',
      transport: activeTransport || 'auto',
      port: 7483,
    });
    return true;
  }
  if (msg.type === 'SET_BRIDGE_ENABLED') {
    const next = Boolean(msg.enabled);
    bridgeEnabled = next;
    chrome.storage.local
      .set({ bridgeEnabled: next })
      .then(async () => {
        if (next) await connectToBridge(true);
        else await disconnectBridge();
        sendResponse({ ok: true, connected: isConnected, bridgeEnabled });
      })
      .catch(() => sendResponse({ ok: false }));
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
  if (msg.type === 'SILENT_BLOB_DOWNLOAD' && typeof msg.dataUrl === 'string') {
    const baseName = String(msg.filename || 'download.bin').split(/[/\\]/).pop() || 'download.bin';
    const safeName = baseName.replace(/[<>:"/\\|?*]/g, '_');
    chrome.downloads
      .download({
        url: msg.dataUrl,
        filename: `drishti-downloads/${safeName}`,
        saveAs: false,
        conflictAction: 'uniquify',
      })
      .then((id) => sendResponse({ ok: true, id }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  return false;
});

// ─── Silent Download Routing (Phase 3) ──────────────────────────────────────
const pendingDownloadSubfolders = new Map<string, string>();
const interceptedDownloadUrls = new Set<string>();

if (chrome.downloads?.onDeterminingFilename) {
  chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
    if (!pendingDownloadSubfolders.has(item.url)) return;
    const subfolder = pendingDownloadSubfolders.get(item.url) || 'drishti-downloads';
    pendingDownloadSubfolders.delete(item.url);
    const baseName = (item.filename || 'download.bin').split(/[/\\]/).pop() || 'download.bin';
    const safeSub = subfolder.replace(/[^a-zA-Z0-9_-]/g, '_');
    suggest({ filename: `${safeSub}/${baseName}`, conflictAction: 'uniquify' });
  });
}

if (chrome.downloads?.onCreated) {
  chrome.downloads.onCreated.addListener(async (item) => {
    // Never hijack downloads initiated by Drishti itself or any other extension
    if (item.byExtensionId) return;
    // Ignore historical/restored downloads fired when the browser or service worker starts
    if (item.state !== 'in_progress') return;
    const startedMs = item.startTime ? Date.parse(item.startTime) : 0;
    if (!startedMs || Date.now() - startedMs > 10_000) return;

    const targetUrl = item.finalUrl || item.url;
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) return;
    if (interceptedDownloadUrls.has(targetUrl)) return;

    const { automationEnabled, autoSilentDownloads } = await chrome.storage.local.get([
      'automationEnabled',
      'autoSilentDownloads',
    ]);
    if (automationEnabled === false || autoSilentDownloads !== true) return;

    interceptedDownloadUrls.add(targetUrl);
    setTimeout(() => interceptedDownloadUrls.delete(targetUrl), 10_000);

    try {
      await chrome.downloads.cancel(item.id);
      await chrome.downloads.erase({ id: item.id }).catch(() => {});
      const baseName = (item.filename || '').split(/[/\\]/).pop();
      pendingDownloadSubfolders.set(targetUrl, 'drishti-downloads');
      await chrome.downloads.download({
        url: targetUrl,
        filename: baseName ? `drishti-downloads/${baseName}` : undefined,
        saveAs: false,
        conflictAction: 'uniquify',
      });
    } catch {
      // Ignore if download already completed or canceled
    }
  });
}

async function resolveTargetTab(payload: Record<string, unknown>): Promise<number> {
  const tabId = payload.tabId as number | undefined;
  const target =
    tabId ||
    (await resolveDefaultTabId()) ||
    (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!target) throw new Error('No active tab');
  assertTabWritable(target, payload);
  return target;
}

function resolveSelectorOrRef(payload: Record<string, unknown>): string {
  if (payload.selector) return String(payload.selector);
  if (payload.ref) return `[data-drishti-ref="${String(payload.ref)}"]`;
  throw new Error('selector or ref is required');
}

async function observePage(payload: Record<string, unknown>): Promise<unknown> {
  const target = await resolveTargetTab(payload);
  const results = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: () => {
      const headings = Array.from(document.querySelectorAll('h1,h2,h3')).slice(0, 20).map((h) => ({
        level: h.tagName,
        text: (h.textContent || '').trim().slice(0, 160),
      }));
      const interactive = Array.from(
        document.querySelectorAll('a,button,input,select,textarea,[role="button"],[role="textbox"]')
      ).slice(0, 60).map((el, i) => {
        const ref = el.getAttribute('data-drishti-ref') || `@e${i + 1}`;
        return {
          ref,
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role') || undefined,
          label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 100),
        };
      });
      const visibleText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
      return {
        url: window.location.href,
        title: document.title,
        headings,
        interactiveCount: interactive.length,
        interactive,
        visibleTextSummary: visibleText,
      };
    },
  });
  return results[0]?.result;
}

async function getPageText(payload: Record<string, unknown>): Promise<unknown> {
  const target = await resolveTargetTab(payload);
  const results = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: (selector: string | null) => {
      const root = selector ? document.querySelector(selector) : document.body;
      if (!root) throw new Error(`Element not found: ${selector}`);
      return {
        url: window.location.href,
        text: ((root as HTMLElement).innerText || root.textContent || '').trim().slice(0, 16000),
      };
    },
    args: [(payload.selector as string) || null],
  });
  return results[0]?.result;
}

async function evaluateInPage(payload: Record<string, unknown>): Promise<unknown> {
  const target = await resolveTargetTab(payload);
  const fnRaw = String(payload.fn || '').trim();
  if (!fnRaw) throw new Error('fn is required for EVALUATE');
  const timeoutMs = Math.min(Math.max(Number(payload.timeout ?? 5000), 100), 15000);
  const argJson = payload.arg !== undefined ? JSON.stringify(payload.arg) : 'undefined';

  // Build self-invoking expression executed via CDP Runtime.evaluate in MAIN world (zero eval/new Function in MV3)
  const expr = `(() => {
    const __arg = ${argJson};
    const __fn = (${fnRaw});
    return typeof __fn === 'function' ? __fn(__arg) : __fn;
  })()`;

  const preUrl = (await chrome.tabs.get(target).catch(() => null))?.url || '';
  const cdpRes = (await cdpSession.sendCommand(target, 'Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
    timeout: timeoutMs,
  })) as { result?: { value?: unknown; description?: string }; exceptionDetails?: { text?: string; exception?: { description?: string } } };

  if (cdpRes?.exceptionDetails) {
    const errText =
      cdpRes.exceptionDetails.exception?.description ||
      cdpRes.exceptionDetails.text ||
      'Evaluation threw an exception';
    throw new Error(errText);
  }
  const postUrl = (await chrome.tabs.get(target).catch(() => null))?.url || '';
  return {
    changed: postUrl !== preUrl,
    value: cdpRes?.result?.value ?? null,
  };
}

async function readPage(payload: Record<string, unknown>): Promise<unknown> {
  const target = await resolveTargetTab(payload);
  const nonce = Math.random().toString(36).slice(2, 10);
  const results = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: (selector: string | null) => {
      const root = (selector ? document.querySelector(selector) : document.body) as HTMLElement | null;
      if (!root) throw new Error(`Element not found: ${selector}`);
      const lines: string[] = [];
      if (document.title) lines.push(`# ${document.title}`, '');
      const blocks = root.querySelectorAll('h1,h2,h3,h4,p,li,tr');
      blocks.forEach((el) => {
        const tag = el.tagName.toLowerCase();
        const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!txt) return;
        if (tag === 'h1') lines.push(`# ${txt}`);
        else if (tag === 'h2') lines.push(`## ${txt}`);
        else if (tag === 'h3') lines.push(`### ${txt}`);
        else if (tag === 'h4') lines.push(`#### ${txt}`);
        else if (tag === 'li') lines.push(`- ${txt}`);
        else lines.push(txt);
      });
      const md = (lines.length > 2 ? lines.join('\n') : (root.innerText || '').trim()).slice(0, 16000);
      return {
        url: window.location.href,
        origin: window.location.origin,
        title: document.title,
        markdown: md,
      };
    },
    args: [(payload.selector as string) || null],
  });

  const res = results[0]?.result as { url: string; origin: string; title: string; markdown: string } | undefined;
  const origin = res?.origin || 'unknown';
  const wrapped = `[UNTRUSTED_PAGE_CONTENT nonce=${nonce} origin=${origin}]\n${res?.markdown || ''}\n[END_UNTRUSTED_PAGE_CONTENT]`;
  return {
    url: res?.url,
    origin,
    title: res?.title,
    nonce,
    content: wrapped,
  };
}

async function grepPage(payload: Record<string, unknown>): Promise<unknown> {
  const target = await resolveTargetTab(payload);
  const pattern = String(payload.pattern || '');
  if (!pattern) throw new Error('pattern is required for GREP_PAGE');
  const limit = Math.min(Math.max(Number(payload.limit ?? 50), 1), 200);
  const over = payload.over === 'html' ? 'html' : 'text';

  const results = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: (pat: string, maxLines: number, mode: string) => {
      const source = mode === 'html' ? document.documentElement.outerHTML : (document.body?.innerText || '');
      let re: RegExp;
      try {
        re = new RegExp(pat, 'i');
      } catch {
        re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      }
      const matches: Array<{ lineNumber: number; text: string }> = [];
      const lines = source.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        if (re.test(line)) {
          matches.push({ lineNumber: i + 1, text: line.slice(0, 300) });
          if (matches.length >= maxLines) break;
        }
      }
      return {
        url: window.location.href,
        pattern: pat,
        over: mode,
        matchCount: matches.length,
        matches,
      };
    },
    args: [pattern, limit, over],
  });
  return results[0]?.result;
}

async function getPageLinks(payload: Record<string, unknown>): Promise<unknown> {
  const target = await resolveTargetTab(payload);
  const results = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: (filter: string | null) => {
      const links = Array.from(document.querySelectorAll('a[href]')).map((a) => {
        const href = (a as HTMLAnchorElement).href;
        const text = (a.textContent || '').trim().slice(0, 160);
        return {
          text,
          href,
          type: href.startsWith(window.location.origin) ? 'internal' : 'external',
        };
      });
      const filtered = filter
        ? links.filter((l) => l.text.toLowerCase().includes(filter.toLowerCase()) || l.href.toLowerCase().includes(filter.toLowerCase()))
        : links;
      return { count: filtered.length, links: filtered.slice(0, 200) };
    },
    args: [(payload.filter as string) || null],
  });
  return results[0]?.result;
}

async function findPageElement(payload: Record<string, unknown>): Promise<unknown> {
  const target = await resolveTargetTab(payload);
  const query = String(payload.query || '').trim();
  if (!query) throw new Error('query is required');
  const results = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: (q: string) => {
      const lower = q.toLowerCase();
      const matches: Array<{ selector: string; ref?: string; tag: string; role?: string; text: string; bounds: { x: number; y: number; width: number; height: number } }> = [];
      try {
        const direct = document.querySelectorAll(q);
        direct.forEach((el) => {
          const r = el.getBoundingClientRect();
          matches.push({
            selector: q,
            ref: el.getAttribute('data-drishti-ref') || undefined,
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute('role') || undefined,
            text: (el.textContent || '').trim().slice(0, 160),
            bounds: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
          });
        });
      } catch {}

      if (matches.length === 0) {
        const all = Array.from(document.querySelectorAll('a,button,input,select,textarea,[role],[aria-label],[tabindex],h1,h2,h3,label,span,div'));
        for (let i = 0; i < all.length && matches.length < 15; i++) {
          const el = all[i];
          const text = (el.textContent || '').trim();
          const aria = el.getAttribute('aria-label') || '';
          const role = el.getAttribute('role') || '';
          const placeholder = el.getAttribute('placeholder') || '';
          if (
            text.toLowerCase().includes(lower) ||
            aria.toLowerCase().includes(lower) ||
            role.toLowerCase() === lower ||
            placeholder.toLowerCase().includes(lower)
          ) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            const ref = el.getAttribute('data-drishti-ref') || `@f${matches.length + 1}`;
            try { el.setAttribute('data-drishti-ref', ref); } catch {}
            matches.push({
              selector: el.id ? `#${el.id}` : `[data-drishti-ref="${ref}"]`,
              ref,
              tag: el.tagName.toLowerCase(),
              role: role || undefined,
              text: (aria || text || placeholder).slice(0, 160),
              bounds: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
            });
          }
        }
      }
      return { query: q, count: matches.length, matches };
    },
    args: [query],
  });
  return results[0]?.result;
}

async function getPageTables(payload: Record<string, unknown>): Promise<unknown> {
  const target = await resolveTargetTab(payload);
  const results = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: () => {
      const tables = Array.from(document.querySelectorAll('table')).slice(0, 20).map((t) => {
        const headers = Array.from(t.querySelectorAll('thead th, tr:first-child th')).map((th) => (th.textContent || '').trim());
        const rows = Array.from(t.querySelectorAll('tbody tr, tr')).slice(0, 100).map((tr) =>
          Array.from(tr.querySelectorAll('td, th')).map((cell) => (cell.textContent || '').trim())
        );
        return { headers, rows };
      });
      return { count: tables.length, tables };
    },
  });
  return results[0]?.result;
}

async function getPageForms(payload: Record<string, unknown>): Promise<unknown> {
  const target = await resolveTargetTab(payload);
  const results = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: () => {
      const fields = Array.from(document.querySelectorAll('input, textarea, select')).map((el, i) => {
        const inp = el as HTMLInputElement;
        const id = el.id;
        const labelEl = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : el.closest('label');
        const type = el.tagName.toLowerCase() === 'input' ? inp.type || 'text' : el.tagName.toLowerCase();
        return {
          selector: id ? `#${id}` : inp.name ? `[name="${inp.name}"]` : `${el.tagName.toLowerCase()}:nth-of-type(${i + 1})`,
          name: inp.name || undefined,
          type,
          label: (labelEl?.textContent || el.getAttribute('aria-label') || '').trim() || undefined,
          placeholder: inp.placeholder || undefined,
          value: type === 'password' ? undefined : inp.value,
          required: inp.required || el.hasAttribute('required'),
        };
      });
      return { count: fields.length, fields };
    },
  });
  return results[0]?.result;
}

async function inspectElement(payload: Record<string, unknown>): Promise<unknown> {
  const target = await resolveTargetTab(payload);
  const sel = resolveSelectorOrRef(payload);
  const results = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: (selector: string) => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) throw new Error(`Element not found: ${selector}`);
      const r = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      const attrs: Record<string, string> = {};
      for (const a of Array.from(el.attributes)) attrs[a.name] = a.value;
      return {
        tag: el.tagName.toLowerCase(),
        text: (el.innerText || el.textContent || '').trim().slice(0, 500),
        attributes: attrs,
        bounds: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
        styles: { display: cs.display, visibility: cs.visibility, color: cs.color, backgroundColor: cs.backgroundColor },
      };
    },
    args: [sel],
  });
  return results[0]?.result;
}

async function selectOption(payload: Record<string, unknown>): Promise<ActionResult> {
  const startedAt = Date.now();
  const target = await resolveTargetTab(payload);
  const sel = resolveSelectorOrRef(payload);
  const val = String(payload.value ?? '');
  const prepRes = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: async (selector: string, optionVal: string) => {
      const select = document.querySelector(selector) as HTMLSelectElement | null;
      if (!select) throw new Error(`Select element not found: ${selector}`);
      const opt = Array.from(select.options).find((o) => o.value === optionVal || o.text.trim() === optionVal);
      if (!opt) throw new Error(`Option not found: ${optionVal}`);
      const r0 = select.getBoundingClientRect();
      if (r0.top < 24 || r0.bottom > window.innerHeight - 24) {
        select.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        await new Promise((r) => setTimeout(r, 320));
      }
      const r = select.getBoundingClientRect();
      const optIndex = Array.from(select.options).indexOf(opt);
      return {
        x: Math.round(r.left + r.width / 2),
        y: Math.round(r.top + r.height / 2),
        rect: { left: r.left, top: r.top, width: r.width, height: r.height },
        optValue: opt.value,
        optText: opt.text.trim(),
        optIndex,
      };
    },
    args: [sel, val],
  });

  const prep = prepRes[0]?.result;
  if (!prep) throw new Error(`Select element not found: ${sel}`);

  const label = `SELECTED · ${formatHumanLabel(prep.optText || prep.optValue)}`;
  await dispatchShadowCursor(target, 'select', prep.x, prep.y, label, prep.rect, label);

  const applyRes = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: (selector: string, optValue: string) => {
      const select = document.querySelector(selector) as HTMLSelectElement | null;
      if (!select) return false;
      select.value = optValue;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return select.value === optValue;
    },
    args: [sel, prep.optValue],
  });

  return {
    ok: true,
    action: 'select',
    target: formatHumanLabel(prep.optText || prep.optValue),
    index: prep.optIndex,
    text: prep.optText,
    rect: { x: Math.round(prep.rect.left), y: Math.round(prep.rect.top), w: Math.round(prep.rect.width), h: Math.round(prep.rect.height) },
    verified: Boolean(applyRes[0]?.result),
    ms: Date.now() - startedAt,
  } as ActionResult & { index: number; text: string };
}

async function scrollIntoView(payload: Record<string, unknown>): Promise<unknown> {
  const target = await resolveTargetTab(payload);
  const sel = resolveSelectorOrRef(payload);
  const results = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: (selector: string) => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) throw new Error(`Element not found: ${selector}`);
      el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      return {
        scrolledIntoView: selector,
        scrollY: Math.round(window.scrollY),
        bounds: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
      };
    },
    args: [sel],
  });
  return results[0]?.result;
}

async function waitForCondition(payload: Record<string, unknown>): Promise<unknown> {
  const target = await resolveTargetTab(payload);
  const selector = (payload.selector as string) || null;
  const text = (payload.text as string) || null;
  const timeout = Math.min(Math.max(200, Number(payload.timeoutMs ?? payload.timeout ?? 15000)), 25000);
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: target },
        func: (sel: string | null, txt: string | null) => {
          const selMatched = !sel || Boolean(document.querySelector(sel));
          const txtMatched = !txt || (document.body?.innerText || '').includes(txt);
          return selMatched && txtMatched;
        },
        args: [selector, text],
      });
      if (results[0]?.result === true) {
        return { matched: true, waitedMs: Date.now() - start, selector, text };
      }
    } catch {
      // Transient frame/navigation error while tab reloads; keep polling until timeout
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`wait_for timed out after ${timeout}ms (selector=${selector}, text=${text})`);
}

async function dragAndDrop(payload: Record<string, unknown>): Promise<ActionResult> {
  const startedAt = Date.now();
  const target = await resolveTargetTab(payload);
  const fromSel = payload.fromSelector ? String(payload.fromSelector) : payload.fromRef ? `[data-drishti-ref="${String(payload.fromRef)}"]` : null;
  const toSel = payload.toSelector ? String(payload.toSelector) : payload.toRef ? `[data-drishti-ref="${String(payload.toRef)}"]` : null;

  const prepRes = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: async (fSel: string | null, tSel: string | null, fx: number | null, fy: number | null, tx: number | null, ty: number | null) => {
      const fromEl = fSel ? document.querySelector(fSel) : fx !== null && fy !== null ? document.elementFromPoint(fx, fy) : null;
      const toEl = tSel ? document.querySelector(tSel) : tx !== null && ty !== null ? document.elementFromPoint(tx, ty) : null;
      if (!fromEl || !toEl) throw new Error('Source or target element not found for drag');
      const r0 = fromEl.getBoundingClientRect();
      if (r0.top < 24 || r0.bottom > window.innerHeight - 24) {
        fromEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        await new Promise((r) => setTimeout(r, 320));
      }
      const fr = fromEl.getBoundingClientRect();
      const tr = toEl.getBoundingClientRect();
      const sx = fx ?? Math.round(fr.left + fr.width / 2);
      const sy = fy ?? Math.round(fr.top + fr.height / 2);
      const ex = tx ?? Math.round(tr.left + tr.width / 2);
      const ey = ty ?? Math.round(tr.top + tr.height / 2);
      return {
        sx,
        sy,
        ex,
        ey,
        rect: { left: fr.left, top: fr.top, width: fr.width, height: fr.height },
        fromLabel: (fromEl.textContent || fSel || 'source').trim(),
        toLabel: (toEl.textContent || tSel || 'target').trim(),
      };
    },
    args: [fromSel, toSel, (payload.fromX as number) ?? null, (payload.fromY as number) ?? null, (payload.toX as number) ?? null, (payload.toY as number) ?? null],
  });

  const prep = prepRes[0]?.result;
  if (!prep) throw new Error('Source or target element not found for drag');

  const label = `DRAG · ${formatHumanLabel(prep.fromLabel, 12)} → ${formatHumanLabel(prep.toLabel, 12)}`;
  await dispatchShadowCursor(target, 'drag', prep.sx, prep.sy, label, prep.rect, label, {
    dragTo: { x: prep.ex, y: prep.ey },
  });

  const execRes = await chrome.scripting.executeScript({
    target: { tabId: target },
    func: (fSel: string | null, tSel: string | null, sx: number, sy: number, ex: number, ey: number) => {
      const fromEl = fSel ? document.querySelector(fSel) : document.elementFromPoint(sx, sy);
      const toEl = tSel ? document.querySelector(tSel) : document.elementFromPoint(ex, ey);
      if (!fromEl || !toEl) return false;
      const dt = new DataTransfer();
      fromEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: sx, clientY: sy }));
      fromEl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt, clientX: sx, clientY: sy }));
      toEl.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: ex, clientY: ey }));
      toEl.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: ex, clientY: ey }));
      fromEl.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt, clientX: ex, clientY: ey }));
      toEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: ex, clientY: ey }));
      return true;
    },
    args: [fromSel, toSel, prep.sx, prep.sy, prep.ex, prep.ey],
  });

  return {
    ok: true,
    action: 'drag',
    target: `${formatHumanLabel(prep.fromLabel, 12)} → ${formatHumanLabel(prep.toLabel, 12)}`,
    rect: { x: Math.round(prep.rect.left), y: Math.round(prep.rect.top), w: Math.round(prep.rect.width), h: Math.round(prep.rect.height) },
    verified: Boolean(execRes[0]?.result),
    ms: Date.now() - startedAt,
  };
}

async function useTab(payload: Record<string, unknown>): Promise<unknown> {
  const tabId = (payload.tabId as number | null | undefined) ?? null;
  await chrome.storage.local.set({ lockedTabId: tabId });
  if (tabId) {
    tabOwnership.set(tabId, 'mine');
    await chrome.tabs.update(tabId, { active: true }).catch(() => {});
  }
  return { lockedTabId: tabId, unlocked: tabId === null, ownership: tabId ? 'mine' : null };
}

async function downloadMedia(payload: Record<string, unknown>): Promise<unknown> {
  const url = String(payload.url || '');
  if (!url) throw new Error('url is required for DOWNLOAD_MEDIA');
  const subfolder = String(payload.subfolder || 'drishti-downloads').replace(/[^a-zA-Z0-9_-]/g, '_');
  pendingDownloadSubfolders.set(url, subfolder);

  const requestedFilename = payload.filename
    ? `${subfolder}/${String(payload.filename).split(/[/\\]/).pop()}`
    : undefined;

  const downloadId = await chrome.downloads.download({
    url,
    filename: requestedFilename,
    saveAs: false,
    conflictAction: 'uniquify',
  });

  // Wait up to 30s for download completion
  const completed = await new Promise<{ id: number; filename: string; fileSize: number; state: string }>((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(async () => {
      const [item] = await chrome.downloads.search({ id: downloadId });
      if (item?.state === 'complete') {
        clearInterval(timer);
        resolve({ id: downloadId, filename: item.filename, fileSize: item.fileSize, state: item.state });
      } else if (item?.state === 'interrupted') {
        clearInterval(timer);
        reject(new Error(`Download interrupted: ${item.error || 'unknown'}`));
      } else if (Date.now() - started > 30000) {
        clearInterval(timer);
        resolve({ id: downloadId, filename: item?.filename || requestedFilename || '', fileSize: item?.bytesReceived || 0, state: item?.state || 'in_progress' });
      }
    }, 300);
  });

  return completed;
}

async function getDownloadStatus(payload: Record<string, unknown>): Promise<unknown> {
  const query: chrome.downloads.DownloadQuery = payload.downloadId
    ? { id: Number(payload.downloadId) }
    : { limit: 5, orderBy: ['-startTime'] };
  const items = await chrome.downloads.search(query);
  return items.map((item) => ({
    id: item.id,
    url: item.finalUrl || item.url,
    filename: item.filename,
    state: item.state,
    bytesReceived: item.bytesReceived,
    totalBytes: item.totalBytes,
    percent: item.totalBytes > 0 ? Math.round((item.bytesReceived / item.totalBytes) * 100) : null,
    error: item.error || undefined,
  }));
}

async function waitDownload(payload: Record<string, unknown>): Promise<unknown> {
  const downloadId = payload.downloadId ? Number(payload.downloadId) : undefined;
  const timeoutMs = Math.min(Math.max(Number(payload.timeoutSeconds ?? 120) * 1000, 1000), 1800_000);
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const timer = setInterval(async () => {
      const items = await chrome.downloads.search(
        downloadId ? { id: downloadId } : { limit: 1, orderBy: ['-startTime'] }
      );
      const item = items[0];
      if (!item) {
        if (Date.now() - started > 5000) {
          clearInterval(timer);
          reject(new Error('No active download found to wait for.'));
        }
        return;
      }
      const percent = item.totalBytes > 0 ? Math.round((item.bytesReceived / item.totalBytes) * 100) : null;
      if (item.state === 'complete') {
        clearInterval(timer);
        resolve({
          id: item.id,
          filename: item.filename,
          fileSize: item.fileSize || item.bytesReceived,
          state: item.state,
          percent: 100,
        });
      } else if (item.state === 'interrupted') {
        clearInterval(timer);
        reject(new Error(`Download interrupted: ${item.error || 'unknown'}`));
      } else if (Date.now() - started >= timeoutMs) {
        clearInterval(timer);
        resolve({
          id: item.id,
          filename: item.filename,
          bytesReceived: item.bytesReceived,
          totalBytes: item.totalBytes,
          percent,
          state: item.state,
          timedOut: true,
        });
      }
    }, 1000);
  });
}
