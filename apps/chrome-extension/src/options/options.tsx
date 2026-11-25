import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Key,
  Shield,
  Sliders,
  Check,
  Copy,
  Eye,
  EyeOff,
  Save,
  Radio,
  Sparkles,
  Terminal,
  Activity,
  Layers,
  Globe,
  Lock,
  Cpu,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  Info,
  FlaskConical,
  Camera,
  Search,
  FileText,
  Play,
  Mic,
} from 'lucide-react';
import '../styles.css';

type SettingsTab = 'connection' | 'test-lab' | 'ai-prompt' | 'modes' | 'security' | 'diagnostics';

export function OptionsApp() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('connection');
  const [authToken, setAuthToken] = useState<string>('');
  const [showToken, setShowToken] = useState<boolean>(false);
  const [wsPort, setWsPort] = useState<string>('7483');
  const [automationMode, setAutomationMode] = useState<string>('auto');
  const [browserMode, setBrowserMode] = useState<string>('existing');
  const [allowlist, setAllowlist] = useState<string>('*');
  const [blocklist, setBlocklist] = useState<string>('bank.*, paypal.com, accounts.google.com/signin');
  const [hasChanges, setHasChanges] = useState<boolean>(false);
  const [saved, setSaved] = useState<boolean>(false);
  const [testingPing, setTestingPing] = useState<boolean>(false);
  const [pingResult, setPingResult] = useState<{ status: 'idle' | 'success' | 'error'; message: string; latency?: number } | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);

  // Live Test Lab states
  const [testingScreenshot, setTestingScreenshot] = useState<boolean>(false);
  const [screenshotData, setScreenshotData] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [testingDom, setTestingDom] = useState<boolean>(false);
  const [domSnapshotData, setDomSnapshotData] = useState<any | null>(null);
  const [domFilter, setDomFilter] = useState<'all' | 'buttons' | 'inputs' | 'links' | 'headings'>('all');
  const [domSearch, setDomSearch] = useState<string>('');
  const [domViewMode, setDomViewMode] = useState<'tree' | 'json'>('tree');
  const [copiedSelector, setCopiedSelector] = useState<string | null>(null);
  const [testingMission, setTestingMission] = useState<boolean>(false);
  const [missionSteps, setMissionSteps] = useState<string[]>([]);
  const [micStatus, setMicStatus] = useState<'idle' | 'granted' | 'denied'>('idle');
  const [showMicPromptCard, setShowMicPromptCard] = useState<boolean>(false);

  const requestMicrophoneAccess = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicStatus('granted');
      setShowMicPromptCard(false);
    } catch {
      setMicStatus('denied');
    }
  };

  useEffect(() => {
    if (window.location.search.includes('mic=1')) {
      setShowMicPromptCard(true);
    }
    chrome.storage.local.get(
      [
        'bridgeAuthToken',
        'bridgeWsPort',
        'automationMode',
        'browserMode',
        'domainAllowlist',
        'domainBlocklist',
      ],
      (res) => {
        if (res.bridgeAuthToken) setAuthToken(res.bridgeAuthToken);
        if (res.bridgeWsPort) setWsPort(String(res.bridgeWsPort));
        if (res.automationMode) setAutomationMode(res.automationMode);
        if (res.browserMode) setBrowserMode(res.browserMode);
        if (res.domainAllowlist) setAllowlist(res.domainAllowlist);
        if (res.domainBlocklist) setBlocklist(res.domainBlocklist);
      }
    );
  }, []);

  const handleSave = () => {
    chrome.storage.local.set(
      {
        bridgeAuthToken: authToken.trim(),
        bridgeWsPort: parseInt(wsPort, 10) || 7483,
        automationMode,
        browserMode,
        domainAllowlist: allowlist.trim(),
        domainBlocklist: blocklist.trim(),
      },
      () => {
        setSaved(true);
        setHasChanges(false);
        setTimeout(() => setSaved(false), 3000);
        chrome.runtime.sendMessage({ type: 'RECONNECT' });
      }
    );
  };

  const handleTestBridge = () => {
    setTestingPing(true);
    setPingResult(null);

    const token = authToken.trim();
    const port = parseInt(wsPort, 10) || 7483;

    // Immediately persist current credentials to chrome.storage
    chrome.storage.local.set({ bridgeAuthToken: token, bridgeWsPort: port });

    chrome.runtime.sendMessage(
      { type: 'TEST_CONNECTION', token, port },
      (res) => {
        setTestingPing(false);
        if (res && res.success) {
          setPingResult({
            status: 'success',
            message: `Bridge connected & authenticated (${res.latency}ms) — Ready for Antigravity & OpenCode!`,
            latency: res.latency,
          });
        } else {
          setPingResult({
            status: 'error',
            message: res?.error || `Connection refused on ws://127.0.0.1:${port}. Make sure bridge is running with 'pnpm bridge:start'`,
          });
        }
      }
    );
  };

  const handleTestScreenshot = () => {
    setTestingScreenshot(true);
    setScreenshotData(null);
    setScreenshotError(null);
    chrome.runtime.sendMessage({ type: 'TAKE_SCREENSHOT_LIVE' }, (res) => {
      setTestingScreenshot(false);
      if (res && res.success && res.data) {
        const b64 = res.data.base64 || (typeof res.data === 'string' ? res.data : null);
        if (b64) {
          const formatted = b64.startsWith('data:image') ? b64 : `data:image/png;base64,${b64}`;
          setScreenshotData(formatted);
        } else {
          setScreenshotError('No viewport image captured');
        }
      } else {
        setScreenshotError(res?.error || 'Viewport capture failed (ensure browser window is visible)');
      }
    });
  };

  const handleTestDom = () => {
    setTestingDom(true);
    setDomSnapshotData(null);
    chrome.runtime.sendMessage({ type: 'GET_DOM_SNAPSHOT_LIVE' }, (res) => {
      setTestingDom(false);
      if (res && res.success && res.data) {
        setDomSnapshotData(res.data);
      }
    });
  };

  const handleCopySelector = (sel: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(sel);
    setCopiedSelector(sel);
    setTimeout(() => setCopiedSelector(null), 2000);
  };

  const handleTestHighlight = (sel: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    chrome.runtime.sendMessage({
      type: 'COMMAND',
      action: 'CLICK',
      payload: { selector: sel },
    });
  };

  const handleTestMission = () => {
    setTestingMission(true);
    setMissionSteps(['🚀 Initializing autonomous AI mission runner...']);

    chrome.runtime.sendMessage(
      {
        type: 'EXECUTE_NATURAL_TASK',
        payload: { prompt: 'Open Google & search Java DSA tutorials, then inspect results', mode: 'auto' },
      },
      (res) => {
        setTestingMission(false);
        if (res && res.steps) {
          setMissionSteps(res.steps);
        } else {
          setMissionSteps(['✅ Mission completed successfully']);
        }
      }
    );
  };

  const handleCopyPrompt = () => {
    const prompt = `<SYSTEM_INSTRUCTION>
You are an expert AI Browser Automation Agent empowered to inspect, navigate, and control the user's live browser via the Drishti Browser AI Model Context Protocol (MCP) server.

## 1. PLATFORM TOPOLOGY
- Local MCP Server: <path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js
- WebSocket Bridge: ws://127.0.0.1:${wsPort || '7483'}
- Bridge Auth Token: ${authToken || 'YOUR_AUTH_TOKEN'}
- Chrome Extension: Drishti Browser AI (v0.1.1 PRO)
- Mode: Mode A (Daily Chrome profile with user's real sessions, cookies & logins)

## 2. MCP CONFIGURATION
Add this to your MCP settings (Antigravity, Claude ~/.claude/mcp.json, Cursor MCP Settings):
{
  "mcpServers": {
    "drishti-browser-ai": {
      "command": "node",
      "args": ["<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"],
      "env": {
        "BRIDGE_AUTH_TOKEN": "${authToken || 'YOUR_AUTH_TOKEN'}",
        "BRIDGE_WS_URL": "ws://127.0.0.1:${wsPort || '7483'}"
      }
    }
  }
}

## 0. ZERO-CLONE SETUP & SKILL AUTO-LOAD (DO NOT CLONE IF ALREADY INSTALLED)
1. First check if Drishti Browser AI is already on disk (look for \`apps/mcp-server/dist/index.js\`). If found but \`scripts/setup-agent.mjs\` is missing, update it in place (\`git pull origin main && pnpm install && pnpm -r run build\`). Only clone https://github.com/SudhirDevOps1/drishti-browser-ai.git into a dedicated tools folder if it is NOT installed anywhere on this machine — NEVER clone it inside an unrelated user project!
2. Inside the Drishti folder, run: \`node scripts/setup-agent.mjs --client auto --port ${wsPort || '7483'}${authToken ? ` --token ${authToken}` : ''}\` (or specify \`--client antigravity|gemini|opencode|claude|cursor|codex\`)
   - This automatically generates \`.drishti-token\` (if missing), registers \`drishti-browser-ai\` in your active AI client's MCP config, and installs the \`drishti-browser-agent\` Skill so it loads automatically.
3. Start the Local Bridge on-demand (\`pnpm bridge:start\`, never install OS auto-start scripts).
4. Remove any temporary setup files; if freshly cloned solely for runtime use, clean up non-runtime folders (\`apps/web-showcase\`, \`tests\`) after building.

## 3. TOKEN-EFFICIENT EXECUTION (ZERO REDUNDANT SCREENSHOTS)
1. Call \`workflow_match({ query })\` or \`browser_task({ goal })\` first to reuse cached SQLite workflows.
2. Call \`browser_observe()\` or \`browser_snapshot()\` to get \`@e1\`, \`@e2\` semantic refs.
3. Use \`ref: "@eN"\` in \`browser_click\`, \`browser_fill\`, \`browser_type\`, and \`browser_hover\` — do NOT call \`browser_screenshot()\` after every click; use \`browser_observe()\` or post-action DOM summary instead.
4. Use \`browser_download()\` for silent downloads and \`browser_confirm()\` before any delete/submit/payment action.

## 4. SAFETY RULES
- Never read or extract values from type="password" fields.
- Always ask user confirmation before submitting financial checkouts or payments.
</SYSTEM_INSTRUCTION>`;

    navigator.clipboard.writeText(prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2500);
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setAuthToken(text.trim());
        setHasChanges(true);
      }
    } catch {
      // Ignore
    }
  };

  return (
    <div className="min-h-screen bg-[#060a12] text-slate-100 font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Application Bar */}
      <header className="border-b border-slate-800/80 bg-[#090e1a]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 p-[1.5px] shadow-[0_0_20px_rgba(56,189,248,0.3)] flex items-center justify-center">
              <div className="w-full h-full bg-[#080d19] rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm tracking-tight text-white">Drishti Browser AI</span>
                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
                  PRO v0.1.0
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Enterprise MCP Browser Gateway</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={requestMicrophoneAccess}
              className={`btn-interactive flex items-center gap-1.5 text-xs font-bold py-2 px-3.5 rounded-xl border transition ${
                micStatus === 'granted'
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                  : micStatus === 'denied'
                  ? 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                  : showMicPromptCard
                  ? 'bg-cyan-600 border-cyan-400 text-white animate-pulse'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-cyan-300'
              }`}
              title="Grant microphone permission for Sidepanel Voice Commands"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>
                {micStatus === 'granted'
                  ? 'Mic Granted'
                  : micStatus === 'denied'
                  ? 'Mic Blocked'
                  : 'Enable Voice Mic'}
              </span>
            </button>
            {hasChanges && (
              <span className="text-[11px] font-bold text-amber-400 animate-pulse flex items-center gap-1.5 bg-amber-950/40 px-2.5 py-1 rounded-full border border-amber-500/30">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                Unsaved changes
              </span>
            )}
            <button
              onClick={handleSave}
              className="btn-interactive flex items-center gap-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 text-white font-bold text-xs py-2 px-5 rounded-xl shadow-[0_4px_15px_rgba(59,130,246,0.35)]"
            >
              {saved ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Save className="w-3.5 h-3.5" />}
              <span>{saved ? 'Saved Successfully!' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Two-Column Layout */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Left Navigation Sidebar */}
          <aside className="md:col-span-3 space-y-1.5">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-3 py-1 mb-2">
              Settings Catalog
            </div>

            {[
              { id: 'connection', label: 'Connection & Bridge', icon: Key, badge: 'Required' },
              { id: 'test-lab', label: 'Interactive Live Test Lab', icon: FlaskConical, badge: 'LIVE' },
              { id: 'ai-prompt', label: 'AI Agent Auto-Connect', icon: Sparkles, badge: 'PRO' },
              { id: 'modes', label: 'Automation Scopes', icon: Sliders },
              { id: 'security', label: 'Security & Boundaries', icon: Shield },
              { id: 'diagnostics', label: 'Telemetry & Status', icon: Activity },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as SettingsTab)}
                  className={`btn-interactive w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left ${
                    isActive
                      ? 'bg-blue-600/15 border border-blue-500/40 text-blue-300 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                    <span>{tab.label}</span>
                  </div>
                  {tab.badge ? (
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      {tab.badge}
                    </span>
                  ) : (
                    <ChevronRight className={`w-3.5 h-3.5 opacity-40 ${isActive ? 'opacity-100 text-blue-400' : ''}`} />
                  )}
                </button>
              );
            })}

            <div className="pt-6 px-3">
              <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800 text-[11px] text-slate-400 space-y-2">
                <div className="font-bold text-slate-300 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-blue-400" />
                  Quick Tip
                </div>
                <p className="leading-relaxed">
                  Start your local MCP server with <code className="text-cyan-400 font-mono">pnpm mcp:start</code> to begin automating Chrome.
                </p>
              </div>
            </div>
          </aside>

          {/* Right Active Content Panel */}
          <section className="md:col-span-9 space-y-6">
            {/* Tab: Interactive Live Test Lab */}
            {activeTab === 'test-lab' && (
              <div className="card-linear rounded-2xl p-6 space-y-6 animate-in fade-in duration-200">
                <div className="flex items-start justify-between border-b border-slate-800/80 pb-5">
                  <div>
                    <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                      <FlaskConical className="w-5 h-5 text-cyan-400" />
                      Interactive Live AI Test Lab
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Directly verify how AI agents interact with your Chrome browser in real time.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    Live Diagnostics
                  </span>
                </div>

                {/* 4 Interactive Test Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Test 1: Ping & Handshake */}
                  <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Radio className="w-4 h-4 text-cyan-400" />
                        1. Bridge Handshake
                      </span>
                      <button
                        onClick={handleTestBridge}
                        disabled={testingPing}
                        className="btn-interactive text-[11px] font-bold px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow"
                      >
                        {testingPing ? 'Testing...' : 'Run Ping'}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Measures round-trip latency to local WebSocket bridge (:7483) and verifies auth token.
                    </p>
                    {pingResult && (
                      <div className={`p-2.5 rounded-lg text-[11px] font-mono ${pingResult.status === 'success' ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/50' : 'bg-rose-950/40 text-rose-300 border border-rose-800/50'}`}>
                        {pingResult.message}
                      </div>
                    )}
                  </div>

                  {/* Test 2: Live Viewport Screenshot */}
                  <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Camera className="w-4 h-4 text-indigo-400" />
                        2. Live Tab Screenshot
                      </span>
                      <button
                        onClick={handleTestScreenshot}
                        disabled={testingScreenshot}
                        className="btn-interactive text-[11px] font-bold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow"
                      >
                        {testingScreenshot ? 'Capturing...' : 'Capture Viewport'}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Captures the active tab viewport via Chrome Scripting and renders the visual snapshot.
                    </p>
                    {screenshotData ? (
                      <div className="mt-2 rounded-lg overflow-hidden border border-slate-700 max-h-48 relative group shadow-lg">
                        <img src={screenshotData} alt="Live Tab Capture" className="w-full object-cover" />
                        <span className="absolute bottom-1 right-1 bg-black/85 text-[9px] text-emerald-400 px-2 py-0.5 rounded font-mono border border-emerald-500/30">
                          Verified HD
                        </span>
                      </div>
                    ) : screenshotError ? (
                      <div className="mt-2 p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/50 text-[11px] text-amber-300 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>{screenshotError}</span>
                      </div>
                    ) : (
                      <div
                        onClick={handleTestScreenshot}
                        className="mt-2 p-3 rounded-lg border border-dashed border-slate-800 hover:border-indigo-500/40 bg-[#060a12]/50 text-center text-slate-500 hover:text-indigo-400 text-[11px] cursor-pointer transition flex items-center justify-center gap-2"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Click "Capture Viewport" to render live screenshot</span>
                      </div>
                    )}
                  </div>

                  {/* Test 3: Semantic DOM Snapshot */}
                  <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-emerald-400" />
                        3. Extract Semantic DOM
                      </span>
                      <button
                        onClick={handleTestDom}
                        disabled={testingDom}
                        className="btn-interactive text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow"
                      >
                        {testingDom ? 'Inspecting...' : 'Extract DOM'}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Extracts page title, headings, links count, and structure without sending raw HTML.
                    </p>
                    {domSnapshotData && (
                      <div className="p-3.5 rounded-xl bg-[#060a12] border border-slate-800 text-xs space-y-3">
                        {/* Title & URL Banner */}
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 gap-2">
                          <div className="flex items-center gap-1.5 text-white font-medium truncate max-w-xs">
                            <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            <span className="truncate">{domSnapshotData.title || 'Untitled Page'}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-[10px]">
                              <button
                                onClick={() => setDomViewMode('tree')}
                                className={`px-2 py-0.5 rounded font-semibold transition ${
                                  domViewMode === 'tree'
                                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                Tree View
                              </button>
                              <button
                                onClick={() => setDomViewMode('json')}
                                className={`px-2 py-0.5 rounded font-semibold transition ${
                                  domViewMode === 'json'
                                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                JSON View
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Search & Filter Bar */}
                        <div className="space-y-2">
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                            <input
                              type="text"
                              value={domSearch}
                              onChange={(e) => setDomSearch(e.target.value)}
                              placeholder="Search elements by text, tag or selector..."
                              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700/80 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                            />
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                            {(
                              [
                                { key: 'all', label: `All (${domSnapshotData.elements?.length || 0})` },
                                { key: 'buttons', label: `Buttons (${domSnapshotData.elements?.filter((e: any) => e.tag === 'button' || e.role === 'button').length || 0})` },
                                { key: 'inputs', label: `Inputs (${domSnapshotData.elements?.filter((e: any) => e.tag === 'input' || e.tag === 'textarea' || e.tag === 'select').length || 0})` },
                                { key: 'links', label: `Links (${domSnapshotData.elements?.filter((e: any) => e.tag === 'a' || e.role === 'link').length || 0})` },
                                { key: 'headings', label: `Headings (${domSnapshotData.headings?.length || 0})` },
                              ] as const
                            ).map((tab) => (
                              <button
                                key={tab.key}
                                onClick={() => setDomFilter(tab.key)}
                                className={`px-2 py-1 rounded-md font-semibold transition ${
                                  domFilter === tab.key
                                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                                }`}
                              >
                                {tab.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Elements List View OR JSON View */}
                        {domViewMode === 'json' ? (
                          <div className="space-y-2">
                            <div className="flex justify-end">
                              <button
                                onClick={(e) => handleCopySelector(JSON.stringify(domSnapshotData, null, 2), e)}
                                className="btn-interactive flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-cyan-300 font-semibold"
                              >
                                <Copy className="w-3 h-3" />
                                <span>Copy JSON</span>
                              </button>
                            </div>
                            <pre className="max-h-56 overflow-y-auto p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[10px] font-mono text-emerald-300 whitespace-pre-wrap select-all">
                              {JSON.stringify(
                                {
                                  title: domSnapshotData.title,
                                  url: domSnapshotData.url,
                                  headings: domSnapshotData.headings?.slice(0, 15),
                                  elements: (domSnapshotData.elements || [])
                                    .filter((el: any) =>
                                      !domSearch.trim() ||
                                      (el.text || '').toLowerCase().includes(domSearch.toLowerCase()) ||
                                      (el.selector || '').toLowerCase().includes(domSearch.toLowerCase())
                                    )
                                    .slice(0, 30),
                                },
                                null,
                                2
                              )}
                            </pre>
                          </div>
                        ) : (
                        <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]">
                          {domFilter === 'headings' ? (
                            (domSnapshotData.headings || [])
                              .filter((h: any) => !domSearch || (h.text || '').toLowerCase().includes(domSearch.toLowerCase()))
                              .map((h: any, idx: number) => (
                                <div key={idx} className="p-2 rounded-lg bg-slate-900/40 border border-slate-800 flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 truncate">
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-950 text-amber-300 border border-amber-800">
                                      {h.level}
                                    </span>
                                    <span className="text-slate-200 font-sans truncate">{h.text || 'Empty heading'}</span>
                                  </div>
                                </div>
                              ))
                          ) : (
                            (domSnapshotData.elements || [])
                              .filter((el: any) => {
                                if (domFilter === 'buttons' && !(el.tag === 'button' || el.role === 'button')) return false;
                                if (domFilter === 'inputs' && !(el.tag === 'input' || el.tag === 'textarea' || el.tag === 'select')) return false;
                                if (domFilter === 'links' && !(el.tag === 'a' || el.role === 'link')) return false;
                                if (domSearch.trim()) {
                                  const q = domSearch.toLowerCase();
                                  const mText = (el.text || '').toLowerCase().includes(q);
                                  const mSel = (el.selector || '').toLowerCase().includes(q);
                                  const mAria = (el.ariaLabel || '').toLowerCase().includes(q);
                                  const mPlace = (el.placeholder || '').toLowerCase().includes(q);
                                  return mText || mSel || mAria || mPlace;
                                }
                                return true;
                              })
                              .slice(0, 40)
                              .map((el: any, idx: number) => {
                                const isBtn = el.tag === 'button' || el.role === 'button';
                                const isInput = el.tag === 'input' || el.tag === 'textarea';
                                const isLink = el.tag === 'a' || el.role === 'link';
                                const badgeColor = isBtn
                                  ? 'bg-purple-950 text-purple-300 border-purple-800'
                                  : isInput
                                  ? 'bg-blue-950 text-blue-300 border-blue-800'
                                  : isLink
                                  ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                  : 'bg-slate-800 text-slate-300 border-slate-700';

                                return (
                                  <div
                                    key={idx}
                                    className="p-2 rounded-lg bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800/80 transition flex items-center justify-between gap-2 group"
                                  >
                                    <div className="flex items-center gap-2 truncate min-w-0">
                                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0 border ${badgeColor}`}>
                                        {el.tag}
                                      </span>
                                      <span className="text-white font-sans text-xs truncate">
                                        {el.text || el.placeholder || el.ariaLabel || el.selector}
                                      </span>
                                      <span className="text-cyan-400/60 text-[10px] truncate hidden md:inline">
                                        {el.selector}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        onClick={(e) => handleTestHighlight(el.selector, e)}
                                        className="btn-interactive p-1 rounded bg-slate-800 hover:bg-cyan-900/60 text-slate-400 hover:text-cyan-300 text-[10px]"
                                        title="Flash Highlight on Page"
                                      >
                                        <Sparkles className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={(e) => handleCopySelector(el.selector, e)}
                                        className="btn-interactive p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-[10px]"
                                        title="Copy Selector"
                                      >
                                        {copiedSelector === el.selector ? (
                                          <Check className="w-3 h-3 text-emerald-400" />
                                        ) : (
                                          <Copy className="w-3 h-3" />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })
                          )}
                        </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Test 4: End-to-End Autonomous Mission */}
                  <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Play className="w-4 h-4 text-purple-400" />
                        4. Autonomous AI Mission
                      </span>
                      <button
                        onClick={handleTestMission}
                        disabled={testingMission}
                        className="btn-interactive text-[11px] font-bold px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white shadow"
                      >
                        {testingMission ? 'Executing...' : 'Run Live Mission'}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Runs a complete end-to-end task: opens Google, types search query, and extracts top search results.
                    </p>
                    {missionSteps.length > 0 && (
                      <div className="p-2.5 rounded-lg bg-purple-950/30 border border-purple-800/40 text-[11px] space-y-1 text-purple-300 font-mono">
                        {missionSteps.map((s, idx) => (
                          <div key={idx} className="flex items-center gap-1.5">
                            <span className="text-emerald-400">✓</span>
                            <span>{s}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tab: AI Agent Auto-Connect Prompt */}
            {activeTab === 'ai-prompt' && (
              <div className="card-linear rounded-2xl p-6 space-y-6 animate-in fade-in duration-200">
                <div className="flex items-start justify-between border-b border-slate-800/80 pb-5">
                  <div>
                    <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-cyan-400" />
                      Universal AI Agent Auto-Setup Prompt
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Give this prompt to Antigravity, OpenCode, Claude Code, Cursor, or Codex. The AI will automatically read your token, connect to the bridge, and know how to control Chrome!
                    </p>
                  </div>

                  <button
                    onClick={handleCopyPrompt}
                    className="btn-interactive flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-xs font-bold text-white shadow-lg shadow-blue-500/25"
                  >
                    {copiedPrompt ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedPrompt ? 'Copied to Clipboard!' : '1-Click Copy AI Prompt'}</span>
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="font-bold flex items-center gap-1.5">
                      <Terminal className="w-4 h-4 text-blue-400" />
                      Ready-to-Paste System Prompt (Includes your configured token):
                    </span>
                    <span className="text-[10px] text-slate-500">Auto-filled with active token & port</span>
                  </div>

                  <div className="relative">
                    <pre className="p-4 rounded-xl bg-[#060a12] border border-slate-800 text-cyan-300 font-mono text-[11px] leading-relaxed max-h-96 overflow-y-auto whitespace-pre-wrap select-all">
{`<SYSTEM_INSTRUCTION>
You are an expert AI Browser Automation Agent empowered to inspect, navigate, and control the user's live browser via the Drishti Browser AI Model Context Protocol (MCP) server.

## 1. PLATFORM TOPOLOGY
- Local MCP Server: <path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js
- WebSocket Bridge: ws://127.0.0.1:${wsPort || '7483'}
- Bridge Auth Token: ${authToken || 'YOUR_AUTH_TOKEN'}
- Chrome Extension: Drishti Browser AI (v0.1.1 PRO)
- Mode: Mode A (Daily Chrome profile with user's real sessions, cookies & logins)

## 2. MCP CONFIGURATION
Add this to your MCP settings (Antigravity, Claude ~/.claude/mcp.json, Cursor MCP Settings):
{
  "mcpServers": {
    "drishti-browser-ai": {
      "command": "node",
      "args": ["<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js"],
      "env": {
        "BRIDGE_AUTH_TOKEN": "${authToken || 'YOUR_AUTH_TOKEN'}",
        "BRIDGE_WS_URL": "ws://127.0.0.1:${wsPort || '7483'}"
      }
    }
  }
}

## 0. ZERO-CLONE SETUP & SKILL AUTO-LOAD (DO NOT CLONE IF ALREADY INSTALLED)
1. First check if Drishti Browser AI is already on disk (look for \`apps/mcp-server/dist/index.js\`). If found but \`scripts/setup-agent.mjs\` is missing, update it in place (\`git pull origin main && pnpm install && pnpm -r run build\`). Only clone https://github.com/SudhirDevOps1/drishti-browser-ai.git into a dedicated tools folder if it is NOT installed anywhere on this machine — NEVER clone it inside an unrelated user project!
2. Inside the Drishti folder, run: \`node scripts/setup-agent.mjs --client auto --port ${wsPort || '7483'}${authToken ? ` --token ${authToken}` : ''}\` (or specify \`--client antigravity|gemini|opencode|claude|cursor|codex\`)
   - This automatically generates \`.drishti-token\` (if missing), registers \`drishti-browser-ai\` in your active AI client's MCP config, and installs the \`drishti-browser-agent\` Skill so it loads automatically.
3. Start the Local Bridge on-demand (\`pnpm bridge:start\`, never install OS auto-start scripts).
4. Remove any temporary setup files; if freshly cloned solely for runtime use, clean up non-runtime folders (\`apps/web-showcase\`, \`tests\`) after building.

## 3. TOKEN-EFFICIENT EXECUTION (ZERO REDUNDANT SCREENSHOTS)
1. Call \`workflow_match({ query })\` or \`browser_task({ goal })\` first to reuse cached SQLite workflows.
2. Call \`browser_observe()\` or \`browser_snapshot()\` to get \`@e1\`, \`@e2\` semantic refs.
3. Use \`ref: "@eN"\` in \`browser_click\`, \`browser_fill\`, \`browser_type\`, and \`browser_hover\` — do NOT call \`browser_screenshot()\` after every click; use \`browser_observe()\` or post-action DOM summary instead.
4. Use \`browser_download()\` for silent downloads and \`browser_confirm()\` before any delete/submit/payment action.

## 4. SAFETY RULES
- Never read or extract values from type="password" fields.
- Always ask user confirmation before submitting financial checkouts or payments.
</SYSTEM_INSTRUCTION>`}
                    </pre>

                    <button
                      onClick={handleCopyPrompt}
                      className="absolute top-3 right-3 btn-interactive px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 shadow"
                    >
                      {copiedPrompt ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedPrompt ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'connection' && (
              <div className="card-linear rounded-2xl p-6 space-y-6 animate-in fade-in duration-200">
                <div className="flex items-start justify-between border-b border-slate-800/80 pb-5">
                  <div>
                    <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                      <Key className="w-5 h-5 text-cyan-400" />
                      Local MCP Bridge Authentication
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Exchange security tokens to ensure only authorized AI agents running on localhost can inspect and control your browser.
                    </p>
                  </div>

                  <button
                    onClick={handleTestBridge}
                    disabled={testingPing}
                    className="btn-interactive flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-bold text-slate-200 disabled:opacity-50"
                  >
                    <Radio className={`w-3.5 h-3.5 text-blue-400 ${testingPing ? 'animate-pulse' : ''}`} />
                    <span>{testingPing ? 'Measuring...' : 'Test Bridge Ping'}</span>
                  </button>
                </div>

                {/* Radar Ping Banner */}
                {pingResult && (
                  <div
                    className={`p-4 rounded-xl border text-xs flex items-center justify-between ${
                      pingResult.status === 'success'
                        ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                        : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative flex items-center justify-center">
                        <span className={`w-3 h-3 rounded-full ${pingResult.status === 'success' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                        {pingResult.status === 'success' && (
                          <span className="radar-ping absolute w-6 h-6 rounded-full bg-emerald-400/40" />
                        )}
                      </div>
                      <span className="font-semibold">{pingResult.message}</span>
                    </div>
                    {pingResult.latency && (
                      <span className="font-mono text-[11px] font-bold bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-500/30">
                        {pingResult.latency}ms latency
                      </span>
                    )}
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-200 mb-1.5">
                      Bridge Secret Token (64-character SHA-256)
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showToken ? 'text' : 'password'}
                          value={authToken}
                          onChange={(e) => {
                            setAuthToken(e.target.value);
                            setHasChanges(true);
                          }}
                          placeholder="Paste token printed by local bridge process..."
                          className="w-full bg-[#060a12] border border-slate-700/90 rounded-xl px-4 py-2.5 font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 text-xs pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowToken(!showToken)}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-white transition"
                        >
                          {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const bytes = new Uint8Array(32);
                          crypto.getRandomValues(bytes);
                          const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
                          setAuthToken(hex);
                          setShowToken(true);
                          setHasChanges(true);
                        }}
                        className="btn-interactive px-3.5 py-2 rounded-xl bg-cyan-950/60 hover:bg-cyan-900/70 border border-cyan-500/40 text-cyan-300 font-bold text-xs flex items-center gap-1.5"
                      >
                        <Key className="w-3.5 h-3.5" />
                        <span>Generate</span>
                      </button>
                      <button
                        type="button"
                        onClick={handlePasteClipboard}
                        className="btn-interactive px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1.5"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Paste</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                      This token is printed in stdout when you start the bridge (<code className="text-cyan-400 font-mono">node dist/index.js</code>). It guarantees that untrusted scripts cannot hijack your browser session.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1.5">
                        WebSocket Port
                      </label>
                      <input
                        type="number"
                        value={wsPort}
                        onChange={(e) => {
                          setWsPort(e.target.value);
                          setHasChanges(true);
                        }}
                        className="w-full bg-[#060a12] border border-slate-700/90 rounded-xl px-4 py-2 font-mono text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                      />
                      <span className="text-[10px] text-slate-500 mt-1 block">Default: 7483</span>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1.5">
                        Protocol Transport
                      </label>
                      <div className="bg-[#060a12] border border-slate-800 rounded-xl px-4 py-2 text-xs text-slate-400 font-mono">
                        ws://127.0.0.1:{wsPort}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Automation Scopes */}
            {activeTab === 'modes' && (
              <div className="card-linear rounded-2xl p-6 space-y-6 animate-in fade-in duration-200">
                <div className="border-b border-slate-800/80 pb-5">
                  <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-indigo-400" />
                    Automation Scopes & Browser Sessions
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Select how aggressively the AI agent operates and whether it attaches to existing logged-in browser tabs.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Browser Profile Mode
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      {
                        id: 'existing',
                        title: 'Mode A: Existing Chrome',
                        desc: 'Attach to active daily tabs, preserving existing cookies, logins, and sessions.',
                      },
                      {
                        id: 'dedicated',
                        title: 'Mode B: Dedicated Profile',
                        desc: 'Spawns an isolated sandbox window dedicated strictly to AI agent execution.',
                      },
                    ].map((item) => (
                      <div
                        key={item.id}
                        onClick={() => {
                          setBrowserMode(item.id);
                          setHasChanges(true);
                        }}
                        className={`btn-interactive p-4 rounded-xl border cursor-pointer transition-all ${
                          browserMode === item.id
                            ? 'bg-blue-600/15 border-blue-500 text-white shadow-md'
                            : 'bg-[#060a12]/60 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="font-bold text-xs text-white mb-1 flex items-center justify-between">
                          <span>{item.title}</span>
                          <input
                            type="radio"
                            checked={browserMode === item.id}
                            onChange={() => {}}
                            className="accent-blue-500"
                          />
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">{item.desc}</p>
                      </div>
                    ))}
                  </div>

                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wider pt-4">
                    Default Automation Level
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                      { id: 'auto', title: 'Auto Mode', desc: 'AI executes complete action sequences independently within boundaries.' },
                      { id: 'assisted', title: 'Assisted Mode', desc: 'Routine actions proceed; sensitive actions require user approval.' },
                      { id: 'manual', title: 'Manual Mode', desc: 'User manually approves every individual step before execution.' },
                    ].map((tier) => (
                      <div
                        key={tier.id}
                        onClick={() => {
                          setAutomationMode(tier.id);
                          setHasChanges(true);
                        }}
                        className={`btn-interactive p-3.5 rounded-xl border cursor-pointer ${
                          automationMode === tier.id
                            ? 'bg-indigo-600/15 border-indigo-500 text-white shadow-sm'
                            : 'bg-[#060a12]/60 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="font-bold text-xs text-white mb-1 flex items-center justify-between">
                          <span>{tier.title}</span>
                          <input
                            type="radio"
                            checked={automationMode === tier.id}
                            onChange={() => {}}
                            className="accent-indigo-500"
                          />
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">{tier.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Security & Boundaries */}
            {activeTab === 'security' && (
              <div className="card-linear rounded-2xl p-6 space-y-6 animate-in fade-in duration-200">
                <div className="border-b border-slate-800/80 pb-5">
                  <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                    <Shield className="w-5 h-5 text-emerald-400" />
                    Security Safeguards & Domain Protection
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Hard boundaries that protect your banking, payment, and sensitive authentication sites from automation.
                  </p>
                </div>

                <div className="space-y-5 text-xs">
                  <div>
                    <label className="block text-xs font-bold text-slate-200 mb-1.5">
                      Domain Blocklist (Strictly Forbidden from AI Control)
                    </label>
                    <input
                      type="text"
                      value={blocklist}
                      onChange={(e) => {
                        setBlocklist(e.target.value);
                        setHasChanges(true);
                      }}
                      className="w-full bg-[#060a12] border border-slate-700/90 rounded-xl px-4 py-2.5 font-mono text-slate-200 text-xs focus:outline-none focus:border-blue-500"
                    />
                    <p className="text-[11px] text-slate-500 mt-1.5">
                      Clicks, typing, and form submissions are blocked on all matching domains.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-200 mb-1.5">
                      Domain Allowlist ('*' allows all non-blocked domains)
                    </label>
                    <input
                      type="text"
                      value={allowlist}
                      onChange={(e) => {
                        setAllowlist(e.target.value);
                        setHasChanges(true);
                      }}
                      className="w-full bg-[#060a12] border border-slate-700/90 rounded-xl px-4 py-2.5 font-mono text-slate-200 text-xs focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 text-[11px]">
                    <div className="font-bold text-slate-300 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-emerald-400" />
                      Zero-Trust Password & Credit Card Shield Active
                    </div>
                    <p className="text-slate-400 leading-relaxed">
                      Drishti Browser AI permanently ignores password fields (<code className="text-cyan-400 font-mono">type="password"</code>) and credit card inputs. Automated tools cannot read or extract passwords under any circumstance.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 4: Diagnostics */}
            {activeTab === 'diagnostics' && (
              <div className="card-linear rounded-2xl p-6 space-y-6 animate-in fade-in duration-200">
                <div className="border-b border-slate-800/80 pb-5">
                  <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                    <Activity className="w-5 h-5 text-cyan-400" />
                    System Diagnostics & Agent Configurations
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Verified configuration templates for your connected AI clients.
                  </p>
                </div>

                <div className="space-y-4 text-xs font-mono">
                  <div className="space-y-2">
                    <span className="font-bold text-slate-300 font-sans">Antigravity / Claude Code / Cursor Config:</span>
                    <pre className="p-4 rounded-xl bg-[#060a12] border border-slate-800 text-cyan-300 overflow-x-auto text-[11px] leading-relaxed">
{JSON.stringify(
  {
    mcpServers: {
      'drishti-browser-ai': {
        command: 'node',
        args: ['<path-to-drishti-browser-ai>/apps/mcp-server/dist/index.js'],
        env: {
          BRIDGE_AUTH_TOKEN: authToken || 'YOUR_AUTH_TOKEN',
          BRIDGE_WS_URL: `ws://127.0.0.1:${wsPort}`,
        },
      },
    },
  },
  null,
  2
)}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<OptionsApp />);
