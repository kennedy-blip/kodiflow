import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

export const spring = { type: 'spring', stiffness: 300, damping: 25 };

export function Modal({ open, onClose, title, children, wide, printContent = false }) {
  if (!open) return null;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`${printContent ? 'print-invoice' : ''} fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm`} onClick={onClose}>
      <motion.div
        initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={spring}
        className={`kf-card-strong kf-glow-border w-full ${wide ? 'max-w-2xl' : 'max-w-md'} p-5 sm:p-6 max-h-[92vh] overflow-y-auto kf-scroll rounded-b-none sm:rounded-b-[1.25rem]`}
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}
      >
        <div className="flex items-center justify-between gap-4 mb-4">
          <h3 className="font-display font-bold text-base sm:text-lg">{title}</h3>
          <button onClick={onClose} className="kf-btn kf-btn-ghost !p-2" aria-label="Close dialog"><X size={18} /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

export function StatusBadge({ status }) {
  const map = {
    Paid: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
    Partial: 'bg-amber-500/15 text-amber-400 border-amber-500/40',
    Unpaid: 'bg-rose-500/15 text-rose-400 border-rose-500/40',
    Vacant: 'bg-slate-500/15 text-slate-400 border-slate-500/40',
    Occupied: 'bg-blue-500/15 text-blue-400 border-blue-500/40',
    Open: 'bg-rose-500/15 text-rose-400 border-rose-500/40',
    'In Progress': 'bg-amber-500/15 text-amber-400 border-amber-500/40',
    Resolved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
    Urgent: 'bg-rose-500/15 text-rose-400 border-rose-500/40',
    Routine: 'bg-blue-500/15 text-blue-400 border-blue-500/40'
  };
  return <span className={`kf-badge ${map[status] || 'bg-slate-500/15 text-slate-300 border-slate-500/40'}`}>{status}</span>;
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold uppercase tracking-wider kf-muted mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11px] kf-muted mt-1">{hint}</span>}
    </label>
  );
}

export function EmptyState({ icon: Icon, title, desc, action }) {
  return (
    <div className="kf-card p-8 text-center">
      <span className="inline-flex p-3 rounded-2xl" style={{ background: 'var(--kf-surface)', border: '1px solid var(--kf-border)' }}><Icon size={24} className="kf-muted" /></span>
      <h4 className="font-bold mt-3">{title}</h4>
      <p className="text-sm kf-muted mt-1">{desc}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ConfirmButton({ label, onConfirm, className = '' }) {
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3000); return () => clearTimeout(t); }, [armed]);
  if (!armed) return <button onClick={() => setArmed(true)} className={`kf-btn kf-btn-danger !py-1.5 !px-3 !text-xs ${className}`}>{label}</button>;
  return <button onClick={onConfirm} className={`kf-btn !py-1.5 !px-3 !text-xs bg-rose-600 text-white border-rose-400 ${className}`}>Confirm delete?</button>;
}
