import React, { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { marked } from 'marked';
import {
  Activity,
  ArrowRight,
  BookOpen,
  Check,
  Code2,
  Copy,
  Cpu,
  ExternalLink,
  GitBranch,
  Layers,
  Mic,
  MousePointer2,
  Play,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wifi,
} from 'lucide-react';
import siteData from './generated/site-data.json';

gsap.registerPlugin(ScrollTrigger);

interface DocEntry {
  id: string;
  title: string;
  category: string;
  file: string;
  content: string;
}

const FEATURES = [
  {
    icon: MousePointer2,
    title: 'Shadow DOM Bezier Cursor',
    badge: 'Human-Like Motion',
    desc: 'Cubic Bezier trajectories with Fitts law easing, fading SVG motion trail, 3px element glow, and concentric click ripples.',
  },
  {
    icon: Mic,
    title: 'Voice Commands & Custom Macros',
    badge: 'EN / HI Support',
    desc: 'Speak missions in English or Hindi directly in the Control Deck and save reusable 1-click macro chips locally.',
  },
  {
    icon: Terminal,
    title: 'Live Console & Network Drawer',
    badge: 'Zero-DevTools Debug',
    desc: 'Auto-attaches MAIN-world hooks to capture console errors and 4xx/5xx fetch/XHR failures live inside the Sidepanel.',
  },
  {
    icon: Cpu,
    title: '35+ MCP Automation Tools',
    badge: 'Universal Agents',
    desc: 'Works with Antigravity, Claude Code, Cursor, OpenCode, and Codex over strict Zod v4 validated MCP schemas.',
  },
  {
    icon: ShieldCheck,
    title: 'MV3 Hardened Security',
    badge: 'Zero eval() Sinks',
    desc: 'Localhost 127.0.0.1 WebSocket bridge with 64-char timing-safe token auth, domain allowlist/blocklist, and origin checks.',
  },
  {
    icon: GitBranch,
    title: 'Enterprise Release & E2E CI',
    badge: 'Alpha / Beta / RC / Stable',
    desc: 'Husky + Commitlint + Release Please + SSOT version scripts + automated Playwright Chromium smoke tests on every push.',
  },
];

const PACKAGES = [
  { name: '@drishti/shared-types', role: 'Bridge, MCP & Security Schemas' },
  { name: '@drishti/permission-engine', role: 'Domain Allowlist / Blocklist & Policy' },
  { name: '@drishti/dom-engine', role: 'Ad-Filtered Semantic DOM & A11y Discovery' },
  { name: '@drishti/visual-engine', role: 'Viewport Capture & Visual Diffing' },
  { name: '@drishti/browser-core', role: 'Controller, Observer & Action Executor' },
  { name: '@drishti/workflow-engine', role: 'Task Queue & Multi-Step Orchestration' },
  { name: '@drishti/mcp-tools', role: '35 MCP Tool Definitions' },
];

const CHANNELS = [
  { tag: '1.5.0-alpha.1', stage: 'Internal Dev', desc: 'Rapid internal integration & bridge testing' },
  { tag: '1.5.0-beta.1', stage: 'Community Beta', desc: 'Early testers validating real workflows' },
  { tag: '1.5.0-rc.1', stage: 'Release Candidate', desc: 'Final freeze + Playwright E2E gate' },
  { tag: '1.5.0', stage: 'Stable Production', desc: 'Categorized Changelog + SHA-256 artifacts' },
];

export function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [activeDocId, setActiveDocId] = useState<string>(siteData.docs[0]?.id || 'windows-install');
  const [docQuery, setDocQuery] = useState('');

  // Interactive Bezier Playground state
  const [cursorPos, setCursorPos] = useState({ x: 64, y: 70 });
  const [cursorLabel, setCursorLabel] = useState('DRISHTI AI');
  const [activeTarget, setActiveTarget] = useState<'hover' | 'type' | 'click' | 'scroll' | null>(null);
  const [rippleKey, setRippleKey] = useState(0);
  const [demoTyped, setDemoTyped] = useState('');

  const quickstartCmd =
    'git clone https://github.com/SudhirDevOps1/drishti-browser-ai.git && cd drishti-browser-ai && pnpm install && pnpm -r run build';

  useEffect(() => {
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.hero-stagger', {
          y: 26,
          opacity: 0,
          duration: 0.7,
          stagger: 0.1,
          ease: 'power3.out',
        });

        gsap.utils.toArray<HTMLElement>('.bento-card').forEach((card, idx) => {
          gsap.from(card, {
            scrollTrigger: {
              trigger: card,
              start: 'top 88%',
              once: true,
            },
            y: 28,
            opacity: 0,
            duration: 0.55,
            delay: (idx % 3) * 0.08,
            ease: 'power2.out',
          });
        });

        gsap.utils.toArray<HTMLElement>('.arch-node').forEach((node, idx) => {
          gsap.from(node, {
            scrollTrigger: {
              trigger: node,
              start: 'top 90%',
              once: true,
            },
            scale: 0.94,
            opacity: 0,
            duration: 0.45,
            delay: idx * 0.06,
            ease: 'power2.out',
          });
        });
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  const triggerDemoAction = (action: 'hover' | 'type' | 'click' | 'scroll') => {
    setActiveTarget(action);
    const coords = {
      hover: { x: 75, y: 65, label: 'HOVERING MENU' },
      type: { x: 185, y: 125, label: 'TYPING...' },
      click: { x: 285, y: 125, label: 'AI CLICK' },
      scroll: { x: 180, y: 195, label: 'SCROLL DOWN 400px' },
    }[action];

    setCursorPos({ x: coords.x, y: coords.y });
    setCursorLabel(coords.label);

    if (action === 'click') {
      setTimeout(() => setRippleKey((k) => k + 1), 360);
    }
    if (action === 'type') {
      setDemoTyped('');
      const sample = 'Arijit Singh hits';
      sample.split('').forEach((ch, idx) => {
        setTimeout(() => setDemoTyped((prev) => prev + ch), 280 + idx * 45);
      });
    }
  };

  const filteredDocs = useMemo(() => {
    const q = docQuery.trim().toLowerCase();
    return (siteData.docs as DocEntry[]).filter(
      (d) => !q || d.title.toLowerCase().includes(q) || d.category.toLowerCase().includes(q) || d.file.toLowerCase().includes(q)
    );
  }, [docQuery]);

  const activeDoc = useMemo(
    () => (siteData.docs as DocEntry[]).find((d) => d.id === activeDocId) || (siteData.docs[0] as DocEntry),
    [activeDocId]
  );

  const renderedMarkdown = useMemo(() => {
    if (!activeDoc) return '';
    return marked.parse(activeDoc.content, { async: false }) as string;
  }, [activeDoc]);

  const copyCommand = () => {
    navigator.clipboard.writeText(quickstartCmd).catch(() => {});
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  return (
    <div ref={rootRef} className="min-h-screen bg-[#050914] text-slate-100">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#050914]/85 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-extrabold tracking-tight text-white">Drishti Browser AI</span>
              <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950/80 border border-cyan-500/40 text-cyan-300">
                v{siteData.version}
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-400">
            <a href="#features" className="hover:text-cyan-300 transition">Features</a>
            <a href="#architecture" className="hover:text-cyan-300 transition">Architecture</a>
            <a href="#releases" className="hover:text-cyan-300 transition">Versions</a>
            <a href="#docs" className="hover:text-cyan-300 transition">Docs ({siteData.docs.length})</a>
            <a
              href={siteData.repoUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 hover:border-cyan-500/50 transition"
            >
              <span>GitHub</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-5 pt-14 pb-16 grid lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-7 space-y-6">
          <div className="hero-stagger inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/40 text-xs font-bold text-cyan-300">
            <Activity className="w-3.5 h-3.5" />
            <span>Universal MV3 + MCP Browser Platform · SSOT v{siteData.version}</span>
          </div>

          <h1 className="hero-stagger text-4xl sm:text-5xl font-black tracking-tight text-white leading-[1.1]">
            Give Your AI Agent{' '}
            <span className="bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 bg-clip-text text-transparent">
              Live Browser Vision & Human Motion
            </span>
          </h1>

          <p className="hero-stagger text-base text-slate-300 leading-relaxed max-w-2xl">
            Connect Antigravity, Claude Code, Cursor, OpenCode, or Codex directly to your live Chrome/Brave session over a
            hardened <code className="text-cyan-300 font-mono text-xs">127.0.0.1:7483</code> bridge with Shadow DOM
            Cubic Bézier cursor trails, Voice Commands, and Live Error Telemetry.
          </p>

          {/* Copyable Quickstart */}
          <div className="hero-stagger bg-[#0b1222] border border-slate-800 rounded-2xl p-3 flex items-center justify-between gap-3">
            <code className="text-xs font-mono text-cyan-200 truncate">{quickstartCmd}</code>
            <button
              onClick={copyCommand}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition"
            >
              {copiedCmd ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCmd ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>

          <div className="hero-stagger flex flex-wrap gap-3">
            <a
              href="#docs"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition"
            >
              <BookOpen className="w-4 h-4" />
              <span>Explore All {siteData.docs.length} Docs</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
            <a
              href={`${siteData.repoUrl}/releases`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold transition"
            >
              <GitBranch className="w-4 h-4 text-cyan-400" />
              <span>View Releases</span>
            </a>
          </div>
        </div>

        {/* Interactive Bezier Cursor Playground */}
        <div className="hero-stagger lg:col-span-5">
          <div className="bg-[#0b1222] border border-slate-800 rounded-2xl p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Play className="w-3.5 h-3.5 text-cyan-400" />
                <span>Interactive Bezier Cursor Demo</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                <Wifi className="w-3 h-3" /> ws://127.0.0.1:7483
              </span>
            </div>

            {/* Simulated Browser Viewport */}
            <div className="relative h-56 rounded-xl bg-[#050914] border border-slate-800 overflow-hidden p-4 select-none">
              <div className="flex items-center justify-between mb-5">
                <div className="text-[10px] font-mono text-slate-500">https://demo.drishti.local</div>
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

              <div className="flex items-center gap-2 mt-6">
                <div
                  onClick={() => triggerDemoAction('type')}
                  className={`flex-1 px-3 py-2 rounded-lg border text-xs font-mono cursor-pointer transition ${
                    activeTarget === 'type'
                      ? 'border-cyan-400 bg-slate-900 text-cyan-200 shadow-[0_0_16px_rgba(0,242,254,0.4)]'
                      : 'border-slate-700 bg-slate-900/70 text-slate-400'
                  }`}
                >
                  {demoTyped || 'Click Type below...'}
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
                  Scroll Viewport Target
                </button>
              </div>

              {/* Animated Floating Cursor */}
              <div
                style={{
                  left: `${cursorPos.x}px`,
                  top: `${cursorPos.y}px`,
                  transition:
                    'left 460ms cubic-bezier(0.22, 1, 0.36, 1), top 460ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
                className="absolute pointer-events-none z-20"
              >
                {rippleKey > 0 && activeTarget === 'click' && (
                  <span
                    key={rippleKey}
                    className="absolute -left-3 -top-3 w-8 h-8 rounded-full border-2 border-cyan-400 animate-ping"
                  />
                )}
                <MousePointer2 className="w-5 h-5 text-cyan-400 fill-cyan-400 drop-shadow-[0_0_8px_#00f2fe]" />
                <span className="ml-4 -mt-1 inline-block px-1.5 py-0.5 rounded bg-cyan-400 text-[#050914] font-mono font-black text-[9px] whitespace-nowrap shadow">
                  {cursorLabel}
                </span>
              </div>
            </div>

            {/* Demo Controls */}
            <div className="grid grid-cols-4 gap-1.5">
              {(['hover', 'type', 'click', 'scroll'] as const).map((act) => (
                <button
                  key={act}
                  onClick={() => triggerDemoAction(act)}
                  className="py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 hover:border-cyan-500/50 text-[11px] font-bold uppercase text-cyan-300 transition"
                >
                  {act}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Feature Bento Grid */}
      <section id="features" className="max-w-6xl mx-auto px-5 py-12 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-extrabold text-white">Engineered for Real Browser Automation</h2>
            <p className="text-sm text-slate-400 mt-1">Zero mock behavior — every capability is backed by unit & Playwright E2E tests.</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((feat) => {
            const Icon = feat.icon;
            return (
              <div
                key={feat.title}
                className="bento-card bg-[#0b1222] border border-slate-800/90 hover:border-cyan-500/40 rounded-2xl p-5 space-y-3 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-cyan-950/80 border border-cyan-500/30 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-cyan-400" />
                  </div>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-cyan-300">
                    {feat.badge}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white">{feat.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{feat.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Architecture & Workspace Packages */}
      <section id="architecture" className="max-w-6xl mx-auto px-5 py-12 space-y-6">
        <div>
          <h2 className="text-2xl font-extrabold text-white">Monorepo Architecture</h2>
          <p className="text-sm text-slate-400 mt-1">
            AI Agent -&gt; MCP Server (stdio) -&gt; Local WebSocket Bridge (127.0.0.1:7483) -&gt; Chrome Extension MV3
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PACKAGES.map((pkg) => (
            <div key={pkg.name} className="arch-node bg-[#0b1222] border border-slate-800 rounded-xl p-4 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-cyan-300">
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{pkg.name}</span>
              </div>
              <p className="text-xs text-slate-400">{pkg.role}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Version SSOT & Enterprise Pre-Release Channels */}
      <section id="releases" className="max-w-6xl mx-auto px-5 py-12 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold text-white">Enterprise Versioning & Release Channels</h2>
            <p className="text-sm text-slate-400 mt-1">
              Single Source of Truth in root <code className="text-cyan-300">package.json</code> (currently{' '}
              <strong className="text-white">v{siteData.version}</strong>), synced via <code className="text-cyan-300">scripts/version.mjs</code>.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {CHANNELS.map((ch) => (
            <div key={ch.tag} className="bg-[#0b1222] border border-slate-800 rounded-xl p-4 space-y-1.5">
              <div className="text-xs font-mono font-bold text-cyan-400">{ch.tag}</div>
              <div className="text-sm font-bold text-white">{ch.stage}</div>
              <p className="text-xs text-slate-400">{ch.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive Documentation Portal */}
      <section id="docs" className="max-w-6xl mx-auto px-5 py-12 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold text-white">Complete Documentation Hub</h2>
            <p className="text-sm text-slate-400 mt-1">All repository markdown guides synced automatically at build time.</p>
          </div>
          <input
            type="text"
            value={docQuery}
            onChange={(e) => setDocQuery(e.target.value)}
            placeholder="Filter docs..."
            className="bg-[#0b1222] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="grid lg:grid-cols-12 gap-5 items-start">
          <aside className="lg:col-span-4 space-y-1.5">
            {filteredDocs.map((doc) => (
              <button
                key={doc.id}
                onClick={() => setActiveDocId(doc.id)}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition ${
                  activeDoc?.id === doc.id
                    ? 'bg-cyan-950/60 border-cyan-500/50 text-cyan-200'
                    : 'bg-[#0b1222] border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <span className="truncate">{doc.title}</span>
                <span className="text-[10px] font-mono text-slate-400 ml-2 shrink-0">{doc.category}</span>
              </button>
            ))}
          </aside>

          <article className="lg:col-span-8 bg-[#0b1222] border border-slate-800 rounded-2xl p-6 min-h-[420px]">
            {activeDoc && (
              <>
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4 text-xs text-slate-400">
                  <span className="font-mono text-cyan-300">{activeDoc.file}</span>
                  <span>{activeDoc.category}</span>
                </div>
                <div
                  className="markdown-body"
                  dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
                />
              </>
            )}
          </article>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-8 mt-8 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-5 flex flex-wrap items-center justify-between gap-2">
          <span>Drishti Browser AI · MIT License · SSOT v{siteData.version}</span>
          <span className="flex items-center gap-1.5">
            <Code2 className="w-3.5 h-3.5 text-cyan-400" />
            Built with Vite, React, Tailwind & GSAP
          </span>
        </div>
      </footer>
    </div>
  );
}
