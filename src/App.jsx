import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Receipt, Droplets, Wrench, Settings, Download, WifiOff, CheckCircle2, AlertCircle, Building2 } from 'lucide-react';
import { AppProvider, useApp } from './context/AppContext';
import { spring } from './components/ui';
import RoleSwitcher from './components/RoleSwitcher';
import ThemeToggle from './components/ThemeToggle';
import DownloadAPKModal from './components/DownloadAPKModal';
import Dashboard from './components/Dashboard';
import RentLedger from './components/RentLedger';
import WaterMeterBilling from './components/WaterMeterBilling';
import MaintenanceTracker from './components/MaintenanceTracker';
import SettingsView from './components/Settings';

const NAV = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, short: 'Home' },
  { id: 'rent', label: 'Rent Roll', icon: Receipt, short: 'Rent Roll' },
  { id: 'water', label: 'Water Meters', icon: Droplets, short: 'Water' },
  { id: 'repairs', label: 'Repairs', icon: Wrench, short: 'Repairs' },
  { id: 'settings', label: 'Settings', icon: Settings, short: 'Settings' }
];

function Shell() {
  const [view, setView] = useState('dashboard');
  const [apkOpen, setApkOpen] = useState(false);
  const { toast, settings, ready, startupError } = useApp();

  const go = (v) => { setView(v); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <div className="min-h-full flex flex-col">
      <div className="kf-mesh" aria-hidden="true" />
      <div className="kf-mesh-grid" aria-hidden="true" />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b" style={{ borderColor: 'var(--kf-border)', background: 'var(--kf-surface)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <button onClick={() => go('dashboard')} className="flex items-center gap-2.5 shrink-0" aria-label="KodiFlow home">
            <span className="p-2 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-500 to-emerald-500 text-white shadow-lg"><Building2 size={19} /></span>
            <span className="text-left leading-none">
              <span className="block font-display font-extrabold text-lg tracking-tight">KodiFlow</span>
              <span className="hidden sm:block text-[10px] kf-muted font-semibold uppercase tracking-widest mt-0.5">Rental • Water • Caretaker OS</span>
            </span>
          </button>
          <div className="flex-1" />
          <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] font-bold kf-muted"><WifiOff size={13} className="text-emerald-400" /> Offline-ready</span>
          <RoleSwitcher />
          <ThemeToggle />
          <button onClick={() => setApkOpen(true)} className="kf-btn kf-btn-primary !py-2 hidden sm:inline-flex"><Download size={15} /> <span className="hidden lg:inline">Get APK</span></button>
        </div>
      </header>

      <div className="flex-1 w-full max-w-7xl mx-auto flex gap-5 px-4 sm:px-6 py-5 pb-24 lg:pb-8">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex flex-col gap-1.5 w-56 shrink-0">
          <nav className="kf-card p-2.5 space-y-1 sticky top-24" aria-label="Primary">
            {NAV.map((n) => {
              const Icon = n.icon;
              const active = view === n.id;
              return (
                <button key={n.id} onClick={() => go(n.id)} className={`kf-nav-item w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${active ? 'kf-nav-active' : ''}`} aria-current={active ? 'page' : undefined}>
                  <Icon size={17} /> {n.label}
                </button>
              );
            })}
            <div className="kf-divider my-2" />
            <button onClick={() => setApkOpen(true)} className="kf-btn kf-btn-primary w-full"><Download size={16} /> Download Android APK</button>
            <p className="text-[11px] kf-muted text-center px-2 pt-1">{settings.businessName}</p>
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0">
          {!ready ? (
            <div className="kf-card p-10 text-center">
              {startupError ? <><AlertCircle size={28} className="text-rose-400 inline-block" /><p className="font-bold mt-3">Storage unavailable</p><p className="text-sm kf-muted">{startupError}</p><button onClick={() => window.location.reload()} className="kf-btn mt-4">Retry</button></> : <><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }} className="inline-block"><Droplets size={28} className="text-blue-400" /></motion.div><p className="font-bold mt-3">Loading KodiFlow…</p><p className="text-sm kf-muted">Preparing your offline database</p></>}
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div key={view} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={spring}>
                {view === 'dashboard' && <Dashboard go={go} />}
                {view === 'rent' && <RentLedger />}
                {view === 'water' && <WaterMeterBilling />}
                {view === 'repairs' && <MaintenanceTracker />}
                {view === 'settings' && <SettingsView onOpenApk={() => setApkOpen(true)} />}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 border-t" style={{ borderColor: 'var(--kf-border)', background: 'var(--kf-surface-strong)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }} aria-label="Mobile">
        <div className="grid grid-cols-5">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = view === n.id;
            return (
              <button key={n.id} onClick={() => go(n.id)} className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold transition ${active ? 'text-blue-400' : 'kf-muted'}`} aria-current={active ? 'page' : undefined}>
                <Icon size={20} /> {n.short}
              </button>
            );
          })}
        </div>
      </nav>

      <DownloadAPKModal open={apkOpen} onClose={() => setApkOpen(false)} />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div key={toast.id} initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.97 }} transition={spring}
            className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-[90] kf-card-strong kf-glow-border px-4 py-3 flex items-center gap-2.5 max-w-[92vw]"
            role="status" aria-live="polite">
            {toast.kind === 'error' ? <AlertCircle size={18} className="text-rose-400 shrink-0" /> : <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />}
            <span className="text-sm font-semibold">{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
