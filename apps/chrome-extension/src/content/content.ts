// Content script for Sudhir Browser AI
// Injected into web pages to capture console/error logs and assist with DOM discovery

const logs: Array<{ level: string; message: string; timestamp: number }> = [];
const MAX_LOGS = 100;

// Intercept window console
const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
};

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

  logs.push({ level, message, timestamp: Date.now() });
  if (logs.length > MAX_LOGS) {
    logs.shift();
  }

  // Persist batch into extension session storage if supported
  try {
    if (chrome?.storage?.session) {
      chrome.storage.session.set({ consoleLogs: logs }).catch(() => {});
    }
  } catch {
    // Ignore context invalidation
  }
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

// Listen for messages from background/popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PING_CONTENT_SCRIPT') {
    sendResponse({ status: 'ok', url: window.location.href, title: document.title });
    return true;
  }
  if (message.type === 'GET_IN_PAGE_LOGS') {
    sendResponse({ logs });
    return true;
  }
  return false;
});
