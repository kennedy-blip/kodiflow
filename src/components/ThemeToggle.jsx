import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Moon, Sun, Contrast, Check } from 'lucide-react';
import { useApp, THEMES } from '../context/AppContext';

const ICONS = { midnight: Moon, estate: Sun, meter: Contrast };

export default function ThemeToggle() {
  const { theme, setTheme } = useApp();
  const [open, setOpen] = useState(false);
  const Current = ICONS[theme] || Moon;
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="kf-btn kf-btn-ghost !p-2.5" aria-label="Change theme" aria-haspopup="menu" aria-expanded={open}>
        <Current size={18} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="kf-card-strong absolute right-0 top-12 z-50 w-64 p-2"
              role="menu"
            >
              {THEMES.map((t) => {
                const Icon = ICONS[t.id];
                const active = theme === t.id;
                return (
                  <button key={t.id} onClick={() => { setTheme(t.id); setOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-white/5 transition" role="menuitemradio" aria-checked={active}>
                    <span className={`p-2 rounded-lg border ${active ? 'border-blue-400/60 bg-blue-500/15 text-blue-300' : ''}`} style={{ borderColor: 'var(--kf-border)' }}><Icon size={16} /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold">{t.label}</span>
                      <span className="block text-xs kf-muted truncate">{t.desc}</span>
                    </span>
                    {active && <Check size={16} className="text-emerald-400 shrink-0" />}
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
