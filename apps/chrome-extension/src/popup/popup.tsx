import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Globe,
  Radio,
  RefreshCw,
  Settings,
  PanelRightOpen,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Cpu,
  Layers,
  Sparkles,
  CheckCircle2,
  Copy,
  Power,
  Crosshair,
} from 'lucide-react';
import '../styles.css';

export function PopupApp() {
  const [connected, setConnected] = useState<boolean>(false);
  const [automationEnabled, setAutomationEnabled] = useState<boolean>(true);
  const [lockedTabId, setLockedTabId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<{ id?: number; title?: string; url?: string; favIconUrl?: string }>({});
  const [tabCount, setTabCount] = useState<number>(0);
  const [tokenConfigured, setTokenConfigured] = useState<boolean>(false);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const [automationMode, setAutomationMode] = useState<string>('AUTO');
  const [copiedNotification, setCopiedNotification] = useState<boolean>(false);
  const [copiedPromptToast, setCopiedPromptToast] = useState<boolean>(false);

  const toggleAutomation = () => {
    const next = !automationEnabled;
    setAutomationEnabled(next);
    chrome.storage.local.set({ automationEnabled: next });
    chrome.runtime.sendMessage({ type: 'SET_AUTOMATION_ENABLED', enabled: next }).catch(() => {});
  };

  const handleCopyAIPrompt = () => {
    chrome.storage.local.get(['bridgeAuthToken', 'bridgeWsPort'], (res) => {
      const token = res.bridgeAuthToken || '';
      const port = res.bridgeWsPort || 7483;
      const promptText = `<SYSTEM_INSTRUCTION>
You are an expert AI Browser Automation Agent empowered to inspect, navigate, and control the user's live browser via the Drishti Browser AI Model Context Protocol (MCP) server.

## 1. PLATFORM TOPOLOGY
- Local MCP Server: <path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js
- WebSocket Bridge: ws://127.0.0.1:${port}
- Bridge Auth Token: ${token}
- Chrome Extension: Drishti Browser AI (v0.1.2 PRO)
- Mode: Mode A (Daily Chrome profile with user's real sessions, cookies & logins)

## 2. MCP CONFIGURATION
Add to your MCP settings (Antigravity, Claude ~/.claude/mcp.json, Cursor MCP Settings):
{
  "mcpServers": {
    "drishti-browser-ai": {
      "command": "node",
      "args": ["<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"],
      "env": {
        "BRIDGE_AUTH_TOKEN": "${token || 'YOUR_AUTH_TOKEN'}",
        "BRIDGE_WS_URL": "ws://127.0.0.1:${port}"
      }
    }
  }
}

## 0. FIRST-TIME TOKEN & SETUP (IF YOUR_AUTH_TOKEN)
If BRIDGE_AUTH_TOKEN is "YOUR_AUTH_TOKEN":
1. Generate a secure 64-character hex token via: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
2. Save it to .drishti-token in the repo root, configure MCP with that token, and start the bridge on-demand (never install OS auto-start scripts).
3. Print the generated token and guide the user step-by-step:
   - Open chrome://extensions/ -> Developer mode -> Load unpacked -> select apps/chrome-extension/dist
   - Open Drishti Settings -> Connection & Bridge -> paste token -> Save Changes -> Run Ping.

## 3. HOW TO EXECUTE USER TASKS
When the user gives you any browser task:
1. Call browser_status() to verify connection and active tab.
2. Call browser_navigate({ url: "https://..." }) to open the target website.
3. Call browser_observe() or browser_snapshot() to locate interactive buttons and input fields.
4. Call browser_type({ selector: "...", text: "..." }) or browser_click({ selector: "..." }).
5. Call browser_screenshot() to visually verify results.
6. Call browser_get_text() or browser_get_tables() to extract data and present a comprehensive final report.

## 4. SAFETY RULES
- Never read or extract values from type="password" fields.
- Always ask user confirmation before submitting financial checkouts or payments.
</SYSTEM_INSTRUCTION>`;
      navigator.clipboard.writeText(promptText);
      setCopiedPromptToast(true);
      setTimeout(() => setCopiedPromptToast(false), 2500);
    });
  };

  useEffect(() => {
    chrome.storage.local.get(['bridgeConnected', 'bridgeAuthToken', 'automationMode', 'automationEnabled', 'lockedTabId'], (res) => {
      setConnected(!!res.bridgeConnected);
      setTokenConfigured(!!res.bridgeAuthToken);
      if (res.automationMode) setAutomationMode(res.automationMode.toUpperCase());
      if (res.automationEnabled !== undefined) setAutomationEnabled(!!res.automationEnabled);
      if (res.lockedTabId) setLockedTabId(res.lockedTabId);
    });

    // Query active status directly from background service worker
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
      if (res) {
        setConnected(!!res.connected);
        if (res.hasToken) setTokenConfigured(true);
      }
    });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        setActiveTab({
          id: tabs[0].id,
          title: tabs[0].title,
          url: tabs[0].url,
          favIconUrl: tabs[0].favIconUrl,
        });
      }
    });

    chrome.tabs.query({}, (tabs) => {
      setTabCount(tabs.length);
    });

    const listener = (msg: { type: string; connected?: boolean }) => {
      if (msg.type === 'CONNECTION_STATUS') {
        setConnected(!!msg.connected);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    const storageListener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === 'local') {
        if (changes.automationEnabled !== undefined) {
          setAutomationEnabled(!!changes.automationEnabled.newValue);
        }
        if (changes.lockedTabId !== undefined) {
          setLockedTabId(changes.lockedTabId.newValue || null);
        }
      }
    };
    chrome.storage.onChanged.addListener(storageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      chrome.storage.onChanged.removeListener(storageListener);
    };
  }, []);

  const handleOpenSidePanel = () => {
    chrome.windows.getCurrent((window) => {
      if (window.id && (chrome as any).sidePanel?.open) {
        (chrome as any).sidePanel.open({ windowId: window.id });
      } else {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/sidepanel/sidepanel.html') });
      }
    });
  };

  const handleOpenSettings = () => {
    chrome.runtime.openOptionsPage();
  };

  const handleReconnect = () => {
    setIsReconnecting(true);
    chrome.runtime.sendMessage({ type: 'TEST_CONNECTION' }, (res) => {
      setIsReconnecting(false);
      if (res && res.success) {
        setConnected(true);
        setTokenConfigured(true);
      } else {
        setConnected(false);
      }
    });
  };

  const handleCopyStatus = () => {
    const statusText = `Bridge: ${connected ? 'CONNECTED' : 'DISCONNECTED'} | Port: 7483 | Tabs: ${tabCount} | Active: ${activeTab.url || 'none'}`;
    navigator.clipboard.writeText(statusText);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
  };

  return (
    <div className="w-[360px] bg-[#070b14] text-slate-100 font-sans p-4 select-none border border-slate-800/90 shadow-[0_20px_50px_rgba(0,0,0,0.85)] rounded-2xl relative overflow-hidden backdrop-blur-xl">
      {/* Decorative ambient gradient glow */}
      <div className="absolute -top-12 -right-12 w-36 h-36 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-slate-800/80 relative">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 p-[1.5px] shadow-[0_0_20px_rgba(56,189,248,0.35)] flex items-center justify-center">
            <div className="w-full h-full bg-[#080d19] rounded-[10px] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-extrabold text-sm tracking-tight text-white">Drishti Browser AI</h1>
              <span className="text-[9px] font-black tracking-wider uppercase px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Universal Multi-Agent Gateway (दृष्टि)</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Master AI Toggle */}
          <button
            onClick={toggleAutomation}
            className={`btn-tactile flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border transition ${
              automationEnabled
                ? 'bg-blue-950/70 border-blue-500/50 text-blue-300 hover:bg-blue-900/60 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                : 'bg-amber-950/70 border-amber-500/50 text-amber-300 hover:bg-amber-900/60'
            }`}
            title={automationEnabled ? 'AI Automation Active (Click to Pause)' : 'AI Automation Paused (Click to Enable)'}
          >
            <Power className={`w-2.5 h-2.5 ${automationEnabled ? 'text-blue-400' : 'text-amber-400'}`} />
            <span>{automationEnabled ? 'AI ON' : 'PAUSED'}</span>
          </button>

          {/* Live Status Pill */}
          <div
            onClick={handleReconnect}
            className={`btn-tactile group flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all duration-300 cursor-pointer shadow-sm ${
              connected
                ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/80 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                : 'bg-rose-950/70 border-rose-500/50 text-rose-300 hover:bg-rose-900/80 shadow-[0_0_12px_rgba(244,63,94,0.2)]'
            }`}
            title="Click to ping/reconnect bridge"
          >
            <span className="relative flex h-2 w-2">
              {connected && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  connected ? 'bg-emerald-400' : 'bg-rose-500'
                }`}
              />
            </span>
            <span className="tracking-wide">{connected ? 'MCP ONLINE' : 'OFFLINE'}</span>
          </div>
        </div>
      </div>

      {/* Warning Card if Token Missing */}
      {!tokenConfigured && (
        <div className="mb-3.5 p-3 rounded-xl bg-gradient-to-r from-amber-950/60 to-amber-900/40 border border-amber-500/40 text-amber-200 text-xs shadow-lg animate-in fade-in duration-300">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-amber-300">Auth Token Required</div>
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                Connect your AI agent securely by configuring the bridge auth token.
              </p>
              <button
                onClick={handleOpenSettings}
                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-300 hover:text-white underline underline-offset-2 pt-0.5 transition"
              >
                <span>Configure in Settings</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Tab Spotlight Card */}
      <div className="mb-3.5 p-3 rounded-xl bg-slate-900/70 border border-slate-800/80 hover:border-slate-700/80 transition-all duration-200 shadow-inner group">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Globe className="w-3 h-3 text-blue-400" />
            {lockedTabId ? 'Locked Target Tab' : 'Target Active Tab'}
          </span>
          {lockedTabId ? (
            <span className="text-[10px] font-semibold text-cyan-300 flex items-center gap-1 bg-cyan-950/70 px-1.5 py-0.5 rounded border border-cyan-500/40">
              <Crosshair className="w-2.5 h-2.5 animate-pulse text-cyan-400" /> Target Locked
            </span>
          ) : activeTab.url ? (
            <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
              <Radio className="w-2.5 h-2.5 animate-pulse" /> Attached
            </span>
          ) : null}
        </div>
        <div className="font-semibold text-xs text-white truncate group-hover:text-cyan-300 transition-colors">
          {activeTab.title || 'No browser tab focused'}
        </div>
        <div className="text-[11px] text-slate-400 truncate mt-0.5 font-mono flex items-center gap-1">
          <span className="truncate">{activeTab.url || 'chrome://newtab'}</span>
        </div>
      </div>

      {/* Metrics Row (3 Cards) */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800/80 text-center hover:border-slate-700 transition">
          <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center justify-center gap-1 mb-0.5">
            <Layers className="w-2.5 h-2.5 text-blue-400" /> Tabs
          </div>
          <div className="text-base font-extrabold text-blue-400 tracking-tight">{tabCount}</div>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800/80 text-center hover:border-slate-700 transition">
          <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center justify-center gap-1 mb-0.5">
            <Cpu className="w-2.5 h-2.5 text-indigo-400" /> Port
          </div>
          <div className="text-base font-extrabold text-slate-200 tracking-tight font-mono">7483</div>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800/80 text-center hover:border-slate-700 transition">
          <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center justify-center gap-1 mb-0.5">
            <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" /> Scope
          </div>
          <div className="text-xs font-black text-emerald-400 tracking-tight mt-1">{automationMode}</div>
        </div>
      </div>

      {/* Action Buttons with tactile micro-interactions */}
      <div className="space-y-2">
        <button
          onClick={handleOpenSidePanel}
          className="btn-tactile w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 p-[1px] font-bold text-xs shadow-[0_4px_20px_rgba(37,99,235,0.35)] hover:shadow-[0_6px_25px_rgba(37,99,235,0.5)]"
        >
          <div className="w-full h-full bg-gradient-to-r from-blue-600 to-indigo-600 group-hover:from-blue-500 group-hover:to-indigo-500 py-2.5 px-4 rounded-[11px] flex items-center justify-center gap-2 text-white transition-all">
            <PanelRightOpen className="w-4 h-4 group-hover:scale-110 transition-transform" />
            <span className="tracking-wide">Open Drishti Control Deck</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>

        {/* 1-Click Universal AI Setup Prompt Button */}
        <button
          onClick={handleCopyAIPrompt}
          className="btn-tactile w-full py-2 px-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-cyan-500/30 hover:border-cyan-500/60 text-cyan-300 font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
        >
          {copiedPromptToast ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Prompt Copied for Antigravity / Claude / Cursor!</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Copy AI Auto-Connect Prompt</span>
            </>
          )}
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleReconnect}
            disabled={isReconnecting}
            className="btn-tactile flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 font-semibold text-xs transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${isReconnecting ? 'animate-spin' : ''}`} />
            <span>{isReconnecting ? 'Syncing...' : 'Ping Bridge'}</span>
          </button>

          <button
            onClick={handleOpenSettings}
            className="btn-tactile flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 font-semibold text-xs transition-all"
          >
            <Settings className="w-3.5 h-3.5 text-slate-400 group-hover:rotate-45 transition-transform" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* Footer Status & Copied Toast */}
      <div className="mt-3.5 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 font-medium">
        <button
          onClick={handleCopyStatus}
          className="hover:text-slate-300 transition flex items-center gap-1.5"
          title="Click to copy status log"
        >
          {copiedNotification ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-semibold">Diagnostics Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 text-slate-500" />
              <span>Ready for Antigravity & OpenCode</span>
            </>
          )}
        </button>
        <span className="font-mono text-slate-400">v0.1.2</span>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<PopupApp />);
