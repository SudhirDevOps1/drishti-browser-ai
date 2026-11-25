import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { marked } from 'marked';
import {
  Activity,
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Cpu,
  ExternalLink,
  Eye,
  GitBranch,
  GitCommit,
  Github,
  Layers,
  Lock,
  Menu,
  Mic,
  MousePointer2,
  Package,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Terminal,
  Wifi,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { HeroCanvas } from './components/HeroCanvas';
import siteData from './generated/site-data.json';

gsap.registerPlugin(ScrollTrigger);

/* ─── Types ─────────────────────────────────────────────── */
interface DocEntry { id: string; title: string; category: string; file: string; content: string; }
interface McpToolEntry { name: string; category: string; description: string; }
interface SiteData {
  version: string;
  repoUrl: string;
  docs: DocEntry[];
  mcpTools?: McpToolEntry[];
  changelog?: string;
  generatedAt: string;
}

const data = siteData as SiteData;

/* ─── Static data ────────────────────────────────────────── */
const STATS = [
  { value: data.mcpTools?.length || 37, suffix: '', label: 'MCP Tools', icon: Zap },
  { value: 19, suffix: '', label: 'Unit Tests', icon: Check },
  { value: 4, suffix: '', label: 'E2E Playwright', icon: Play },
  { value: data.docs.length || 10, suffix: '', label: 'Doc Guides', icon: BookOpen },
  { value: 7, suffix: '', label: 'Packages', icon: Package },
  { value: 5, suffix: '+', label: 'AI Agents', icon: Star },
];

const FEATURES = [
  {
    icon: MousePointer2,
    title: 'Shadow DOM Bezier Cursor',
    badge: 'Human-Like Motion',
    color: 'cyan',
    desc: 'Cubic Bezier trajectories with Fitts law easing, fading SVG motion trail, 3px element glow, and concentric click ripples — invisible to anti-bot systems.',
    highlight: 'cubic-bezier(0.22, 1, 0.36, 1)',
  },
  {
    icon: Mic,
    title: 'Voice Commands & Macros',
    badge: 'EN / HI Support',
    color: 'violet',
    desc: 'Speak missions in English or Hindi in the Control Deck. Save reusable 1-click macro chips locally — no cloud dependency.',
    highlight: 'Web Speech API',
  },
  {
    icon: Terminal,
    title: 'Live Console & Network Drawer',
    badge: 'Zero DevTools',
    color: 'emerald',
    desc: 'Auto-attaches MAIN-world hooks to capture console errors and 4xx/5xx fetch/XHR failures live inside the Sidepanel — no DevTools required.',
    highlight: 'MAIN-world injection',
  },
  {
    icon: Cpu,
    title: '37 Official MCP Tools',
    badge: 'Universal Agents',
    color: 'cyan',
    desc: 'Works with Antigravity, Claude Code, Cursor, OpenCode, and Codex over strict Zod v4 validated MCP stdio schemas.',
    highlight: 'Zod v4 validated',
  },
  {
    icon: ShieldCheck,
    title: 'MV3 Hardened Security',
    badge: 'Zero eval() Sinks',
    color: 'rose',
    desc: 'Localhost 127.0.0.1 WebSocket bridge with 64-char timing-safe token, domain allowlist/blocklist, URL protocol enforcement, and origin checks.',
    highlight: 'ws://127.0.0.1:7483',
  },
  {
    icon: GitBranch,
    title: 'Enterprise CI Pipeline',
    badge: 'Alpha / Beta / RC / Stable',
    color: 'amber',
    desc: 'Husky + Commitlint + Release Please + SSOT version scripts + Playwright Chromium smoke tests on every push to main.',
    highlight: 'GitHub Actions',
  },
];

const PACKAGES = [
  { name: '@drishti/shared-types',      role: 'Bridge, MCP & Security Schemas',       color: 'cyan' },
  { name: '@drishti/permission-engine', role: 'Domain Allowlist / Blocklist Policy',  color: 'rose' },
  { name: '@drishti/dom-engine',        role: 'Ad-Filtered Semantic DOM Discovery',   color: 'emerald' },
  { name: '@drishti/visual-engine',     role: 'Viewport Capture & Visual Diffing',    color: 'violet' },
  { name: '@drishti/browser-core',      role: 'Controller, Observer & Action Exec',   color: 'cyan' },
  { name: '@drishti/workflow-engine',   role: 'Task Queue & Multi-Step Orchestration',color: 'amber' },
  { name: '@drishti/mcp-tools',         role: '37 MCP Tool Definitions (stdio)',      color: 'sky' },
];

const CHANNELS = [
  { tag: 'x.x.x-alpha.1', stage: 'Alpha',  desc: 'Internal dev & bridge testing',             dot: 'bg-purple-400' },
  { tag: 'x.x.x-beta.1',  stage: 'Beta',   desc: 'Early testers validating real workflows',   dot: 'bg-blue-400' },
  { tag: 'x.x.x-rc.1',    stage: 'RC',     desc: 'Final freeze + Playwright E2E gate',        dot: 'bg-yellow-400' },
  { tag: 'x.x.x',         stage: 'Stable', desc: 'SHA-256 artifacts + categorized CHANGELOG', dot: 'bg-emerald-400' },
];

type GalleryCategory = 'All' | 'Extension UI' | 'Motion & Voice' | 'Security & CI';

interface GalleryItem {
  id: string;
  title: string;
  category: Exclude<GalleryCategory, 'All'>;
  desc: string;
  image?: string;
  specs: string[];
  tags: string[];
  border: string;
  glow: string;
}

const GALLERY_ITEMS: GalleryItem[] = [
  {
    id: 'sidepanel',
    title: 'Control Deck Sidepanel (Real UI)',
    category: 'Extension UI',
    image: './gallery/sidepanel-control-deck.png',
    desc: 'Actual built MV3 Sidepanel UI with two-way AI mission dispatch, EN/HI Voice toggle, 1-click macros, and live error drawer.',
    specs: ['Captured directly from Chromium MV3 build', 'Zero-emoji lucide-react icons', 'Two-way WebSocket mission queue'],
    tags: ['Real Screenshot', 'MV3 Sidepanel', 'React 18'],
    border: 'border-cyan-500/30',
    glow: 'from-cyan-500/15 to-blue-600/10',
  },
  {
    id: 'popup',
    title: 'Extension Popup Quick Deck (Real UI)',
    category: 'Extension UI',
    image: './gallery/popup-quick-status.png',
    desc: 'Instant popup showing live 127.0.0.1:7483 bridge status, SSOT version badge, and quick Control Deck launch.',
    specs: ['Captured directly from Chromium MV3 build', 'Live bridge heartbeat indicator', 'SSOT v' + data.version + ' badge'],
    tags: ['Real Screenshot', 'Popup UI', 'Tailwind'],
    border: 'border-sky-500/30',
    glow: 'from-sky-500/15 to-indigo-600/10',
  },
  {
    id: 'options',
    title: 'Permissions & Settings (Real UI)',
    category: 'Extension UI',
    image: './gallery/options-permissions.png',
    desc: 'Dedicated Options page for managing domain allowlists, blocklists, automation scope, and security controls.',
    specs: ['Captured directly from Chromium MV3 build', 'Domain allowlist & blocklist policy', 'Per-action safety configuration'],
    tags: ['Real Screenshot', 'Options Page', 'Security'],
    border: 'border-emerald-500/30',
    glow: 'from-emerald-500/15 to-teal-600/10',
  },
  {
    id: 'bezier',
    title: 'Shadow DOM Bezier Cursor',
    category: 'Motion & Voice',
    desc: 'Smooth human-like cubic Bezier trajectories with fading SVG trail, target element highlight ring, and concentric click ripple.',
    specs: ['Isolated Shadow DOM overlay', 'Fitts law easing curve', 'Auto-cleanup after idle'],
    tags: ['Shadow DOM', 'SVG Trail', 'GSAP'],
    border: 'border-cyan-500/30',
    glow: 'from-cyan-500/15 to-sky-600/10',
  },
  {
    id: 'voice',
    title: 'Voice Commands (EN/HI) & Macros',
    category: 'Motion & Voice',
    desc: 'Speak browser commands in English or Hindi and save repeatable multi-step workflows as 1-click macro chips.',
    specs: ['Bilingual en-IN / hi-IN recognition', 'Local chrome.storage.local macros', 'Instant dispatch to MCP bridge'],
    tags: ['Web Speech', 'EN / HI', 'Macros'],
    border: 'border-violet-500/30',
    glow: 'from-violet-500/15 to-purple-600/10',
  },
  {
    id: 'telemetry',
    title: 'Live Console & Network Drawer',
    category: 'Security & CI',
    desc: 'MAIN-world hooks stream uncaught errors, console.error, and 4xx/5xx fetch/XHR failures straight into the Sidepanel.',
    specs: ['Zero DevTools required', 'Captures HTTP 4xx/5xx status', 'One-click Send Error to AI'],
    tags: ['MAIN-world', 'Fetch/XHR', 'Telemetry'],
    border: 'border-rose-500/30',
    glow: 'from-rose-500/15 to-pink-600/10',
  },
  {
    id: 'security',
    title: '127.0.0.1 Token Auth & MV3 Guard',
    category: 'Security & CI',
    desc: '64-character timing-safe session token, strict origin allowlist, protocol enforcement, and zero eval() sinks.',
    specs: ['Localhost-only ws://127.0.0.1:7483', 'Zod v4 strict schema validation', 'Automated security sink scan'],
    tags: ['Zod v4', '127.0.0.1', 'Zero eval()'],
    border: 'border-amber-500/30',
    glow: 'from-amber-500/15 to-orange-600/10',
  },
  {
    id: 'ci',
    title: 'Playwright E2E & Release Pipeline',
    category: 'Security & CI',
    desc: 'Real Chromium extension smoke tests, SSOT version verification, and automated Release Please changelogs on every push.',
    specs: ['4 Playwright Chromium E2E checks', '19 Vitest unit tests', 'SSOT version sync across 12 workspaces'],
    tags: ['Playwright', 'Vitest', 'Release Please'],
    border: 'border-emerald-500/30',
    glow: 'from-emerald-500/15 to-teal-600/10',
  },
];

const TERMINAL_LINES = [
  { delay: 0,    text: '$ pnpm install', color: 'text-cyan-300' },
  { delay: 450,  text: '✓ 847 packages resolved', color: 'text-emerald-400' },
  { delay: 900,  text: '$ pnpm -r run build', color: 'text-cyan-300' },
  { delay: 1400, text: '✓ @drishti/shared-types & core packages built', color: 'text-slate-400' },
  { delay: 1900, text: '✓ @drishti/mcp-tools (37 tools) built', color: 'text-slate-400' },
  { delay: 2400, text: '✓ chrome-extension: 1583 modules transformed', color: 'text-emerald-400' },
  { delay: 2900, text: '$ pnpm test', color: 'text-cyan-300' },
  { delay: 3300, text: '✓ 19/19 unit tests passed (3 files)', color: 'text-emerald-400' },
  { delay: 3750, text: '$ pnpm test:e2e', color: 'text-cyan-300' },
  { delay: 4200, text: '✓ 4/4 Playwright Chromium E2E passed', color: 'text-emerald-400' },
  { delay: 4650, text: '🚀 All checks green — v' + data.version + ' live!', color: 'text-cyan-200' },
];

const COLOR_MAP: Record<string, string> = {
  cyan:    'text-cyan-400 bg-cyan-950/60 border-cyan-500/30',
  violet:  'text-violet-400 bg-violet-950/60 border-violet-500/30',
  emerald: 'text-emerald-400 bg-emerald-950/60 border-emerald-500/30',
  rose:    'text-rose-400 bg-rose-950/60 border-rose-500/30',
  amber:   'text-amber-400 bg-amber-950/60 border-amber-500/30',
  sky:     'text-sky-400 bg-sky-950/60 border-sky-500/30',
};

/* ─── Gallery Preview Renderer ───────────────────────────── */
function GalleryPreview({ item }: { item: GalleryItem }) {
  if (item.image) {
    return (
      <img
        src={item.image}
        alt={item.title}
        loading="lazy"
        className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
      />
    );
  }

  switch (item.id) {
    case 'bezier':
      return (
        <div className="relative h-full w-full overflow-hidden p-3">
          <svg viewBox="0 0 240 120" className="w-full h-full">
            <defs>
              <linearGradient id="trailGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#00f2fe" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#00f2fe" stopOpacity="1" />
              </linearGradient>
            </defs>
            <path
              d="M 24 92 C 80 18, 150 105, 206 32"
              fill="none"
              stroke="url(#trailGrad)"
              strokeWidth="2.5"
              className="animate-packet-flow"
            />
            <circle cx="24" cy="92" r="4" fill="#38bdf8" opacity="0.5" />
            <circle cx="206" cy="32" r="14" fill="none" stroke="#00f2fe" strokeOpacity="0.45" strokeWidth="1.5" />
            <circle cx="206" cy="32" r="5" fill="#00f2fe" />
          </svg>
          <span className="absolute bottom-2 right-3 text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-400 text-[#050914] font-black">
            AI CLICK
          </span>
        </div>
      );
    case 'telemetry':
      return (
        <div className="p-3 h-full flex flex-col justify-center gap-1.5 font-mono text-[10px]">
          <div className="flex items-center justify-between px-2 py-1 rounded bg-rose-950/60 border border-rose-500/30 text-rose-300">
            <span>ERR TypeError: undefined</span>
            <span className="text-[9px] text-rose-400">console</span>
          </div>
          <div className="flex items-center justify-between px-2 py-1 rounded bg-amber-950/50 border border-amber-500/30 text-amber-300">
            <span>500 POST /api/checkout</span>
            <span className="text-[9px] text-amber-400">fetch</span>
          </div>
          <div className="flex items-center justify-between px-2 py-1 rounded bg-slate-900 border border-slate-700 text-emerald-300">
            <span>200 GET /health</span>
            <span className="text-[9px] text-emerald-400">xhr</span>
          </div>
        </div>
      );
    case 'voice':
      return (
        <div className="p-3 h-full flex flex-col justify-between">
          <div className="flex items-center justify-center gap-1 pt-2">
            {[16, 28, 38, 22, 42, 30, 18, 34, 24, 14].map((h, i) => (
              <span
                key={i}
                style={{ height: `${h}px`, animationDelay: `${i * 0.08}s` }}
                className="w-1.5 rounded-full bg-gradient-to-t from-violet-500 to-cyan-400 animate-pulse"
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-1 justify-center">
            <span className="px-2 py-0.5 rounded-full bg-violet-950/70 border border-violet-500/40 text-[9px] text-violet-200 font-semibold">
              "Naya tab kholo"
            </span>
            <span className="px-2 py-0.5 rounded-full bg-cyan-950/70 border border-cyan-500/40 text-[9px] text-cyan-200 font-semibold">
              Macro: Run Audit
            </span>
          </div>
        </div>
      );
    case 'security':
      return (
        <div className="p-3 h-full flex flex-col justify-center gap-2 font-mono text-[10px]">
          <div className="flex items-center justify-between bg-slate-900 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
            <span className="text-amber-300 flex items-center gap-1">
              <Lock className="w-3 h-3" /> 127.0.0.1:7483
            </span>
            <span className="text-emerald-400">Token OK</span>
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-400 truncate">
            token: 9f8a2c…e41b (64-char SHA)
          </div>
        </div>
      );
    default:
      return (
        <div className="p-3 h-full flex flex-col justify-center gap-1.5 font-mono text-[10px]">
          {['popup.html · 0 errors', 'sidepanel.html · 0 errors', 'options.html · 0 errors', 'Live HTTP fixture · OK'].map(line => (
            <div key={line} className="flex items-center gap-1.5 text-emerald-300">
              <Check className="w-3 h-3 text-emerald-400 shrink-0" />
              <span className="truncate">{line}</span>
            </div>
          ))}
        </div>
      );
  }
}

/* ─── Animated counter hook ──────────────────────────────── */
function useCounter(target: number, started: boolean) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!started) return;
    let start = 0;
    const dur = 1100;
    const tick = 16;
    const steps = dur / tick;
    const inc = target / steps;
    const id = setInterval(() => {
      start += inc;
      if (start >= target) { setVal(target); clearInterval(id); }
      else setVal(Math.floor(start));
    }, tick);
    return () => clearInterval(id);
  }, [started, target]);
  return val;
}

