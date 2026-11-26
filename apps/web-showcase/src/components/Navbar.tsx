import React, { useEffect, useRef, useState } from 'react';
import { Github, Menu, X } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
}

export interface NavbarProps {
  version: string;
  repoUrl: string;
  navItems: NavItem[];
}

export const Navbar: React.FC<NavbarProps> = ({ version, repoUrl, navItems }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [mobileMenuOpen]);

  return (
    <header
      ref={containerRef}
      className="sticky top-0 z-50 nav-pill nav-surface border-b border-slate-800/70 bg-[#050914]/85"
    >
      <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between relative">
        <a
          href="#"
          className="nav-brand flex items-center gap-2.5 rounded-xl py-1 pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
        >
          <img
            src="./brand/drishti-icon.svg"
            alt="Drishti Browser AI Icon"
            className="w-8 h-8 rounded-xl shadow-[0_4px_14px_rgba(0,229,255,0.22),0_0_0_1px_rgba(0,229,255,0.2)]"
          />
          <div>
            <span className="font-extrabold tracking-tight text-white text-sm">
              Drishti Browser AI
            </span>
            <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950/80 border border-cyan-500/40 text-cyan-300">
              v{version}
            </span>
          </div>
        </a>

        <nav className="hidden md:flex items-center gap-1.5 text-xs font-semibold text-slate-400">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="nav-link px-2.5 py-1.5 rounded-lg hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
            >
              {item.label}
            </a>
          ))}
          <a
            href={repoUrl}
            target="_blank"
            rel="noreferrer"
            className="nav-cta ml-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/95 border border-slate-700/90 text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
          >
            <Github className="w-3.5 h-3.5" />
            <span>GitHub</span>
          </a>
        </nav>

        {/* Mobile Menu Trigger */}
        <button
          type="button"
          aria-label="Toggle Menu"
          aria-expanded={mobileMenuOpen}
          aria-haspopup="menu"
          onClick={() => setMobileMenuOpen((o) => !o)}
          className="md:hidden nav-icon-btn p-2 rounded-xl bg-slate-900/95 border border-slate-700/90 text-slate-200 hover:border-cyan-500/45 hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
        >
          {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>

        {/* Origin-Aware Mobile Popover */}
        {mobileMenuOpen && (
          <div
            role="menu"
            className="md:hidden nav-popover absolute right-5 top-[calc(100%+8px)] w-64 rounded-2xl border border-slate-700/80 bg-[#081022]/95 backdrop-blur-xl p-2 space-y-0.5"
          >
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setMobileMenuOpen(false)}
                className="nav-link block px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-cyan-300"
              >
                {item.label}
              </a>
            ))}
            <div className="pt-1.5 mt-1.5 border-t border-slate-800/80">
              <a
                href={repoUrl}
                target="_blank"
                rel="noreferrer"
                role="menuitem"
                onClick={() => setMobileMenuOpen(false)}
                className="nav-cta flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-semibold text-cyan-300"
              >
                <Github className="w-3.5 h-3.5" /> GitHub Repo
              </a>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
