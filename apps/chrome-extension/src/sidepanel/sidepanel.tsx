import { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Play,
  Square,
  RefreshCw,
  Settings,
  Sparkles,
  Radio,
  Terminal,
  Layers,
  X,
  Command,
  Zap,
  Crosshair,
  Power,
  Camera,
  Eye,
  FileText,
  Code,
  RotateCcw,
  History,
  Download,
  Check,
  Copy,
  Mic,
  MicOff,
  Plus,
  Trash2,
  Bookmark,
  AlertTriangle,
  WifiOff,
  Hand,
} from 'lucide-react';
import { exportSessionScript, ExportFormat } from '../utils/script-exporter';
import '../styles.css';

interface TabItem {
  id?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  active?: boolean;
}

interface ActionLog {
  id: string;
  action: string;
  timestamp: string;
  status: 'pending' | 'success' | 'error';
  category?: string;
  details?: string;
  meta?: {
    rawAction?: string;
    url?: string;
    selector?: string;
    text?: string;
    key?: string;
    amount?: number;
  };
}

interface DownloadedFileItem {
  id: number;
  filename: string;
  fileSize: number;
  state: string;
  startTime: string;
}

export interface MissionHistoryItem {
  id: string;
  prompt: string;
  timestamp: string;
  durationSeconds: number;
  status: 'success' | 'stopped' | 'failed';
  stepCount: number;
}

export interface CustomMacroItem {
  id: string;
  label: string;
  prompt: string;
}

export interface DevConsoleItem {
  level: string;
  message: string;
  timestamp: number;
  url?: string;
}

export interface DevNetworkErrorItem {
  method: string;
  url: string;
  status: number;
  message: string;
  timestamp: number;
}

const QUICK_PROMPTS = [
  { label: 'Deep Research & Report', prompt: 'Search Google for Java DSA complete guide, extract top resources and synthesize comparison report' },
  { label: 'PDF & Doc Analysis', prompt: 'Analyze current PDF/Document structure, summarize all chapters and key algorithms' },
  { label: 'Extract Tables to JSON', prompt: 'Scan active webpage for all HTML data tables and extract as clean structured JSON' },
  { label: 'YouTube Media Player', prompt: 'Open YouTube and play latest Arijit Singh hit songs playlist' },
  { label: 'Verify DOM & Buttons', prompt: 'Inspect interactive DOM, list all clickable buttons and accessibility inputs' },
];

