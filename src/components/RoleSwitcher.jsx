import React from 'react';
import { motion } from 'framer-motion';
import { Crown, HardHat } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function RoleSwitcher() {
  const { role, setRole, showToast } = useApp();
  const opts = [
    { id: 'admin', label: 'Landlord', icon: Crown, hint: 'Full admin' },
    { id: 'caretaker', label: 'Caretaker', icon: HardHat, hint: 'Field staff' }
  ];
  return (
    <div className="flex items-center gap-1 p-1 rounded-2xl border" style={{ borderColor: 'var(--kf-border)', background: 'var(--kf-surface)' }} role="tablist" aria-label="Role switcher">
      {opts.map((o) => {
        const Icon = o.icon;
        const active = role === o.id;
        return (
          <button
            key={o.id}
            onClick={() => { setRole(o.id); showToast(`Switched to ${o.label} view`, 'info'); }}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${active ? 'text-white' : 'kf-muted'}`}
            aria-pressed={active}
          >
            {active && (
              <motion.span layoutId="role-pill" className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-500 shadow-lg"
                transition={{ type: 'spring', stiffness: 300, damping: 25 }} />
            )}
            <Icon size={14} className="relative z-10" />
            <span className="relative z-10 hidden sm:inline">{o.label}</span>
            <span className="relative z-10 sm:hidden">{o.id === 'admin' ? 'Admin' : 'Field'}</span>
          </button>
        );
      })}
    </div>
  );
}