/* ─── StatCard ───────────────────────────────────────────── */
function StatCard({ value, suffix, label, icon: Icon, started }: typeof STATS[0] & { started: boolean }) {
  const count = useCounter(value, started);
  return (
    <div className="stat-card flex flex-col items-center gap-1 bg-[#0b1222]/80 border border-slate-800 rounded-2xl p-5 neon-border group">
      <Icon className="w-5 h-5 text-cyan-400 mb-1 group-hover:animate-glow-pulse" />
      <span className="text-3xl font-black text-white tabular-nums">
        {count}{suffix}
      </span>
      <span className="text-xs text-slate-400 font-medium text-center">{label}</span>
    </div>
  );
}

/* ─── TerminalWindow ─────────────────────────────────────── */
function TerminalWindow() {
  const [visibleLines, setVisibleLines] = useState<number[]>([]);
  const [running, setRunning] = useState(false);

  const run = useCallback(() => {
    if (running) return;
    setRunning(true);
    setVisibleLines([]);
    TERMINAL_LINES.forEach((line, i) => {
      setTimeout(() => {
        setVisibleLines(prev => [...prev, i]);
        if (i === TERMINAL_LINES.length - 1) setTimeout(() => setRunning(false), 900);
      }, line.delay);
    });
  }, [running]);

  useEffect(() => { const id = setTimeout(run, 450); return () => clearTimeout(id); }, []);

  return (
    <div className="bg-[#060f1e] border border-slate-700 rounded-2xl overflow-hidden shadow-2xl shadow-black/60 neon-border">
      <div className="flex items-center justify-between px-4 py-3 bg-[#0b1a2e] border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-rose-500" />
          <span className="w-3 h-3 rounded-full bg-amber-500" />
          <span className="w-3 h-3 rounded-full bg-emerald-500" />
        </div>
        <span className="text-[11px] text-slate-400 font-mono">drishti-browser-ai — pnpm monorepo</span>
        <button
          onClick={run}
          disabled={running}
          className="px-2.5 py-1 rounded-lg bg-cyan-900/60 border border-cyan-600/40 text-[10px] text-cyan-300 font-bold hover:bg-cyan-800/60 transition disabled:opacity-40"
        >
          {running ? '▶ Running…' : '▶ Replay'}
        </button>
      </div>
      <div className="p-4 font-mono text-xs space-y-1 min-h-[260px] relative scanline overflow-hidden">
        {TERMINAL_LINES.map((line, i) => (
          <div
            key={i}
            className={`terminal-line ${visibleLines.includes(i) ? 'visible' : ''} ${line.color} leading-relaxed`}
          >
            {line.text}
          </div>
        ))}
        {running && <div className="text-cyan-400 terminal-cursor" />}
      </div>
    </div>
  );
}