export function SidePanelApp() {
  const [connected, setConnected] = useState<boolean>(false);
  const [automationEnabled, setAutomationEnabled] = useState<boolean>(true);
  const [lockedTabId, setLockedTabId] = useState<number | null>(null);
  const [mode, setMode] = useState<'manual' | 'assisted' | 'auto'>('auto');
  const [taskPrompt, setTaskPrompt] = useState<string>('');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [tabs, setTabs] = useState<TabItem[]>([]);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | undefined>(undefined);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
  const [history, setHistory] = useState<MissionHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [dispatchBanner, setDispatchBanner] = useState<{ text: string; tone: 'info' | 'success' | 'error' } | null>(null);
  const [downloads, setDownloads] = useState<DownloadedFileItem[]>([]);
  const [showDownloads, setShowDownloads] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('playwright-ts');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Voice Command Input state
  const [isListening, setIsListening] = useState<boolean>(false);
  const [voiceLang, setVoiceLang] = useState<'en-IN' | 'hi-IN'>('en-IN');
  const [micPermissionNeeded, setMicPermissionNeeded] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);

  // Custom Saved Macros state
  const [customMacros, setCustomMacros] = useState<CustomMacroItem[]>([]);
  const [showMacroForm, setShowMacroForm] = useState<boolean>(false);
  const [macroLabel, setMacroLabel] = useState<string>('');
  const [macroPrompt, setMacroPrompt] = useState<string>('');

  // Human Takeover & Cursor Speed state
  const [humanTakeoverActive, setHumanTakeoverActive] = useState<boolean>(false);
  const [cursorSpeed, setCursorSpeed] = useState<'natural' | 'demo' | 'fast'>('natural');
  const [trustedCdpMode, setTrustedCdpMode] = useState<boolean>(true);

  // Live Console & Network Error Drawer state
  const [showDevDrawer, setShowDevDrawer] = useState<boolean>(false);
  const [devFilter, setDevFilter] = useState<'all' | 'console' | 'network'>('all');
  const [devConsoleLogs, setDevConsoleLogs] = useState<DevConsoleItem[]>([]);
  const [devNetworkErrors, setDevNetworkErrors] = useState<DevNetworkErrorItem[]>([]);

  const logContainerRef = useRef<HTMLDivElement>(null);

  const refreshDevTelemetry = () => {
    chrome.runtime.sendMessage(
      { type: 'GET_DEV_TELEMETRY', tabId: lockedTabId || activeTabId },
      (res) => {
        if (res?.success) {
          setDevConsoleLogs(Array.isArray(res.consoleLogs) ? res.consoleLogs : []);
          setDevNetworkErrors(Array.isArray(res.networkErrors) ? res.networkErrors : []);
        }
      }
    );
  };

  const clearDevTelemetry = () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_DEV_TELEMETRY' }, () => {
      setDevConsoleLogs([]);
      setDevNetworkErrors([]);
    });
  };

  const toggleVoiceInput = () => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const SpeechRec =
      (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;

    if (!SpeechRec) {
      setDispatchBanner({ text: 'Voice recognition not supported in this browser context.', tone: 'error' });
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.lang = voiceLang;
      recognition.interimResults = true;
      recognition.continuous = false;

      const baseText = taskPrompt.trim() ? taskPrompt.trim() + ' ' : '';

      recognition.onstart = () => {
        setIsListening(true);
        setMicPermissionNeeded(false);
      };
      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setTaskPrompt((baseText + transcript).trim());
      };
      recognition.onerror = (event: any) => {
        setIsListening(false);
        const errCode = event?.error || 'unknown';
        const needsMic = errCode === 'not-allowed' || errCode === 'service-not-allowed';
        setMicPermissionNeeded(needsMic);
        setDispatchBanner({
          text: needsMic
            ? 'Microphone permission required for Voice Input.'
            : `Voice input error: ${errCode}`,
          tone: 'error',
        });
      };
      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      setIsListening(false);
      setDispatchBanner({ text: `Could not start voice input: ${String(err)}`, tone: 'error' });
    }
  };

  const handleSaveMacro = () => {
    const label = macroLabel.trim();
    const prompt = macroPrompt.trim();
    if (!label || !prompt) return;
    const next: CustomMacroItem[] = [
      { id: 'mac-' + Date.now().toString(36), label, prompt },
      ...customMacros,
    ].slice(0, 20);
    setCustomMacros(next);
    chrome.storage.local.set({ customMacros: next });
    setMacroLabel('');
    setMacroPrompt('');
    setShowMacroForm(false);
  };

  const handleDeleteMacro = (id: string) => {
    const next = customMacros.filter((m) => m.id !== id);
    setCustomMacros(next);
    chrome.storage.local.set({ customMacros: next });
  };

  const captureLivePreview = () => {
    setIsPreviewLoading(true);
    chrome.runtime.sendMessage({ type: 'TAKE_SCREENSHOT_LIVE' }, (res) => {
      setIsPreviewLoading(false);
      if (res && res.success && res.data?.base64) {
        setPreviewUrl(`data:image/png;base64,${res.data.base64}`);
      }
    });
  };

  const refreshDownloads = () => {
    if (chrome.downloads?.search) {
      chrome.downloads.search({ limit: 8, orderBy: ['-startTime'] }, (items) => {
        if (items) {
          setDownloads(
            items.map((d) => ({
              id: d.id,
              filename: d.filename.split(/[/\\]/).pop() || d.filename || 'Downloaded File',
              fileSize: d.fileSize || 0,
              state: d.state,
              startTime: d.startTime,
            }))
          );
        }
      });
    }
  };

  const refreshTabs = () => {
    chrome.tabs.query({}, (allTabs) => {
      setTabs(
        allTabs.map((t) => ({
          id: t.id,
          title: t.title,
          url: t.url,
          favIconUrl: t.favIconUrl,
          active: t.active,
        }))
      );
      const active = allTabs.find((t) => t.active);
      if (active) setActiveTabId(active.id);
    });
  };

  const toggleAutomation = () => {
    const next = !automationEnabled;
    setAutomationEnabled(next);
    chrome.storage.local.set({ automationEnabled: next });
    chrome.runtime.sendMessage({ type: 'SET_AUTOMATION_ENABLED', enabled: next }).catch(() => {});
  };

  const toggleLockTab = (tabId: number) => {
    const nextLocked = lockedTabId === tabId ? null : tabId;
    setLockedTabId(nextLocked);
    chrome.storage.local.set({ lockedTabId: nextLocked });
    chrome.runtime.sendMessage({ type: 'SET_LOCKED_TAB', tabId: nextLocked }).catch(() => {});
  };

  useEffect(() => {
    chrome.storage.local.get(['bridgeConnected', 'automationMode', 'automationEnabled', 'lockedTabId', 'missionHistory', 'customMacros', 'cursorSpeed', 'trustedCdpMode'], (res) => {
      setConnected(!!res.bridgeConnected);
      if (res.automationMode) setMode(res.automationMode);
      if (res.automationEnabled !== undefined) setAutomationEnabled(!!res.automationEnabled);
      if (res.lockedTabId) setLockedTabId(res.lockedTabId);
      if (res.missionHistory) setHistory(res.missionHistory);
      if (Array.isArray(res.customMacros)) setCustomMacros(res.customMacros);
      if (res.cursorSpeed === 'fast' || res.cursorSpeed === 'demo' || res.cursorSpeed === 'natural') {
        setCursorSpeed(res.cursorSpeed);
      }
      if (res.trustedCdpMode !== undefined) {
        setTrustedCdpMode(!!res.trustedCdpMode);
      }
    });

    refreshTabs();
    refreshDownloads();
    refreshDevTelemetry();

    const listener = (msg: {
      type: string;
      connected?: boolean;
      action?: string;
      status?: string;
      category?: string;
      meta?: ActionLog['meta'];
    }) => {
      if (msg.type === 'CONNECTION_STATUS') {
        setConnected(!!msg.connected);
      }
      if (msg.type === 'HUMAN_ACTIVITY') {
        setHumanTakeoverActive(true);
        setTimeout(() => setHumanTakeoverActive(false), 3500);
      }
      if (msg.type === 'BRIDGE_ACTION') {
        if (msg.category === 'TAKEOVER') {
          setHumanTakeoverActive(true);
          setTimeout(() => setHumanTakeoverActive(false), 3500);
        }
        if (msg.category === 'AGENT' && msg.action) {
          setDispatchBanner({
            text: msg.action,
            tone: msg.status === 'error' ? 'error' : msg.status === 'success' ? 'success' : 'info',
          });
        }
        setLogs((prev) => [
          {
            id: String(Date.now() + Math.random()),
            action: msg.action || 'Unknown Action',
            category: msg.category || 'MCP',
            timestamp: new Date().toLocaleTimeString(),
            status: (msg.status as any) || 'success',
            meta: msg.meta,
          },
          ...prev.slice(0, 79),
        ]);
        refreshTabs();
        refreshDownloads();
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
      if (area === 'session') {
        if (changes.consoleLogs !== undefined && Array.isArray(changes.consoleLogs.newValue)) {
          setDevConsoleLogs(changes.consoleLogs.newValue);
        }
        if (changes.networkErrors !== undefined && Array.isArray(changes.networkErrors.newValue)) {
          setDevNetworkErrors(changes.networkErrors.newValue);
        }
      }
    };
    chrome.storage.onChanged.addListener(storageListener);
    const interval = setInterval(refreshTabs, 4000);

    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      chrome.storage.onChanged.removeListener(storageListener);
      clearInterval(interval);
    };
  }, []);

  // Timer for running tasks
  useEffect(() => {
    let timer: any;
    if (isRunning) {
      timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => clearInterval(timer);
  }, [isRunning]);

  const saveMissionToHistory = (status: 'success' | 'stopped' | 'failed') => {
    if (!taskPrompt.trim()) return;
    const item: MissionHistoryItem = {
      id: 'm-' + Date.now().toString(36),
      prompt: taskPrompt.trim(),
      timestamp: new Date().toLocaleTimeString(),
      durationSeconds: elapsedSeconds,
      status,
      stepCount: logs.length,
    };
    const next = [item, ...history.filter(h => h.prompt !== item.prompt)].slice(0, 10);
    setHistory(next);
    chrome.storage.local.set({ missionHistory: next });
  };

  const handleReplayMission = (item: MissionHistoryItem) => {
    setTaskPrompt(item.prompt);
  };

  const handleStart = () => {
    if (!taskPrompt.trim() || isRunning) return;
    setIsRunning(true);
    setElapsedSeconds(0);
    setDispatchBanner({ text: connected ? 'Sending mission to AI Agent...' : 'Running local quick mission...', tone: 'info' });

    const newLog: ActionLog = {
      id: String(Date.now()),
      action: `Dispatched [${mode.toUpperCase()}]: ${taskPrompt}`,
      category: 'TASK',
      timestamp: new Date().toLocaleTimeString(),
      status: 'pending',
    };
    setLogs((prev) => [newLog, ...prev]);

    chrome.runtime.sendMessage(
      {
        type: 'EXECUTE_NATURAL_TASK',
        payload: { prompt: taskPrompt, mode, tabId: activeTabId },
      },
      (res) => {
        setIsRunning(false);
        saveMissionToHistory(res && res.success !== false ? 'success' : 'failed');
        if (res?.dispatchedTo) {
          const bannerMsg =
            res.dispatchedTo === 'antigravity'
              ? `Sent to Antigravity (${res.missionId}) — Check Antigravity sidebar or Live Stream below!`
              : `Queued in MCP Inbox (${res.missionId}) — Ready for Claude/OpenCode/Cursor`;
          setDispatchBanner({ text: bannerMsg, tone: 'success' });
          setTaskPrompt('');
          setLogs((prev) => [
            {
              id: String(Date.now() + Math.random()),
              action: bannerMsg,
              category: 'AGENT',
              timestamp: new Date().toLocaleTimeString(),
              status: 'success',
            },
            ...prev,
          ]);
        } else if (res?.error) {
          setDispatchBanner({ text: res.error, tone: 'error' });
        }
      }
    );
  };

  const handleStop = () => {
    setIsRunning(false);
    setAutomationEnabled(false);
    saveMissionToHistory('stopped');
    chrome.runtime.sendMessage({ type: 'STOP_TASK' });
    setLogs((prev) => [
      {
        id: String(Date.now()),
        action: 'Task Halted (Emergency Stop Activated)',
        category: 'SAFETY',
        timestamp: new Date().toLocaleTimeString(),
        status: 'error',
      },
      ...prev,
    ]);
  };

  const generatedScript = exportSessionScript(
    [...logs]
      .reverse()
      .filter((l) => l.status === 'success' && (l.meta?.rawAction || !l.action.startsWith('Executing')))
      .map((l) => ({
        action: l.meta?.rawAction || l.action,
        url: l.meta?.url,
        selector: l.meta?.selector,
        text: l.meta?.text,
        key: l.meta?.key,
        amount: l.meta?.amount,
        timestamp: l.timestamp,
      })),
    exportFormat
  );

  const handleCopyExportCode = () => {
    navigator.clipboard.writeText(generatedScript);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleDownloadExportCode = () => {
    const ext =
      exportFormat === 'playwright-py'
        ? 'py'
        : exportFormat === 'puppeteer-js'
        ? 'js'
        : exportFormat === 'drishti-cli'
        ? 'sh'
        : 'ts';
    const blob = new Blob([generatedScript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drishti-mission.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSwitchTab = (tabId?: number) => {
    if (!tabId) return;
    chrome.tabs.update(tabId, { active: true }, () => refreshTabs());
  };

  const handleCloseTab = (tabId?: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!tabId) return;
    chrome.tabs.remove(tabId, () => refreshTabs());
  };

  return (
    <div className="flex flex-col h-screen bg-[#070b14] text-slate-100 font-sans select-none overflow-hidden">
      {/* Top Navbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#0a0f1c] border-b border-slate-800/90 shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 p-[1.5px] shadow-[0_0_15px_rgba(59,130,246,0.3)] flex items-center justify-center">
            <div className="w-full h-full bg-[#080d19] rounded-[10px] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-cyan-400" />
            </div>
          </div>
          <div>
            <div className="font-extrabold text-sm tracking-tight text-white flex items-center gap-2">
              Drishti Control Deck
              <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                PRO
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">Autonomous Multi-Agent Controller (दृष्टि नियंत्रण कक्ष)</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Master AI Toggle */}
          <button
            onClick={toggleAutomation}
            className={`btn-tactile flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition ${
              automationEnabled
                ? 'bg-blue-950/70 border-blue-500/50 text-blue-300 hover:bg-blue-900/60 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                : 'bg-amber-950/70 border-amber-500/50 text-amber-300 hover:bg-amber-900/60'
            }`}
            title={automationEnabled ? 'AI Automation is Active (Click to Pause)' : 'AI Automation is Paused (Click to Resume)'}
          >
            <Power className={`w-3 h-3 ${automationEnabled ? 'text-blue-400' : 'text-amber-400'}`} />
            <span>{automationEnabled ? 'AI: ON' : 'AI: PAUSED'}</span>
          </button>

          {/* Bridge indicator */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition ${
              connected
                ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/70 border-rose-500/40 text-rose-300'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-rose-500'
              }`}
            />
            <span>{connected ? 'Bridge 7483' : 'Bridge Offline'}</span>
          </div>

          <button
            onClick={() => chrome.runtime.openOptionsPage()}
            className="btn-tactile p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Open Options"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Scrollable Canvas */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Task Creator Card */}
        <div className="bg-gradient-to-b from-[#0f172a]/90 to-[#0a101f]/90 border border-slate-800/90 rounded-2xl p-4 shadow-xl space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-blue-400" />
              Natural Language Mission
            </label>

            {/* Mode & Cursor Speed Controls */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const next = !trustedCdpMode;
                  setTrustedCdpMode(next);
                  chrome.storage.local.set({ trustedCdpMode: next });
                }}
                className={`px-2 py-1 rounded-lg border text-[9px] font-bold uppercase transition ${
                  trustedCdpMode
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                    : 'bg-[#060a12] border-slate-800 text-slate-400'
                }`}
                title="Trusted CDP Input: Uses real mouse & keyboard events."
              >
                Trusted CDP Input: {trustedCdpMode ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = cursorSpeed === 'natural' ? 'demo' : cursorSpeed === 'demo' ? 'fast' : 'natural';
                  setCursorSpeed(next);
                  chrome.storage.local.set({ cursorSpeed: next });
                }}
                className="px-2 py-1 rounded-lg bg-[#060a12] border border-slate-800 text-[9px] font-bold uppercase text-cyan-300 hover:border-cyan-500/50 transition"
                title="Cycle Human Cursor Speed (Natural / Demo Slow / Fast)"
              >
                Cursor: {cursorSpeed}
              </button>
              <div className="flex items-center gap-1 bg-[#060a12] p-1 rounded-xl border border-slate-800">
              {(['manual', 'assisted', 'auto'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`btn-tactile px-2.5 py-1 rounded-lg capitalize text-[10px] font-bold transition-all duration-200 ${
                    mode === m
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {m}
                </button>
              ))}
              </div>
            </div>
          </div>
          <p className="text-[10px] text-slate-400">
            Trusted CDP Input: Uses real mouse &amp; keyboard events.
          </p>

          {/* Textarea */}
          <div className="relative">
            <textarea
              value={taskPrompt}
              onChange={(e) => setTaskPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  handleStart();
                }
              }}
              placeholder="Give instructions to your browser AI (e.g., 'Open Google, search Java DSA tutorials, click top 3 results, extract titles & write a comparison report')..."
              rows={3}
              className="w-full bg-[#060a12]/90 border border-slate-700/80 rounded-xl p-3 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/50 resize-none transition-all leading-relaxed"
            />
            <div className="flex justify-between items-center px-1 mt-1.5 text-[10px] text-slate-500">
              <span className="flex items-center gap-1">
                <Command className="w-3 h-3 text-slate-500" /> Press <kbd className="font-mono bg-slate-800 px-1 py-0.5 rounded text-slate-400">Ctrl+Enter</kbd> to launch
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setVoiceLang(voiceLang === 'en-IN' ? 'hi-IN' : 'en-IN')}
                  className="px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700/80 text-[9px] font-bold text-slate-300 hover:text-cyan-300 transition"
                  title="Switch Voice Recognition Language (English / Hindi)"
                >
                  {voiceLang === 'en-IN' ? 'EN' : 'HI'}
                </button>
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold transition ${
                    isListening
                      ? 'bg-rose-950/80 border-rose-500/60 text-rose-300 animate-pulse'
                      : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40'
                  }`}
                  title={isListening ? 'Stop Voice Input' : 'Speak Mission (Hindi / English)'}
                >
                  {isListening ? <MicOff className="w-3 h-3 text-rose-400" /> : <Mic className="w-3 h-3 text-cyan-400" />}
                  <span>{isListening ? 'Listening...' : 'Voice'}</span>
                </button>
                <span>{taskPrompt.length} chars</span>
              </div>
            </div>
          </div>

          {/* Quick Prompt Chips + Custom Saved Macros (Zero Emojis, pure vector icons) */}
          <div className="space-y-1.5 pt-1">
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => setTaskPrompt(item.prompt)}
                  className="chip-tactile text-[10px] text-slate-300 hover:text-cyan-300 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-cyan-500/40 px-2.5 py-1.5 rounded-lg transition-all text-left truncate max-w-full flex items-center gap-1.5"
                >
                  <Sparkles className="w-3 h-3 text-cyan-400 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
              {customMacros.map((macro) => (
                <div
                  key={macro.id}
                  className="chip-tactile text-[10px] text-emerald-200 bg-emerald-950/40 hover:bg-emerald-950/70 border border-emerald-500/40 px-2 py-1 rounded-lg transition-all flex items-center gap-1.5 max-w-full"
                >
                  <button
                    type="button"
                    onClick={() => setTaskPrompt(macro.prompt)}
                    className="flex items-center gap-1 truncate text-left"
                    title={macro.prompt}
                  >
                    <Bookmark className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="truncate">{macro.label}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteMacro(macro.id)}
                    className="text-slate-400 hover:text-rose-400 shrink-0"
                    title="Delete Macro"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  if (!showMacroForm && taskPrompt.trim()) {
                    setMacroPrompt(taskPrompt.trim());
                  }
                  setShowMacroForm(!showMacroForm);
                }}
                className="chip-tactile text-[10px] text-cyan-300 bg-cyan-950/40 hover:bg-cyan-950/70 border border-cyan-500/40 px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>Add Macro</span>
              </button>
            </div>

            {showMacroForm && (
              <div className="p-2.5 rounded-xl bg-[#060a12]/90 border border-cyan-500/30 space-y-2">
                <input
                  type="text"
                  value={macroLabel}
                  onChange={(e) => setMacroLabel(e.target.value)}
                  placeholder="Macro label (e.g., Check GitHub PRs)"
                  className="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
                <textarea
                  value={macroPrompt}
                  onChange={(e) => setMacroPrompt(e.target.value)}
                  placeholder="Macro instruction prompt..."
                  rows={2}
                  className="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 resize-none"
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowMacroForm(false)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveMacro}
                    disabled={!macroLabel.trim() || !macroPrompt.trim()}
                    className="px-3 py-1 rounded-lg text-[10px] font-bold bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-40"
                  >
                    Save Macro
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Execution Controls */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleStart}
              disabled={isRunning || !taskPrompt.trim()}
              className="btn-tactile flex-1 py-2.5 px-4 rounded-xl font-bold text-xs bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-600/30 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
            >
              <Play className={`w-3.5 h-3.5 ${isRunning ? 'animate-pulse text-cyan-300' : ''}`} />
              <span>{isRunning ? `Running (${elapsedSeconds}s)...` : connected ? 'Send to AI Agent' : 'Execute Mission'}</span>
            </button>

            <button
              onClick={handleStop}
              className="btn-tactile py-2.5 px-4 rounded-xl font-bold text-xs bg-rose-950/80 hover:bg-rose-900 border border-rose-500/50 text-rose-200 transition-all flex items-center gap-1.5 shadow-md shadow-rose-950/50"
            >
              <Square className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
              <span>Stop</span>
            </button>
          </div>

          {humanTakeoverActive && (
            <div className="p-2.5 rounded-xl text-[11px] font-medium border bg-amber-950/50 border-amber-500/40 text-amber-300 flex items-center gap-2">
              <Hand className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Human activity detected — AI politely yielding</span>
            </div>
          )}

          {dispatchBanner && (
            <div
              className={`p-2.5 rounded-xl text-[11px] font-medium border flex items-center justify-between gap-2 animate-in fade-in duration-200 ${
                dispatchBanner.tone === 'success'
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                  : dispatchBanner.tone === 'error'
                  ? 'bg-rose-950/50 border-rose-500/40 text-rose-300'
                  : 'bg-cyan-950/50 border-cyan-500/40 text-cyan-300'
              }`}
            >
              <span className="truncate">{dispatchBanner.text}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                {micPermissionNeeded && (
                  <button
                    type="button"
                    onClick={() => {
                      chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html?mic=1') });
                    }}
                    className="px-2 py-0.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-bold"
                  >
                    Enable Mic
                  </button>
                )}
                <button
                  onClick={() => {
                    setDispatchBanner(null);
                    setMicPermissionNeeded(false);
                  }}
                  className="text-slate-400 hover:text-white shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Live Viewport Snapshot Preview Card */}
        <div className="bg-[#0b101e] border border-slate-800/90 rounded-2xl p-3.5 shadow-xl space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Camera className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Live Viewport Snapshot
              </span>
            </div>
            <button
              onClick={captureLivePreview}
              disabled={isPreviewLoading}
              className="btn-tactile flex items-center gap-1 text-[10px] font-semibold text-cyan-400 hover:text-cyan-300 bg-cyan-950/60 px-2 py-1 rounded-lg border border-cyan-500/30 transition disabled:opacity-50"
              title="Capture Live Viewport Preview"
            >
              <RefreshCw className={`w-3 h-3 ${isPreviewLoading ? 'animate-spin' : ''}`} />
              <span>{isPreviewLoading ? 'Capturing...' : 'Capture View'}</span>
            </button>
          </div>

          {previewUrl ? (
            <div className="relative rounded-xl overflow-hidden border border-slate-700/80 shadow-md group">
              <img src={previewUrl} alt="Target Tab Snapshot" className="w-full h-32 object-cover object-top transition group-hover:scale-105" />
              <div className="absolute bottom-1 right-1.5 bg-black/80 px-1.5 py-0.5 rounded text-[9px] text-slate-300 font-mono">
                Live Viewport
              </div>
            </div>
          ) : (
            <div
              onClick={captureLivePreview}
              className="h-16 rounded-xl border border-dashed border-slate-800 hover:border-cyan-500/50 bg-[#060a12]/50 flex flex-col items-center justify-center gap-1 cursor-pointer text-slate-500 hover:text-cyan-400 transition group"
            >
              <Eye className="w-4 h-4 text-slate-600 group-hover:text-cyan-400 transition-colors" />
              <span className="text-[11px] font-medium">Click to inspect active viewport</span>
            </div>
          )}
        </div>

        {/* Mission History & Replay Dashboard */}
        {history.length > 0 && (
          <div className="bg-[#0b101e] border border-slate-800/90 rounded-2xl p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider hover:text-cyan-300 transition"
              >
                <History className="w-4 h-4 text-purple-400" />
                <span>Mission History ({history.length})</span>
                <span className="text-[10px] text-slate-500 font-normal">
                  {showHistory ? '▲ Hide' : '▼ View'}
                </span>
              </button>
              <button
                onClick={() => {
                  setHistory([]);
                  chrome.storage.local.set({ missionHistory: [] });
                }}
                className="text-[10px] text-slate-500 hover:text-slate-300"
              >
                Clear
              </button>
            </div>

            {showHistory && (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl bg-[#060a12]/80 border border-slate-800 flex items-center justify-between gap-2 text-xs hover:border-slate-700 transition"
                  >
                    <div className="truncate min-w-0 flex-1">
                      <div className="text-white truncate font-medium">{item.prompt}</div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                        <span className={`px-1.5 py-0.2 rounded font-bold uppercase ${
                          item.status === 'success'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : item.status === 'stopped'
                            ? 'bg-amber-950 text-amber-400 border border-amber-800'
                            : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}>
                          {item.status}
                        </span>
                        <span>{item.durationSeconds}s</span>
                        <span>•</span>
                        <span>{item.stepCount} steps</span>
                        <span>•</span>
                        <span>{item.timestamp}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleReplayMission(item)}
                      className="btn-tactile p-1.5 rounded-lg bg-purple-950/60 hover:bg-purple-900 border border-purple-800/60 text-purple-300 text-[10px] font-bold flex items-center gap-1 shrink-0"
                      title="Load and replay this mission"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Replay</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Downloaded Files Direct List */}
        {downloads.length > 0 && (
          <div className="bg-[#0b101e] border border-slate-800/90 rounded-2xl p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowDownloads(!showDownloads)}
                className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider hover:text-cyan-300 transition"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Downloaded Files ({downloads.length})</span>
                <span className="text-[10px] text-slate-500 font-normal">
                  {showDownloads ? '▲ Hide' : '▼ View'}
                </span>
              </button>
              <button
                onClick={refreshDownloads}
                className="btn-tactile text-[10px] text-slate-400 hover:text-emerald-300 transition"
                title="Refresh Downloads"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>

            {showDownloads && (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {downloads.map((dl) => (
                  <div
                    key={dl.id}
                    className="p-2 rounded-xl bg-[#060a12]/80 border border-slate-800 flex items-center justify-between gap-2 text-xs hover:border-slate-700 transition"
                  >
                    <div className="truncate min-w-0 flex-1">
                      <div className="text-slate-200 truncate font-medium flex items-center gap-1.5">
                        <FileText className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span className="truncate">{dl.filename}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {dl.fileSize > 0 ? `${Math.round(dl.fileSize / 1024)} KB` : 'Unknown size'} • {dl.state}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => chrome.downloads?.show?.(dl.id)}
                        className="btn-tactile px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold"
                        title="Show in Folder"
                      >
                        Folder
                      </button>
                      <button
                        onClick={() => chrome.downloads?.open?.(dl.id)}
                        className="btn-tactile px-2 py-1 rounded bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-800/60 text-emerald-300 text-[10px] font-semibold"
                        title="Open File"
                      >
                        Open
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Managed Chrome Tabs List */}
        <div className="bg-[#0b101e] border border-slate-800/90 rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Managed Tabs ({tabs.length})
              </span>
            </div>
            <button
              onClick={refreshTabs}
              className="btn-tactile flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition"
              title="Refresh Tab List"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>

          {/* Locked Target Banner */}
          {lockedTabId && tabs.some(t => t.id === lockedTabId) && (
            <div className="flex items-center justify-between p-2 rounded-xl bg-cyan-950/40 border border-cyan-500/40 text-cyan-300 text-xs shadow-inner">
              <span className="flex items-center gap-1.5 truncate">
                <Crosshair className="w-3.5 h-3.5 text-cyan-400 shrink-0 animate-pulse" />
                <span className="text-[11px] truncate">
                  AI Target Locked: <b className="text-white">{tabs.find(t => t.id === lockedTabId)?.title || 'Target Tab'}</b>
                </span>
              </span>
              <button
                onClick={() => toggleLockTab(lockedTabId)}
                className="btn-tactile text-[10px] bg-cyan-900/60 hover:bg-cyan-800 text-cyan-200 px-2 py-0.5 rounded border border-cyan-500/30 transition shrink-0 ml-2"
                title="Unlock Target Tab"
              >
                Unlock
              </button>
            </div>
          )}

          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => handleSwitchTab(tab.id)}
                className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer group ${
                  lockedTabId === tab.id
                    ? 'bg-cyan-950/30 border-cyan-500/60 shadow-sm shadow-cyan-500/10 text-white'
                    : tab.active
                    ? 'bg-blue-950/40 border-blue-500/50 shadow-sm shadow-blue-500/10 text-white'
                    : 'bg-[#060a12]/60 border-slate-800/80 text-slate-300 hover:border-slate-700 hover:bg-slate-900/60'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate flex-1 pr-2">
                  {tab.favIconUrl ? (
                    <img src={tab.favIconUrl} alt="" className="w-4 h-4 rounded-sm shrink-0" />
                  ) : (
                    <Radio className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  )}
                  <div className="truncate">
                    <div className="text-xs font-semibold truncate group-hover:text-blue-300 transition-colors">
                      {tab.title || 'Untitled Tab'}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono truncate">{tab.url}</div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Pin / Target Lock Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (tab.id) toggleLockTab(tab.id);
                    }}
                    className={`btn-tactile p-1 rounded transition ${
                      lockedTabId === tab.id
                        ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50'
                        : 'text-slate-500 hover:text-cyan-400 hover:bg-cyan-950/40'
                    }`}
                    title={lockedTabId === tab.id ? 'Unlock this Target Tab' : 'Lock as Automation Target Tab'}
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                  </button>

                  {lockedTabId === tab.id ? (
                    <span className="text-[9px] font-black uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.5 rounded-full">
                      Target
                    </span>
                  ) : tab.active ? (
                    <span className="text-[9px] font-black uppercase bg-blue-500/20 text-blue-300 border border-blue-500/40 px-1.5 py-0.5 rounded-full">
                      Active
                    </span>
                  ) : null}

                  <button
                    onClick={(e) => handleCloseTab(tab.id, e)}
                    className="btn-tactile p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition"
                    title="Close Tab"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Live Console & Network Error Drawer */}
        <div className="bg-[#0b101e] border border-slate-800/90 rounded-2xl p-4 shadow-xl space-y-2.5">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                const next = !showDevDrawer;
                setShowDevDrawer(next);
                if (next) refreshDevTelemetry();
              }}
              className="flex items-center gap-2 text-left"
            >
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Console & Network Errors
              </span>
              <span className="px-1.5 py-0.5 rounded bg-rose-950/70 border border-rose-500/40 text-[10px] font-bold text-rose-300">
                {devConsoleLogs.filter((l) => l.level === 'error').length + devNetworkErrors.length}
              </span>
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={refreshDevTelemetry}
                className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                title="Attach & Refresh Page Telemetry"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Sync</span>
              </button>
              <button
                type="button"
                onClick={clearDevTelemetry}
                className="text-[10px] font-semibold text-slate-500 hover:text-slate-300"
              >
                Clear
              </button>
            </div>
          </div>

          {showDevDrawer && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-1 bg-[#060a12] p-1 rounded-xl border border-slate-800 text-[10px] font-bold">
                {(['all', 'console', 'network'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setDevFilter(tab)}
                    className={`flex-1 py-1 rounded-lg uppercase transition ${
                      devFilter === tab
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 font-mono text-[10px]">
                {devFilter !== 'network' &&
                  devConsoleLogs
                    .filter((l) => l.level === 'error' || l.level === 'warn')
                    .slice(-20)
                    .reverse()
                    .map((item, idx) => (
                      <div
                        key={`c-${idx}`}
                        className="p-2 rounded-lg bg-[#060a12]/90 border border-rose-500/30 text-rose-200 flex items-start gap-2"
                      >
                        <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1 break-all">
                          <span className="uppercase font-bold text-[9px] text-rose-400 mr-1.5">[{item.level}]</span>
                          <span>{item.message}</span>
                        </div>
                      </div>
                    ))}
                {devFilter !== 'console' &&
                  devNetworkErrors
                    .slice(-20)
                    .reverse()
                    .map((item, idx) => (
                      <div
                        key={`n-${idx}`}
                        className="p-2 rounded-lg bg-[#060a12]/90 border border-amber-500/30 text-amber-200 flex items-start gap-2"
                      >
                        <WifiOff className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1 break-all">
                          <span className="font-bold text-amber-400 mr-1.5">
                            {item.method} {item.status || 'ERR'}
                          </span>
                          <span className="text-slate-300">{item.url}</span>
                        </div>
                      </div>
                    ))}
                {devConsoleLogs.filter((l) => l.level === 'error' || l.level === 'warn').length === 0 &&
                  devNetworkErrors.length === 0 && (
                    <div className="py-4 text-center text-slate-500 italic font-sans text-xs">
                      No console or network errors captured yet. Click Sync on an active webpage.
                    </div>
                  )}
              </div>
            </div>
          )}
        </div>

        {/* Live MCP & Agent Telemetry Stream */}
        <div className="bg-[#0b101e] border border-slate-800/90 rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Live Agent Action Stream
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowExportModal(true)}
                disabled={logs.length === 0}
                className="btn-tactile flex items-center gap-1 text-[10px] font-bold text-cyan-400 hover:text-cyan-300 disabled:opacity-40 transition"
                title="Export session actions as Playwright/Puppeteer script"
              >
                <Code className="w-3 h-3" />
                <span>Export Script</span>
              </button>
              <button
                onClick={() => setLogs([])}
                className="text-[10px] font-semibold text-slate-500 hover:text-slate-300 transition"
              >
                Clear Feed
              </button>
            </div>
          </div>

          <div
            ref={logContainerRef}
            className="space-y-1.5 max-h-48 overflow-y-auto pr-1 font-mono text-[11px]"
          >
            {logs.length === 0 ? (
              <div className="py-8 text-center text-slate-600 text-xs italic">
                No MCP actions dispatched yet. As AI agents interact with Chrome, real-time telemetry will appear here.
              </div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="p-2 rounded-xl bg-[#060a12]/80 border border-slate-800/80 flex items-start justify-between gap-2.5 animate-in fade-in duration-200"
                >
                  <div className="flex items-start gap-2 truncate flex-1">
                    <span
                      className={`font-black text-[9px] uppercase px-1.5 py-0.5 rounded shrink-0 ${
                        log.status === 'success'
                          ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30'
                          : log.status === 'pending'
                          ? 'bg-blue-950/80 text-blue-400 border border-blue-500/30 animate-pulse'
                          : 'bg-rose-950/80 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {log.category || 'MCP'}
                    </span>
                    <span className="text-slate-300 truncate font-sans text-xs">{log.action}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 shrink-0 font-mono">{log.timestamp}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Script Exporter Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm p-4 flex flex-col justify-end animate-in fade-in duration-200">
          <div className="bg-[#0b101e] border border-slate-800 rounded-2xl p-4 shadow-2xl space-y-3 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-white uppercase">One-Click Script Exporter</span>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Format Selector Tabs */}
            <div className="flex items-center gap-1 bg-[#060a12] p-1 rounded-xl border border-slate-800 text-[10px] font-bold">
              {[
                { id: 'playwright-ts', label: 'Playwright (TS)' },
                { id: 'playwright-py', label: 'Playwright (Py)' },
                { id: 'puppeteer-js', label: 'Puppeteer (JS)' },
                { id: 'drishti-cli', label: 'Drishti CLI' },
              ].map((fmt) => (
                <button
                  key={fmt.id}
                  onClick={() => setExportFormat(fmt.id as ExportFormat)}
                  className={`flex-1 py-1 rounded-lg text-center transition ${
                    exportFormat === fmt.id
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {fmt.label}
                </button>
              ))}
            </div>

            {/* Code Preview */}
            <pre className="flex-1 p-3 rounded-xl bg-[#060a12] border border-slate-800/80 text-cyan-300 font-mono text-[10px] leading-relaxed overflow-y-auto whitespace-pre select-all max-h-60">
              {generatedScript}
            </pre>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleCopyExportCode}
                className="btn-tactile flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? 'Copied to Clipboard!' : 'Copy Code'}</span>
              </button>

              <button
                onClick={handleDownloadExportCode}
                className="btn-tactile py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 border border-slate-700"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer System Status Bar */}
      <div className="px-4 py-2.5 bg-[#0a0f1c] border-t border-slate-800/90 text-[11px] text-slate-400 flex justify-between items-center">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Native WebSocket Engine
        </span>
        <span className="font-mono text-slate-500">127.0.0.1:7483</span>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<SidePanelApp />);
