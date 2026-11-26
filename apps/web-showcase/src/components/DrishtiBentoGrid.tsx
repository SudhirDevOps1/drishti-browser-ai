import React from 'react';
import {
  ArrowRight,
  Cpu,
  Download,
  Lock,
  MousePointer2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wifi,
} from 'lucide-react';
import { Stage, type Act, type Script } from '../kit';

/* ─── Tile 1: Visual Overlay & Bezier Motion (2x1 Hero UI) ─── */
interface OverlayTileState {
  active: boolean;
  clicked: boolean;
}

const overlayScript: Script<OverlayTileState> = async (act: Act<OverlayTileState>) => {
  await act.wait(250);
  await act.move('tile-cta', { duration: 480 });
  await act.set({ active: true });
  await act.wait(300);
  await act.click('tile-cta');
  await act.set({ clicked: true });
  await act.wait(1100);
};

/* ─── Tile 3: Target Tab Lock (1x1 Component) ─── */
interface LockTileState {
  locked: boolean;
}

const lockScript: Script<LockTileState> = async (act: Act<LockTileState>) => {
  await act.wait(220);
  await act.move('lock-switch', { duration: 420 });
  await act.click('lock-switch');
  await act.set({ locked: true });
  await act.wait(1000);
};

export const DrishtiBentoGrid: React.FC = () => {
  return (
    <section
      id="bento-showcase"
      className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#00E5FF]/30 bg-[#00E5FF]/10 px-3 py-1 text-xs font-mono text-[#00E5FF] mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            INTERACTIVE ARCHITECTURE BENTO
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#F4F7FF]">
            Engineered for Real-Browser Precision
          </h2>
          <p className="mt-2 text-sm sm:text-base text-[#8995AE] max-w-2xl">
            Hover any interactive tile to replay how Drishti locks tabs, dispatches
            trusted CDP events, and guards every boundary.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Hero UI Tile (2 cols): Visual Overlay & Human Bezier Cursor */}
        <div className="md:col-span-2 rounded-2xl border border-[#1E2B4D] bg-[#0B1224]/90 p-5 flex flex-col justify-between gap-4 hover:border-[#00E5FF]/40 transition-colors">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#00E5FF]">
                Visual Control Overlay
              </span>
              <h3 className="text-lg font-semibold text-[#F4F7FF] mt-0.5">
                Collision-Aware Badges &amp; Trusted CDP Hover
              </h3>
              <p className="text-xs text-[#8995AE] mt-1">
                Badges automatically flip below or inset when page text sits above a
                target; `:hover` is dispatched via real CDP without leaking debug bars.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-[#00E5FF]/10 border border-[#00E5FF]/30 px-2.5 py-0.5 text-[10px] font-mono text-[#00E5FF]">
              Hover to replay
            </span>
          </div>

          <Stage<OverlayTileState>
            width={520}
            height={160}
            initial={{ active: false, clicked: false }}
            poster={{ active: true, clicked: true }}
            script={overlayScript}
            play="hover"
            theme="dark"
            palette="accent"
            cursor={{ at: 'tile-cta', kind: 'pointer', ripple: true }}
            tokens={{ '--ss-accent': '#00E5FF' }}
            className="rounded-xl border border-[#1E2B4D] bg-[#070B16]"
          >
            {(s) => (
              <div className="w-full h-full px-5 py-4 flex items-center justify-between gap-4 bg-[#070B16]">
                <div className="space-y-1.5">
                  <div className="text-[11px] font-mono text-[#8995AE]">
                    Card Heading (Never Covered)
                  </div>
                  <div className="text-sm font-semibold text-[#F4F7FF]">
                    {s.clicked
                      ? 'Action Verified · 0px Obstruction'
                      : 'Target Button Ready'}
                  </div>
                </div>

                <div className="relative">
                  <button
                    type="button"
                    data-target="tile-cta"
                    className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
                      s.clicked
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50'
                        : s.active
                          ? 'bg-[#00E5FF] text-[#050B17] ring-2 ring-[#00E5FF]/60 ring-offset-2 ring-offset-[#070B16]'
                          : 'bg-[#142042] text-[#F4F7FF] border border-[#2A3E73]'
                    }`}
                  >
                    {s.clicked ? 'Verified' : 'Inspect Element'}
                  </button>
                  {s.active && !s.clicked && (
                    <span className="absolute -bottom-6 right-0 rounded bg-[#080D1B] border border-[#00E5FF]/60 px-1.5 py-0.5 text-[9px] font-mono text-[#00E5FF] whitespace-nowrap">
                      #07 flipped below
                    </span>
                  )}
                </div>
              </div>
            )}
          </Stage>
        </div>

        {/* 2. Stat Tile (1 col): 55 MCP Tools */}
        <div className="rounded-2xl border border-[#1E2B4D] bg-[#0B1224]/90 p-5 flex flex-col justify-between hover:border-[#625BFF]/50 transition-colors">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#A6A2FF]">
              Protocol Surface
            </span>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-5xl font-bold tracking-tight text-[#F4F7FF] tabular-nums">
                55
              </span>
              <span className="text-sm font-mono text-[#00E5FF]">MCP Tools</span>
            </div>
            <p className="text-xs text-[#8995AE] mt-2">
              Unified navigation, DOM inspection, CDP mouse/keyboard, silent downloads,
              and recorded macro workflows.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-4">
            {['browser_*', 'dom_*', 'cdp_hover', 'download_*', 'macro_*'].map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-[#111B36] border border-[#23335D] px-2 py-0.5 text-[10px] font-mono text-[#B8C7E8]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* 3. Component Tile (1 col): Target Tab Lock */}
        <div className="rounded-2xl border border-[#1E2B4D] bg-[#0B1224]/90 p-5 flex flex-col justify-between gap-4 hover:border-[#00E5FF]/40 transition-colors">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#00E5FF]">
              Safety Lock
            </span>
            <h3 className="text-base font-semibold text-[#F4F7FF] mt-0.5">
              Target Tab Isolation
            </h3>
            <p className="text-xs text-[#8995AE] mt-1">
              Pin automation to a single tab ID so background browsing stays untouched.
            </p>
          </div>

          <Stage<LockTileState>
            width={260}
            height={92}
            initial={{ locked: false }}
            poster={{ locked: true }}
            script={lockScript}
            play="hover"
            theme="dark"
            palette="accent"
            cursor={{ at: 'lock-switch', kind: 'pointer', ripple: true }}
            tokens={{ '--ss-accent': '#00E5FF' }}
            className="rounded-xl border border-[#1E2B4D] bg-[#070B16]"
          >
            {(s) => (
              <div className="w-full h-full px-4 flex items-center justify-between bg-[#070B16]">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                      s.locked
                        ? 'bg-[#00E5FF]/15 border-[#00E5FF]/50 text-[#00E5FF]'
                        : 'bg-[#121D38] border-[#263864] text-[#8995AE]'
                    }`}
                  >
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[#F4F7FF]">
                      {s.locked ? 'Tab #1482' : 'Unlocked'}
                    </div>
                    <div className="text-[10px] font-mono text-[#8995AE]">
                      {s.locked ? 'Pinned' : 'Click to lock'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  data-target="lock-switch"
                  className={`w-10 h-5 rounded-full p-0.5 transition-colors flex items-center ${
                    s.locked ? 'bg-[#00E5FF] justify-end' : 'bg-[#263864] justify-start'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-[#070B16] shadow" />
                </button>
              </div>
            )}
          </Stage>
        </div>

        {/* 4. Diagram Tile (2 cols): 127.0.0.1:7483 Local Bridge Architecture */}
        <div className="md:col-span-2 rounded-2xl border border-[#1E2B4D] bg-[#0B1224]/90 p-5 flex flex-col justify-between gap-4 hover:border-[#625BFF]/40 transition-colors">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#A6A2FF]">
                Loopback Architecture
              </span>
              <h3 className="text-base font-semibold text-[#F4F7FF] mt-0.5">
                On-Demand Local Bridge · 127.0.0.1:7483
              </h3>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-400/30 px-2.5 py-0.5 text-[10px] font-mono text-emerald-300">
              <Wifi className="w-3 h-3" />
              Localhost Only
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
            <div className="rounded-xl border border-[#24345D] bg-[#070B16] p-3 flex items-center gap-2.5">
              <Terminal className="w-4 h-4 text-[#00E5FF] shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[#F4F7FF] truncate">
                  AI Agent (MCP)
                </div>
                <div className="text-[10px] font-mono text-[#8995AE] truncate">
                  stdio JSON-RPC
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[#625BFF]/50 bg-[#101833] p-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Cpu className="w-4 h-4 text-[#A6A2FF] shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#F4F7FF] truncate">
                    Local Bridge
                  </div>
                  <div className="text-[10px] font-mono text-[#00E5FF] truncate">
                    ws://127.0.0.1:7483
                  </div>
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-[#8995AE] hidden sm:block shrink-0" />
            </div>

            <div className="rounded-xl border border-[#24345D] bg-[#070B16] p-3 flex items-center gap-2.5">
              <MousePointer2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[#F4F7FF] truncate">
                  Chrome / Brave MV3
                </div>
                <div className="text-[10px] font-mono text-[#8995AE] truncate">
                  Real Session + CDP
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 5. Zero-Click Downloads (1 col) */}
        <div className="rounded-2xl border border-[#1E2B4D] bg-[#0B1224]/90 p-5 flex flex-col justify-between gap-3 hover:border-[#00E5FF]/40 transition-colors">
          <div className="flex items-center gap-2 text-[#00E5FF]">
            <Download className="w-4 h-4" />
            <span className="text-[11px] font-mono uppercase tracking-wider">
              Silent Downloads
            </span>
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#F4F7FF]">
              Zero-Click Blob &amp; OS Save As
            </h3>
            <p className="text-xs text-[#8995AE] mt-1">
              Intercepts AI blob downloads with <code className="text-[#00E5FF]">saveAs: false</code>{' '}
              and handles native Windows Save As dialogs deterministically.
            </p>
          </div>
        </div>

        {/* 6. Security & MV3 Integrity (2 cols) */}
        <div className="md:col-span-2 rounded-2xl border border-[#1E2B4D] bg-[#0B1224]/90 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-emerald-400/40 transition-colors">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              <span className="text-[11px] font-mono uppercase tracking-wider">
                MV3 Security Boundaries
              </span>
            </div>
            <h3 className="text-base font-semibold text-[#F4F7FF]">
              Strict CSP · 64-Char Auth Token · Zero eval()
            </h3>
            <p className="text-xs text-[#8995AE]">
              No OS auto-start scripts, no external telemetry, and no dynamic code
              evaluation inside the extension runtime.
            </p>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap gap-2 shrink-0">
            <span className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-mono text-emerald-300">
              0 eval()
            </span>
            <span className="rounded-lg border border-[#00E5FF]/30 bg-[#00E5FF]/10 px-3 py-1.5 text-[11px] font-mono text-[#00E5FF]">
              64-char hex
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