/* ─── BezierPlayground ───────────────────────────────────── */
function BezierPlayground() {
  const [cursorPos, setCursorPos] = useState({ x: 64, y: 70 });
  const [cursorLabel, setCursorLabel] = useState('DRISHTI AI');
  const [activeTarget, setActiveTarget] = useState<'hover' | 'type' | 'click' | 'scroll' | null>(null);
  const [rippleKey, setRippleKey] = useState(0);
  const [demoTyped, setDemoTyped] = useState('');
  const [trail, setTrail] = useState<{ x: number; y: number }[]>([]);
  const prevPos = useRef({ x: 64, y: 70 });

  const triggerDemoAction = (action: 'hover' | 'type' | 'click' | 'scroll') => {
    setActiveTarget(action);
    const coords = {
      hover:  { x: 75,  y: 65,  label: 'HOVERING…' },
      type:   { x: 155, y: 130, label: 'TYPING…' },
      click:  { x: 268, y: 130, label: 'AI CLICK' },
      scroll: { x: 170, y: 195, label: 'SCROLL ↓400px' },
    }[action];

    const steps = 8;
    const pts: { x: number; y: number }[] = [];
    for (let s = 1; s <= steps; s++) {
      pts.push({
        x: prevPos.current.x + (coords.x - prevPos.current.x) * (s / steps),
        y: prevPos.current.y + (coords.y - prevPos.current.y) * (s / steps),
      });
    }
    setTrail(pts);
    prevPos.current = { x: coords.x, y: coords.y };

    setCursorPos({ x: coords.x, y: coords.y });
    setCursorLabel(coords.label);

    if (action === 'click') setTimeout(() => setRippleKey(k => k + 1), 360);
    if (action === 'type') {
      setDemoTyped('');
      const sample = 'Search YouTube…';
      sample.split('').forEach((ch, idx) => {
        setTimeout(() => setDemoTyped(prev => prev + ch), 300 + idx * 50);
      });
    }
  };

  return (
    <div className="bg-[#060f1e] border border-slate-700 rounded-2xl p-4 shadow-2xl neon-border">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
        <div className="flex items-center gap-2 text-xs font-bold text-white">
          <Eye className="w-3.5 h-3.5 text-cyan-400" />
          <span>Interactive Shadow DOM Bezier Cursor</span>
        </div>
        <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 animate-pulse">
          <Wifi className="w-3 h-3" /> ws://127.0.0.1:7483
        </span>
      </div>

      <div className="relative h-60 rounded-xl bg-[#040c18] border border-slate-800 overflow-hidden p-4 select-none">
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
          {trail.slice(0, -1).map((pt, i) => {
            const next = trail[i + 1];
            const opacity = (i + 1) / trail.length;
            return (
              <line
                key={i}
                x1={pt.x} y1={pt.y}
                x2={next.x} y2={next.y}
                stroke="#00f2fe"
                strokeWidth={2 * opacity}
                strokeOpacity={opacity * 0.75}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        <div className="flex items-center justify-between mb-5">
          <div className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
            <Lock className="w-3 h-3 text-emerald-500" />
            https://demo.drishti.local
          </div>
          <button
            onClick={() => triggerDemoAction('hover')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${
              activeTarget === 'hover'
                ? 'border-cyan-400 bg-cyan-950/60 text-cyan-200 shadow-[0_0_16px_rgba(0,242,254,0.4)]'
                : 'border-slate-700 bg-slate-900 text-slate-300'
            }`}
          >
            Menu (Hover)
          </button>
        </div>

        <div className="flex items-center gap-2 mt-4">
          <div
            onClick={() => triggerDemoAction('type')}
            className={`flex-1 px-3 py-2 rounded-lg border text-xs font-mono cursor-pointer transition ${
              activeTarget === 'type'
                ? 'border-cyan-400 bg-slate-900 text-cyan-200 shadow-[0_0_16px_rgba(0,242,254,0.4)]'
                : 'border-slate-700 bg-slate-900/70 text-slate-400'
            }`}
          >
            {demoTyped || <span className="text-slate-600">Click Type below…</span>}
          </div>
          <button
            onClick={() => triggerDemoAction('click')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition border ${
              activeTarget === 'click'
                ? 'border-cyan-400 bg-cyan-600 text-white shadow-[0_0_18px_rgba(0,242,254,0.6)]'
                : 'border-blue-500/40 bg-blue-600/80 text-white'
            }`}
          >
            Search
          </button>
        </div>

        <div className="mt-8 flex justify-center">
          <button
            onClick={() => triggerDemoAction('scroll')}
            className={`px-3 py-1 rounded-full text-[10px] font-bold border transition ${
              activeTarget === 'scroll'
                ? 'border-cyan-400 bg-cyan-950/60 text-cyan-200 shadow-[0_0_16px_rgba(0,242,254,0.4)]'
                : 'border-slate-800 bg-slate-900/70 text-slate-400'
            }`}
          >
            ↕ Scroll Target
          </button>
        </div>

        <div
          style={{
            left: `${cursorPos.x}px`,
            top:  `${cursorPos.y}px`,
            transition: 'left 460ms cubic-bezier(0.22,1,0.36,1), top 460ms cubic-bezier(0.22,1,0.36,1)',
          }}
          className="absolute pointer-events-none z-20"
        >
          {rippleKey > 0 && activeTarget === 'click' && (
            <span key={rippleKey} className="absolute -left-3 -top-3 w-8 h-8 rounded-full border-2 border-cyan-400 animate-ping" />
          )}
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-cyan-400/25 blur-sm" />
            <MousePointer2 className="w-5 h-5 text-cyan-400 fill-cyan-400 drop-shadow-[0_0_8px_#00f2fe] relative" />
          </div>
          <span className="ml-4 -mt-1 inline-block px-1.5 py-0.5 rounded bg-cyan-400 text-[#050914] font-mono font-black text-[9px] whitespace-nowrap shadow">
            {cursorLabel}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5 mt-3">
        {(['hover', 'type', 'click', 'scroll'] as const).map(act => (
          <button
            key={act}
            onClick={() => triggerDemoAction(act)}
            className={`py-1.5 rounded-lg border text-[11px] font-bold uppercase transition ${
              activeTarget === act
                ? 'bg-cyan-900/60 border-cyan-500/60 text-cyan-300'
                : 'bg-slate-900 border-slate-700/80 text-slate-400 hover:border-cyan-500/40 hover:text-cyan-300'
            }`}
          >
            {act}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── ChangelogSection ───────────────────────────────────── */
function ChangelogSection({ changelog }: { changelog: string }) {
  const html = useMemo(() => marked.parse(changelog, { async: false }) as string, [changelog]);

  const sections = useMemo(() => {
    const lines = changelog.split('\n');
    const releases: { version: string; date: string; content: string }[] = [];
    let cur: string[] = [];
    let header = '';
    let date = '';

    lines.forEach(line => {
      const h2 = line.match(/^## \[(.+?)\].+?(\d{4}-\d{2}-\d{2})/);
      if (h2) {
        if (header) releases.push({ version: header, date, content: cur.join('\n') });
        header = h2[1]; date = h2[2]; cur = [];
      } else if (header) {
        cur.push(line);
      }
    });
    if (header) releases.push({ version: header, date, content: cur.join('\n') });
    return releases;
  }, [changelog]);

  const CATEGORY_STYLES: Record<string, { color: string }> = {
    'Features':      { color: 'text-cyan-400' },
    'Bug Fixes':     { color: 'text-rose-400' },
    'Security':      { color: 'text-emerald-400' },
    'Documentation': { color: 'text-violet-400' },
    'Maintenance':   { color: 'text-amber-400' },
  };

  if (!sections.length) {
    return (
      <div
        className="markdown-body max-h-[600px] overflow-y-auto pr-2"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {sections.map((rel, ri) => {
        const catLines = rel.content.split('\n');
        const cats: { name: string; items: string[] }[] = [];
        let curCat: { name: string; items: string[] } | null = null;

        catLines.forEach(line => {
          const h3 = line.match(/^### (.+)/);
          if (h3) {
            if (curCat) cats.push(curCat);
            curCat = { name: h3[1].replace(/[^\w\s&]/g, '').trim(), items: [] };
          } else if (curCat && line.match(/^\*\s+/)) {
            const clean = line.replace(/^\*\s+/, '').replace(/\(\[.+?\]\(.+?\)\)/g, '').trim();
            if (clean) curCat.items.push(clean);
          }
        });
        if (curCat) cats.push(curCat);

        return (
          <div key={ri} className="changelog-entry pl-5 py-1 group transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_8px_#00f2fe] shrink-0 -ml-[22px]" />
              <span className="font-mono text-sm font-bold text-cyan-300">v{rel.version}</span>
              <span className="text-xs text-slate-500">{rel.date}</span>
              <a
                href={`${data.repoUrl}/releases/tag/drishti-browser-ai-v${rel.version}`}
                target="_blank"
                rel="noreferrer"
                className="ml-auto text-[10px] text-slate-500 hover:text-cyan-400 flex items-center gap-1 transition"
              >
                GitHub Release <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {cats.filter(c => c.items.length > 0).map((cat, ci) => {
                const catKey = Object.keys(CATEGORY_STYLES).find(k => cat.name.includes(k));
                const color = catKey ? CATEGORY_STYLES[catKey].color : 'text-slate-400';
                return (
                  <div key={ci} className="bg-[#060f1e] border border-slate-800 rounded-xl p-3.5 space-y-2">
                    <div className={`text-xs font-bold flex items-center gap-1.5 ${color}`}>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{cat.name}</span>
                    </div>
                    <ul className="space-y-1">
                      {cat.items.slice(0, 5).map((item, ii) => (
                        <li key={ii} className="text-xs text-slate-400 flex items-start gap-1.5 leading-relaxed">
                          <ChevronRight className="w-3 h-3 text-slate-600 shrink-0 mt-0.5" />
                          <span dangerouslySetInnerHTML={{ __html: marked.parseInline(item) as string }} />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── App ────────────────────────────────────────────────── */
export function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const markdownRef = useRef<HTMLDivElement>(null);

  const [copiedCmd, setCopiedCmd] = useState(false);
  const [activeDocId, setActiveDocId] = useState<string>(data.docs[0]?.id || '');
  const [docQuery, setDocQuery] = useState('');
  const [statsStarted, setStatsStarted] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Gallery filter + Lightbox state
  const [galleryCategory, setGalleryCategory] = useState<GalleryCategory>('All');
  const [selectedGalleryIdx, setSelectedGalleryIdx] = useState<number | null>(null);

  // Install Guide client selector + copy state
  const [installClient, setInstallClient] = useState<'auto' | 'antigravity' | 'gemini' | 'opencode' | 'claude' | 'cursor' | 'codex'>('auto');
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const INSTALL_CLIENTS = [
    { id: 'auto',        label: 'Auto-Detect',  config: 'Detects all installed AI clients',       skill: 'Auto-installed per client' },
    { id: 'antigravity', label: 'Antigravity',  config: '~/.gemini/antigravity/mcp_config.json',  skill: '~/.gemini/config/skills/drishti-browser-agent/' },
    { id: 'gemini',      label: 'Gemini CLI',   config: '~/.gemini/settings.json',                skill: '~/.gemini/skills/drishti-browser-agent/' },
    { id: 'opencode',    label: 'OpenCode',     config: '~/.config/opencode/opencode.json',       skill: '~/.config/opencode/skills/drishti-browser-agent/' },
    { id: 'claude',      label: 'Claude Code',  config: '~/.claude/mcp.json',                     skill: '~/.claude/skills/drishti-browser-agent/' },
    { id: 'cursor',      label: 'Cursor IDE',   config: '~/.cursor/mcp.json',                     skill: 'MCP tools ready' },
    { id: 'codex',       label: 'OpenAI Codex', config: '~/.codex/config.toml',                   skill: '~/.codex/skills/drishti-browser-agent/' },
  ] as const;

  const activeInstallClient = INSTALL_CLIENTS.find(c => c.id === installClient) || INSTALL_CLIENTS[0];
  const autoInstallPrompt = `<DRISHTI_AUTO_INSTALL>
Set up Drishti Browser AI (दृष्टि) so you can control my Chrome/Brave browser via MCP:
1. Check if Drishti Browser AI is already installed locally (look for apps/mcp-server/dist/index.js). If found but scripts/setup-agent.mjs is missing, update it in place: git pull origin main && pnpm install && pnpm -r run build. Only clone ${data.repoUrl}.git into a dedicated tools folder (NOT inside my current project) if missing, then run: pnpm install && pnpm -r run build
2. Inside the Drishti folder, run: pnpm setup:agent -- --client ${installClient}
3. Start Local Bridge on-demand: pnpm bridge:start
4. Guide me to paste the token from .drishti-token into Drishti Settings -> Connection & Bridge -> Save Changes -> Run Ping.
</DRISHTI_AUTO_INSTALL>`;

  // MCP Tools Explorer state
  const allTools = useMemo(() => data.mcpTools || [], []);
  const toolCategories = useMemo(
    () => ['All', ...Array.from(new Set(allTools.map(t => t.category)))],
    [allTools],
  );
  const [toolCategory, setToolCategory] = useState('All');
  const [toolQuery, setToolQuery] = useState('');

  const quickstartCmd =
    'git clone https://github.com/SudhirDevOps1/drishti-browser-ai.git && cd drishti-browser-ai && pnpm install && pnpm -r run build';

  /* ── GSAP animations + Scroll Progress Bar ── */
  useEffect(() => {
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        if (progressRef.current) {
          gsap.to(progressRef.current, {
            scaleX: 1,
            ease: 'none',
            scrollTrigger: {
              trigger: document.documentElement,
              start: 'top top',
              end: 'bottom bottom',
              scrub: 0.2,
            },
          });
        }

        gsap.from('.hero-stagger', {
          y: 28, opacity: 0, duration: 0.75, stagger: 0.1, ease: 'power3.out', clearProps: 'transform,opacity',
        });

        gsap.utils.toArray<HTMLElement>('.bento-card').forEach((card, idx) => {
          gsap.from(card, {
            scrollTrigger: { trigger: card, start: 'top 92%', once: true },
            y: 26, opacity: 0, duration: 0.5, delay: (idx % 3) * 0.08, ease: 'power2.out', clearProps: 'transform,opacity',
          });
        });

        gsap.utils.toArray<HTMLElement>('.arch-node').forEach((node, idx) => {
          gsap.from(node, {
            scrollTrigger: { trigger: node, start: 'top 94%', once: true },
            y: 16, opacity: 0, duration: 0.45, delay: idx * 0.04, ease: 'power2.out', clearProps: 'transform,opacity',
          });
        });

        ScrollTrigger.create({
          trigger: '#stats',
          start: 'top 85%',
          once: true,
          onEnter: () => setStatsStarted(true),
        });
      });

      mm.add('(prefers-reduced-motion: reduce)', () => {
        setStatsStarted(true);
      });

      ScrollTrigger.refresh();
    }, rootRef);

    return () => ctx.revert();
  }, []);

  /* ── Filtered Gallery & Lightbox Keyboard Navigation ── */
  const filteredGallery = useMemo(
    () => galleryCategory === 'All' ? GALLERY_ITEMS : GALLERY_ITEMS.filter(g => g.category === galleryCategory),
    [galleryCategory],
  );

  const selectedGallery = selectedGalleryIdx !== null ? filteredGallery[selectedGalleryIdx] || null : null;

  useEffect(() => {
    if (selectedGalleryIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedGalleryIdx(null);
      if (e.key === 'ArrowRight') setSelectedGalleryIdx(i => (i === null ? null : (i + 1) % filteredGallery.length));
      if (e.key === 'ArrowLeft') setSelectedGalleryIdx(i => (i === null ? null : (i - 1 + filteredGallery.length) % filteredGallery.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedGalleryIdx, filteredGallery.length]);

  /* ── Filtered MCP Tools ── */
  const filteredTools = useMemo(() => {
    const q = toolQuery.trim().toLowerCase();
    return allTools.filter(
      t =>
        (toolCategory === 'All' || t.category === toolCategory) &&
        (!q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)),
    );
  }, [allTools, toolCategory, toolQuery]);

  /* ── Docs + TOC + Code Copy Buttons ── */
  const filteredDocs = useMemo(() => {
    const q = docQuery.trim().toLowerCase();
    return (data.docs as DocEntry[]).filter(
      d => !q || d.title.toLowerCase().includes(q) || d.category.toLowerCase().includes(q),
    );
  }, [docQuery]);

  const activeDoc = useMemo(
    () => (data.docs as DocEntry[]).find(d => d.id === activeDocId) || (data.docs[0] as DocEntry),
    [activeDocId],
  );

  const docHeadings = useMemo(() => {
    if (!activeDoc) return [];
    return activeDoc.content
      .split('\n')
      .map(l => l.match(/^##\s+(.+)/))
      .filter((m): m is RegExpMatchArray => Boolean(m))
      .map(m => m[1].replace(/`/g, '').trim())
      .slice(0, 10);
  }, [activeDoc]);

  const renderedMarkdown = useMemo(() => {
    if (!activeDoc) return '';
    return marked.parse(activeDoc.content, { async: false }) as string;
  }, [activeDoc]);

  useEffect(() => {
    const root = markdownRef.current;
    if (!root) return;
    const pres = root.querySelectorAll('pre');
    pres.forEach(pre => {
      if (pre.querySelector('.code-copy-btn')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'code-copy-btn';
      btn.textContent = 'Copy';
      btn.onclick = () => {
        const code = pre.querySelector('code')?.textContent || pre.textContent || '';
        navigator.clipboard.writeText(code).catch(() => {});
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1800);
      };
      pre.appendChild(btn);
    });
  }, [renderedMarkdown]);

  const copyCommand = () => {
    navigator.clipboard.writeText(quickstartCmd).catch(() => {});
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  /* ── Spotlight + 3D Tilt on feature cards ── */
  const handleTilt = useCallback((e: React.MouseEvent<HTMLDivElement>, el: HTMLDivElement) => {
    const rect = el.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    const py = ((e.clientY - rect.top) / rect.height) * 100;
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty('--mx', `${px}%`);
    el.style.setProperty('--my', `${py}%`);
    el.style.transform = `perspective(600px) rotateY(${x * 9}deg) rotateX(${-y * 9}deg) translateZ(6px)`;
  }, []);

  const resetTilt = useCallback((el: HTMLDivElement) => {
    el.style.transform = 'perspective(600px) rotateY(0deg) rotateX(0deg) translateZ(0px)';
  }, []);

  const navItems = [
    { href: '#install',      label: 'Install' },
    { href: '#gallery',      label: 'Gallery' },
    { href: '#features',     label: 'Features' },
    { href: '#tools',        label: `MCP Tools (${allTools.length})` },
    { href: '#architecture', label: 'Architecture' },
    { href: '#changelog',    label: 'Changelog' },
    { href: '#docs',         label: `Docs (${data.docs.length})` },
  ];

  return (
    <div ref={rootRef} className="min-h-screen bg-[#050914] text-slate-100 overflow-x-hidden">

      {/* ── Top Scroll Progress Bar ── */}
      <div className="fixed top-0 left-0 right-0 z-[60] h-[2px] bg-transparent pointer-events-none">
        <div
          ref={progressRef}
          style={{ transform: 'scaleX(0)', transformOrigin: 'left center' }}
          className="h-full bg-gradient-to-r from-cyan-400 via-sky-400 to-violet-500 shadow-[0_0_10px_#00f2fe]"
        />
      </div>

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 nav-pill border-b border-slate-800/60 bg-[#050914]/85">
        <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">
          <a href="#" className="flex items-center gap-2.5">
            <img
              src="./icons/icon.svg"
              alt="Drishti Browser AI Icon"
              className="w-8 h-8 rounded-xl shadow-lg shadow-cyan-500/25"
            />
            <div>
              <span className="font-extrabold tracking-tight text-white text-sm">Drishti Browser AI</span>
              <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950/80 border border-cyan-500/40 text-cyan-300">
                v{data.version}
              </span>
            </div>
          </a>

          <nav className="hidden md:flex items-center gap-5 text-xs font-semibold text-slate-400">
            {navItems.map(item => (
              <a key={item.href} href={item.href} className="hover:text-cyan-300 transition-colors">
                {item.label}
              </a>
            ))}
            <a
              href={data.repoUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 hover:border-cyan-500/50 transition neon-border"
            >
              <Github className="w-3.5 h-3.5" />
              <span>GitHub</span>
            </a>
          </nav>

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            aria-label="Toggle Menu"
            onClick={() => setMobileMenuOpen(o => !o)}
            className="md:hidden p-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-800 bg-[#060f1e] px-5 py-4 space-y-2">
            {navItems.map(item => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="block py-2 text-xs font-bold text-slate-300 hover:text-cyan-300"
              >
                {item.label}
              </a>
            ))}
            <a
              href={data.repoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-cyan-300"
            >
              <Github className="w-3.5 h-3.5" /> GitHub Repo
            </a>
          </div>
        )}
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="hero-grid" aria-hidden />
        <HeroCanvas />
        <div className="absolute top-16 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-36 right-1/4 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-7xl mx-auto px-5 pt-14 pb-20 grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6 space-y-6">
            <div className="hero-stagger inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-950/60 border border-cyan-500/40 text-xs font-bold text-cyan-300">
              <Activity className="w-3.5 h-3.5 animate-pulse" />
              <span>Universal MV3 + MCP Browser Platform · SSOT v{data.version}</span>
            </div>

            <h1 className="hero-stagger text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-[1.06]">
              Give Your AI Agent{' '}
              <span className="text-gradient animate-neon-flicker">Live Browser Vision</span>
              {' '}&amp;{' '}
              <span className="text-gradient-purple">Human Motion</span>
            </h1>

            <p className="hero-stagger text-base text-slate-300 leading-relaxed max-w-xl">
              Connect <strong className="text-white">Antigravity, Claude Code, Cursor, OpenCode, or Codex</strong> directly
              to your live Chrome/Brave session over a hardened{' '}
              <code className="text-cyan-300 font-mono text-xs bg-cyan-950/40 px-1.5 py-0.5 rounded">127.0.0.1:7483</code>{' '}
              bridge with Shadow DOM Cubic Bézier cursor trails, Voice Commands, and Live Error Telemetry.
            </p>

            <div className="hero-stagger bg-[#060f1e] border border-slate-800 rounded-2xl p-3 flex items-center justify-between gap-3 neon-border">
              <div className="flex items-center gap-2 min-w-0">
                <Terminal className="w-4 h-4 text-slate-500 shrink-0" />
                <code className="text-xs font-mono text-cyan-200 truncate">{quickstartCmd}</code>
              </div>
              <button
                onClick={copyCommand}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition shadow-lg shadow-cyan-600/30"
              >
                {copiedCmd ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCmd ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            <div className="hero-stagger flex flex-wrap gap-3">
              <a
                href="#install"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition"
              >
                <Zap className="w-4 h-4" />
                <span>Install in 4 Steps</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
              <a
                href="#gallery"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold transition"
              >
                <Eye className="w-4 h-4 text-cyan-400" />
                <span>Visual Gallery</span>
              </a>
              <a
                href="#tools"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold transition"
              >
                <Wrench className="w-4 h-4 text-cyan-400" />
                <span>{allTools.length} MCP Tools</span>
              </a>
            </div>
          </div>

          <div className="lg:col-span-6 space-y-4">
            <div className="hero-stagger">
              <TerminalWindow />
            </div>
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* ── Stats ── */}
      <section id="stats" className="max-w-7xl mx-auto px-5 py-14">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-extrabold text-white">Verified by CI — By the Numbers</h2>
          <p className="text-sm text-slate-400 mt-1">Real metrics from the monorepo build, unit tests, and Playwright E2E suite.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {STATS.map(s => (
            <StatCard key={s.label} {...s} started={statsStarted} />
          ))}
        </div>
      </section>

      <div className="section-divider" />

      {/* ── Quick Install & Browser Setup Guide ── */}
      <section id="install" className="max-w-7xl mx-auto px-5 py-14 space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-white flex items-center gap-2">
              <Zap className="w-6 h-6 text-cyan-400" />
              Install &amp; Connect in 4 Easy Steps
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Works with Google Chrome &amp; Brave — choose your AI agent below for exact MCP &amp; Skill setup.
            </p>
          </div>
          <a
            href={`${data.repoUrl}/releases`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-xs font-bold text-cyan-300 hover:border-cyan-400 transition"
          >
            <span>Download Extension ZIP</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* 4 Steps Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              step: '01',
              title: 'Download or Build',
              desc: 'Download the latest extension ZIP from GitHub Releases, or clone & build locally with pnpm install && pnpm -r run build.',
              cmd: 'pnpm install && pnpm -r run build',
            },
            {
              step: '02',
              title: 'Load in Chrome / Brave',
              desc: 'Open chrome://extensions/ (or brave://extensions/), turn Developer mode ON, click Load unpacked, and select apps/chrome-extension/dist.',
              cmd: 'chrome://extensions/ → Load unpacked',
            },
            {
              step: '03',
              title: 'Zero-Clone AI Setup',
              desc: 'Run setup:agent to auto-generate .drishti-token, register MCP, and install the drishti-browser-agent skill.',
              cmd: `pnpm setup:agent -- --client ${installClient}`,
            },
            {
              step: '04',
              title: 'Start Bridge & Ping',
              desc: 'Run pnpm bridge:start on-demand, paste token (or click Generate) in Extension Settings, and click Run Ping for ONLINE.',
              cmd: 'pnpm bridge:start',
            },
          ].map(card => (
            <div key={card.step} className="bg-[#0b1222] border border-slate-800 hover:border-cyan-500/40 rounded-2xl p-5 space-y-3 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-black px-2.5 py-1 rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-300">
                  Step {card.step}
                </span>
              </div>
              <h3 className="text-sm font-bold text-white">{card.title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{card.desc}</p>
              <code className="block text-[10px] font-mono text-cyan-300 bg-[#060f1e] border border-slate-800 rounded-lg px-2.5 py-1.5 truncate">
                {card.cmd}
              </code>
            </div>
          ))}
        </div>

        {/* Interactive AI Client Config + 1-Prompt Copy */}
        <div className="grid lg:grid-cols-12 gap-5 items-stretch">
          <div className="lg:col-span-6 bg-[#0b1222] border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="text-xs font-bold text-white">Select Your AI Agent</div>
            <div className="flex flex-wrap gap-1.5">
              {INSTALL_CLIENTS.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setInstallClient(c.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                    installClient === c.id
                      ? 'bg-cyan-600 border-cyan-500 text-white shadow-lg shadow-cyan-600/25'
                      : 'bg-[#060f1e] border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="bg-[#060f1e] border border-slate-800 rounded-xl p-4 space-y-2 text-xs font-mono">
              <div className="text-slate-400">
                Command: <span className="text-cyan-300">pnpm setup:agent -- --client {activeInstallClient.id}</span>
              </div>
              <div className="text-slate-400">
                MCP Config: <span className="text-emerald-300">{activeInstallClient.config}</span>
              </div>
              <div className="text-slate-400">
                Skill Path: <span className="text-violet-300">{activeInstallClient.skill}</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 bg-[#0b1222] border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white">1-Prompt AI Auto-Install (Copy &amp; Paste)</div>
                <div className="text-[11px] text-slate-400">Paste this into {activeInstallClient.label} — zero-clone safe</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(autoInstallPrompt).catch(() => {});
                  setCopiedPrompt(true);
                  setTimeout(() => setCopiedPrompt(false), 2000);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition"
              >
                {copiedPrompt ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedPrompt ? 'Copied!' : 'Copy Prompt'}</span>
              </button>
            </div>
            <pre className="bg-[#060f1e] border border-slate-800 rounded-xl p-3 text-[11px] font-mono text-cyan-200 overflow-x-auto leading-relaxed">
              {autoInstallPrompt}
            </pre>
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* ── Visual Gallery (Real Extension Screenshots + Interactive Cards + Lightbox Carousel) ── */}
      <section id="gallery" className="max-w-7xl mx-auto px-5 py-14 space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-white flex items-center gap-2">
              <Eye className="w-6 h-6 text-cyan-400" />
              Visual Showcase Gallery
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Real Chromium extension screenshots &amp; interactive telemetry previews — click any card to open the Lightbox Carousel.
            </p>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap gap-1.5 p-1 bg-[#0b1222] border border-slate-800 rounded-xl">
            {(['All', 'Extension UI', 'Motion & Voice', 'Security & CI'] as GalleryCategory[]).map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => { setGalleryCategory(cat); setSelectedGalleryIdx(null); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  galleryCategory === cat
                    ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {filteredGallery.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedGalleryIdx(idx)}
              className={`gallery-card group text-left bg-gradient-to-br ${item.glow} border ${item.border} rounded-2xl p-4 space-y-3 hover:border-cyan-400/60 focus:outline-none`}
            >
              <div className="h-40 rounded-xl bg-[#040c18] border border-slate-800/90 overflow-hidden">
                <GalleryPreview item={item} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-white leading-snug">{item.title}</h3>
                <span className="text-[10px] font-bold text-cyan-300 shrink-0">Zoom →</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{item.desc}</p>
              <div className="flex flex-wrap gap-1.5">
                {item.tags.map(tag => (
                  <span key={tag} className="px-2 py-0.5 rounded-lg bg-slate-900/80 border border-slate-800 text-[10px] font-mono text-slate-300">
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>

        <div className="pt-4">
          <BezierPlayground />
        </div>
      </section>

      <div className="section-divider" />

      {/* ── Features ── */}
      <section id="features" className="max-w-7xl mx-auto px-5 py-14 space-y-8">
        <div>
          <h2 className="text-2xl font-extrabold text-white">Engineered for Real Browser Automation</h2>
          <p className="text-sm text-slate-400 mt-1">Zero mock behavior — move your cursor across any card for 3D spotlight inspection.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(feat => {
            const Icon = feat.icon;
            const colorCls = COLOR_MAP[feat.color] || COLOR_MAP.cyan;
            return (
              <div
                key={feat.title}
                className="bento-card spotlight-card bg-[#0b1222] border border-slate-800/90 hover:border-cyan-500/40 rounded-2xl p-5 space-y-3 cursor-default"
                onMouseMove={e => handleTilt(e, e.currentTarget)}
                onMouseLeave={e => resetTilt(e.currentTarget)}
              >
                <div className="flex items-center justify-between">
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${colorCls}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300">
                    {feat.badge}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white">{feat.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{feat.desc}</p>
                <div className="pt-1">
                  <code className={`text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 ${colorCls.split(' ')[0]}`}>
                    {feat.highlight}
                  </code>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="section-divider" />

      {/* ── Interactive 37 MCP Tools Explorer ── */}
      <section id="tools" className="max-w-7xl mx-auto px-5 py-14 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-white flex items-center gap-2">
              <Wrench className="w-6 h-6 text-cyan-400" />
              {allTools.length} Official MCP Tools Explorer
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Parsed directly from <code className="text-cyan-300 text-xs">docs/mcp-tools-reference.md</code> — search or filter by category.
            </p>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={toolQuery}
              onChange={e => setToolQuery(e.target.value)}
              placeholder="Search tools (e.g. click, screenshot)..."
              className="bg-[#0b1222] border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition w-64"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {toolCategories.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setToolCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-bold border transition ${
                toolCategory === cat
                  ? 'bg-cyan-950/80 border-cyan-500/60 text-cyan-300'
                  : 'bg-[#0b1222] border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[420px] overflow-y-auto pr-1">
          {filteredTools.map(tool => (
            <div
              key={tool.name}
              className="bg-[#0b1222] border border-slate-800 hover:border-cyan-500/40 rounded-xl p-4 space-y-1.5 transition"
            >
              <div className="flex items-center justify-between gap-2">
                <code className="text-xs font-mono font-bold text-cyan-300 truncate">{tool.name}</code>
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 shrink-0">
                  {tool.category}
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{tool.description}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="section-divider" />

      {/* ── Architecture ── */}
      <section id="architecture" className="max-w-7xl mx-auto px-5 py-14 space-y-6">
        <div>
          <h2 className="text-2xl font-extrabold text-white">Monorepo Architecture</h2>
          <p className="text-sm text-slate-400 mt-1">Animated data flow from AI agent stdio to Chrome MV3 DOM execution.</p>
        </div>

        <div className="bg-[#060f1e] border border-slate-800 rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-mono">
            {[
              { label: 'AI Agent\n(Antigravity / Claude / Cursor)', color: 'border-violet-500/50 text-violet-300 bg-violet-950/40' },
              null,
              { label: 'MCP Server\n(stdio · JSON-RPC)', color: 'border-cyan-500/50 text-cyan-300 bg-cyan-950/40' },
              null,
              { label: 'Local Bridge\n(ws://127.0.0.1:7483)', color: 'border-emerald-500/50 text-emerald-300 bg-emerald-950/40' },
              null,
              { label: 'Chrome Extension\n(MV3 · Service Worker)', color: 'border-amber-500/50 text-amber-300 bg-amber-950/40' },
              null,
              { label: 'Live Browser\n(Chrome · Brave)', color: 'border-rose-500/50 text-rose-300 bg-rose-950/40' },
            ].map((node, i) => {
              if (node === null) {
                return (
                  <svg key={i} width="28" height="14" viewBox="0 0 28 14" className="shrink-0">
                    <line x1="2" y1="7" x2="22" y2="7" stroke="#22d3ee" strokeWidth="2" className="animate-packet-flow" />
                    <polygon points="21,3 27,7 21,11" fill="#22d3ee" />
                  </svg>
                );
              }
              return (
                <div key={i} className={`arch-node border rounded-xl px-3.5 py-2.5 text-center whitespace-pre-line leading-tight ${node.color}`}>
                  {node.label}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PACKAGES.map(pkg => {
            const colorCls = COLOR_MAP[pkg.color] || COLOR_MAP.cyan;
            return (
              <div key={pkg.name} className="arch-node bg-[#0b1222] border border-slate-800 rounded-xl p-4 space-y-1.5 hover:border-slate-700 transition">
                <div className={`flex items-center gap-1.5 text-xs font-mono font-bold ${colorCls.split(' ')[0]}`}>
                  <Layers className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{pkg.name}</span>
                </div>
                <p className="text-xs text-slate-400">{pkg.role}</p>
              </div>
            );
          })}
        </div>
      </section>

      <div className="section-divider" />

      {/* ── Releases / Channels ── */}
      <section id="releases" className="max-w-7xl mx-auto px-5 py-14 space-y-6">
        <div>
          <h2 className="text-2xl font-extrabold text-white">Enterprise Release Channels</h2>
          <p className="text-sm text-slate-400 mt-1">
            Single Source of Truth in root <code className="text-cyan-300 text-xs">package.json</code> — currently{' '}
            <strong className="text-white">v{data.version}</strong>, synced via{' '}
            <code className="text-cyan-300 text-xs">scripts/version.mjs</code>
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {CHANNELS.map((ch, i) => (
            <div key={ch.tag} className="bento-card bg-[#0b1222] border border-slate-800 rounded-2xl p-5 space-y-3 hover:border-slate-700 transition">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${ch.dot}`} />
                <span className="text-xs font-bold text-slate-300">{ch.stage}</span>
                <span className="ml-auto text-[10px] font-bold text-slate-500 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded">
                  Stage {i + 1}
                </span>
              </div>
              <div className="font-mono text-xs text-cyan-400">{ch.tag}</div>
              <p className="text-xs text-slate-400">{ch.desc}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <a
            href={`${data.repoUrl}/actions`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-xs text-emerald-300 font-bold hover:border-emerald-400/60 transition"
          >
            <Check className="w-4 h-4" />
            CI: build-and-test passing
          </a>
          <a
            href={`${data.repoUrl}/actions/workflows/pages.yml`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-950/60 border border-blue-500/30 text-xs text-blue-300 font-bold hover:border-blue-400/60 transition"
          >
            <Zap className="w-4 h-4" />
            GitHub Pages: auto-deployed
          </a>
        </div>
      </section>

      <div className="section-divider" />

      {/* ── Changelog ── */}
      <section id="changelog" className="max-w-7xl mx-auto px-5 py-14 space-y-6">
        <div>
          <h2 className="text-2xl font-extrabold text-white flex items-center gap-3">
            <GitCommit className="w-6 h-6 text-cyan-400" />
            Changelog
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Auto-generated by Release Please · Categorized by Conventional Commits ·{' '}
            <a href={`${data.repoUrl}/releases`} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">
              View all releases →
            </a>
          </p>
        </div>

        <div className="bg-[#0b1222] border border-slate-800 rounded-2xl p-6">
          {data.changelog ? (
            <ChangelogSection changelog={data.changelog} />
          ) : (
            <p className="text-xs text-slate-500 italic">Changelog not available.</p>
          )}
        </div>
      </section>

      <div className="section-divider" />

      {/* ── Docs ── */}
      <section id="docs" className="max-w-7xl mx-auto px-5 py-14 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold text-white flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-cyan-400" />
              Documentation Hub
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              All {data.docs.length} repository guides — synced at build time with code-block copy &amp; Table of Contents.
            </p>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={docQuery}
              onChange={e => setDocQuery(e.target.value)}
              placeholder="Filter docs..."
              className="bg-[#0b1222] border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition w-48"
            />
          </div>
        </div>

        <div className="grid lg:grid-cols-12 gap-5 items-start">
          <aside className="lg:col-span-3 space-y-1">
            {filteredDocs.map(doc => (
              <button
                key={doc.id}
                onClick={() => setActiveDocId(doc.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs flex items-center gap-2 transition ${
                  activeDoc?.id === doc.id
                    ? 'bg-cyan-950/60 border-cyan-500/50 text-cyan-200'
                    : 'bg-[#0b1222] border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeDoc?.id === doc.id ? 'bg-cyan-400' : 'bg-slate-700'}`} />
                <span className="truncate font-medium">{doc.title}</span>
                <span className="ml-auto text-[9px] font-mono text-slate-500 shrink-0">{doc.category}</span>
              </button>
            ))}
          </aside>

          <article className="lg:col-span-9 bg-[#0b1222] border border-slate-800 rounded-2xl overflow-hidden">
            {activeDoc && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3.5 border-b border-slate-800 bg-[#060f1e]/60">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-cyan-300">{activeDoc.file}</span>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-500">{activeDoc.category}</span>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(activeDoc.content).catch(() => {});
                      setCopiedCode(activeDoc.id);
                      setTimeout(() => setCopiedCode(null), 2000);
                    }}
                    className="flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-cyan-300 transition px-2 py-1 rounded-lg hover:bg-slate-800"
                  >
                    {copiedCode === activeDoc.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCode === activeDoc.id ? 'Copied!' : 'Copy raw'}</span>
                  </button>
                </div>

                {docHeadings.length > 0 && (
                  <div className="px-6 py-2.5 border-b border-slate-800/70 bg-[#050c19] flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase text-slate-500 mr-1">Sections:</span>
                    {docHeadings.map(h => (
                      <span key={h} className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                        {h}
                      </span>
                    ))}
                  </div>
                )}

                <div className="p-6 max-h-[640px] overflow-y-auto">
                  <div
                    ref={markdownRef}
                    className="markdown-body"
                    dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
                  />
                </div>
              </>
            )}
          </article>
        </div>
      </section>

      <div className="section-divider" />

      {/* ── Footer ── */}
      <footer className="py-10 mt-4">
        <div className="max-w-7xl mx-auto px-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <img src="./icons/icon.svg" alt="Drishti Browser AI" className="w-7 h-7 rounded-lg" />
              <div>
                <div className="text-sm font-bold text-white">Drishti Browser AI</div>
                <div className="text-[10px] text-slate-500">MIT License · SSOT v{data.version}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-xs text-slate-500">
              <a href={data.repoUrl} target="_blank" rel="noreferrer" className="hover:text-cyan-300 transition flex items-center gap-1">
                <Github className="w-3.5 h-3.5" /> GitHub
              </a>
              <a href={`${data.repoUrl}/releases`} target="_blank" rel="noreferrer" className="hover:text-cyan-300 transition">Releases</a>
              <a href={`${data.repoUrl}/issues`} target="_blank" rel="noreferrer" className="hover:text-cyan-300 transition">Issues</a>
              <span className="flex items-center gap-1">
                <Code2 className="w-3.5 h-3.5 text-cyan-400" />
                Built with Vite · React · Tailwind · GSAP
              </span>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-800/60 text-center text-[10px] text-slate-600">
            Generated at {new Date(data.generatedAt).toLocaleString()} · Powered by{' '}
            <span className="text-cyan-500">Drishti Browser AI v{data.version}</span>
          </div>
        </div>
      </footer>

      {/* ── Gallery Lightbox Carousel Modal ── */}
      {selectedGallery && selectedGalleryIdx !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedGalleryIdx(null)}
        >
          <div
            className={`max-w-2xl w-full bg-[#071022] border ${selectedGallery.border} rounded-2xl p-6 space-y-4 shadow-2xl`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase text-cyan-400">{selectedGallery.category}</span>
                <h3 className="text-base font-extrabold text-white">{selectedGallery.title}</h3>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Previous item"
                  onClick={() => setSelectedGalleryIdx((selectedGalleryIdx - 1 + filteredGallery.length) % filteredGallery.length)}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono text-slate-400 px-1">
                  {selectedGalleryIdx + 1}/{filteredGallery.length}
                </span>
                <button
                  type="button"
                  aria-label="Next item"
                  onClick={() => setSelectedGalleryIdx((selectedGalleryIdx + 1) % filteredGallery.length)}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Close modal"
                  onClick={() => setSelectedGalleryIdx(null)}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:text-white ml-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="h-72 rounded-xl bg-[#040c18] border border-slate-800 overflow-hidden">
              <GalleryPreview item={selectedGallery} />
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">{selectedGallery.desc}</p>
            <ul className="space-y-1.5">
              {selectedGallery.specs.map(spec => (
                <li key={spec} className="text-xs text-slate-400 flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>{spec}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
