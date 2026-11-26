import React from 'react';
import { Check, Lock, MousePointer2, ShieldCheck, Sparkles, Terminal } from 'lucide-react';
import { Stage, Window, type Act, type Script } from '../kit';

interface HeroSceneState {
  locked: boolean;
  hoveredTarget: 'lock' | 'input' | 'submit' | null;
  focusedInput: boolean;
  email: string;
  submitting: boolean;
  verified: boolean;
  hudText: string;
  telemetry: string;
}

const INITIAL_STATE: HeroSceneState = {
  locked: false,
  hoveredTarget: null,
  focusedInput: false,
  email: '',
  submitting: false,
  verified: false,
  hudText: 'IDLE · Awaiting MCP command',
  telemetry: 'ws://127.0.0.1:7483 · READY',
};

const POSTER_STATE: HeroSceneState = {
  locked: true,
  hoveredTarget: 'submit',
  focusedInput: false,
  email: 'agent@drishti.dev',
  submitting: false,
  verified: true,
  hudText: 'VERIFIED · Click dispatched via CDP',
  telemetry: 'tab:1482 · 200 OK · 14ms',
};

const heroScript: Script<HeroSceneState> = async (act: Act<HeroSceneState>) => {
  await act.wait(450);

  // 1. Lock target tab
  await act.move('lock-btn', { duration: 480 });
  await act.set({ hoveredTarget: 'lock', hudText: 'LOCKING · Target Tab #1482' });
  await act.click('lock-btn');
  await act.set({
    locked: true,
    hudText: 'LOCKED · Tab #1482 pinned',
    telemetry: 'tab:1482 · LOCKED',
  });
  await act.wait(350);

  // 2. Focus email input & type via human cadence
  await act.move('email-input', { duration: 520 });
  await act.set({
    hoveredTarget: 'input',
    focusedInput: true,
    hudText: 'TYPING · Input.dispatchKeyEvent',
  });
  await act.click('email-input');
  await act.type('email', 'agent@drishti.dev', { interval: 42 });
  await act.wait(280);

  // 3. Move to primary CTA, hover with glowing bounding box, click & verify
  await act.move('submit-btn', { duration: 500 });
  await act.set({
    hoveredTarget: 'submit',
    focusedInput: false,
    hudText: 'HOVER · :hover verified via CDP',
  });
  await act.wait(320);

  await act.click('submit-btn');
  await act.set({
    submitting: true,
    hudText: 'CLICKING · Trusted MouseEvent',
  });
  await act.wait(380);

  await act.set({
    submitting: false,
    verified: true,
    hudText: 'VERIFIED · DOM & Visual state synced',
    telemetry: 'tab:1482 · 200 OK · 14ms',
  });
  await act.wait(1900);
};

export const DrishtiHeroStage: React.FC = () => {
  return (
    <div className="relative rounded-2xl border border-[#22325A]/80 bg-[#080D1B]/80 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl">
      <Stage<HeroSceneState>
        width={560}
        height={370}
        compact={{ below: 420, width: 340, height: 340 }}
        initial={INITIAL_STATE}
        poster={POSTER_STATE}
        script={heroScript}
        play="loop"
        theme="dark"
        palette="accent"
        cursor={{
          at: 'lock-btn',
          kind: 'pointer',
          ripple: true,
          idle: 3500,
        }}
        tokens={{
          '--ss-accent': '#00E5FF',
          '--ss-font': "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          '--ss-mono': "'JetBrains Mono', ui-monospace, monospace",
        }}
        className="rounded-xl overflow-hidden"
      >
        {(s, _rect, layout) => {
          const isCompact = layout === 'compact';
          return (
            <div className="w-full h-full bg-[#070B16] flex items-center justify-center p-3 sm:p-4">
              <Window
                chrome="glass"
                lights="grey"
                nav={!isCompact}
                urlShape="pill"
                url={
                  <span className="font-mono text-[11px] text-[#B8C7E8] flex items-center gap-1.5">
                    <Lock className="w-3 h-3 text-[#00E5FF]" />
                    app.drishti.ai/session
                  </span>
                }
                className="w-full h-full shadow-2xl"
              >
                <div className="h-full bg-[#0A1124] text-[#F4F7FF] p-3.5 sm:p-4 flex flex-col justify-between relative overflow-hidden">
                  {/* Top HUD Banner */}
                  <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#1E2B4D]/80">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-flex h-2 w-2 rounded-full bg-[#00E5FF] shadow-[0_0_8px_#00E5FF]" />
                      <span className="font-mono text-[10px] tracking-wide text-[#00E5FF] truncate">
                        {s.hudText}
                      </span>
                    </div>

                    <button
                      type="button"
                      data-target="lock-btn"
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-mono transition-all border ${
                        s.locked
                          ? 'bg-[#00E5FF]/15 text-[#00E5FF] border-[#00E5FF]/50 shadow-[0_0_12px_rgba(0,229,255,0.22)]'
                          : 'bg-[#111B36] text-[#9FB0D0] border-[#263864]'
                      } ${s.hoveredTarget === 'lock' ? 'ring-2 ring-[#00E5FF]/70' : ''}`}
                    >
                      <Lock className="w-2.5 h-2.5" />
                      {s.locked ? 'Tab #1482 Locked' : 'Lock Tab'}
                    </button>
                  </div>

                  {/* Interactive Form Surface */}
                  <div className="my-auto py-2 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[13px] font-semibold text-[#F4F7FF]">
                          Autonomous Session Dispatch
                        </p>
                        <p className="text-[11px] text-[#8995AE]">
                          Real Chrome/Brave session · Zero re-login
                        </p>
                      </div>
                      {!isCompact && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#625BFF]/15 border border-[#625BFF]/40 px-2 py-0.5 text-[10px] font-mono text-[#A6A2FF]">
                          <Sparkles className="w-2.5 h-2.5" />
                          CDP Live
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-mono uppercase tracking-wider text-[#8995AE]">
                        Agent Operator
                      </label>
                      <div
                        data-target="email-input"
                        className={`relative rounded-lg border px-3 py-2 text-[12px] font-mono transition-all flex items-center justify-between ${
                          s.focusedInput || s.hoveredTarget === 'input'
                            ? 'bg-[#0E1833] border-[#00E5FF] shadow-[0_0_0_2px_rgba(0,229,255,0.18)] text-[#F4F7FF]'
                            : 'bg-[#0D152B] border-[#24345D] text-[#D7E1F8]'
                        }`}
                      >
                        <span className="truncate">
                          {s.email || (
                            <span className="text-[#59688A]">operator@workspace.ai</span>
                          )}
                          {s.focusedInput && (
                            <span className="inline-block w-[1.5px] h-3.5 bg-[#00E5FF] ml-0.5 align-middle animate-pulse" />
                          )}
                        </span>
                        {s.hoveredTarget === 'input' && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#00E5FF]/15 text-[#00E5FF]">
                            #01 input
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="pt-1 flex items-center justify-between gap-2">
                      <div
                        data-target="submit-btn"
                        className={`relative flex-1 rounded-lg px-3.5 py-2 text-[12px] font-semibold text-center transition-all flex items-center justify-center gap-2 ${
                          s.verified
                            ? 'bg-emerald-500/20 border border-emerald-400/60 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                            : s.submitting
                              ? 'bg-[#00E5FF]/80 text-[#04101E]'
                              : 'bg-gradient-to-r from-[#00E5FF] to-[#625BFF] text-[#050B17]'
                        } ${
                          s.hoveredTarget === 'submit' && !s.verified
                            ? 'ring-2 ring-[#00E5FF] ring-offset-2 ring-offset-[#0A1124]'
                            : ''
                        }`}
                      >
                        {s.verified ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Dispatched &amp; Verified
                          </>
                        ) : (
                          <>
                            <MousePointer2 className="w-3.5 h-3.5" />
                            {s.submitting ? 'Executing CDP Click…' : 'Run Visual Action'}
                          </>
                        )}

                        {s.hoveredTarget === 'submit' && !s.verified && (
                          <span className="absolute -bottom-6 right-0 rounded bg-[#080D1B] border border-[#00E5FF]/60 px-1.5 py-0.5 text-[9px] font-mono text-[#00E5FF] shadow-lg whitespace-nowrap">
                            #02 button:hover
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Telemetry Footer */}
                  <div className="pt-2 border-t border-[#1E2B4D]/80 flex items-center justify-between text-[10px] font-mono text-[#8995AE]">
                    <span className="flex items-center gap-1.5">
                      <Terminal className="w-3 h-3 text-[#625BFF]" />
                      {s.telemetry}
                    </span>
                    <span className="flex items-center gap-1 text-emerald-400">
                      <ShieldCheck className="w-3 h-3" />
                      0 eval()
                    </span>
                  </div>
                </div>
              </Window>
            </div>
          );
        }}
      </Stage>
    </div>
  );
};
