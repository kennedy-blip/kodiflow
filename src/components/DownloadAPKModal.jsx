import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Smartphone, ShieldCheck, WifiOff, Terminal, Copy, Check, Loader2, Package } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Capacitor } from '@capacitor/core';

export default function DownloadAPKModal({ open, onClose }) {
  const { showToast } = useApp();
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const isNative = Capacitor.isNativePlatform();

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch('/kodiflow.apk');
      if (!res.ok) throw new Error('APK not found');
      const blob = await res.blob();
      const magic = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      if (blob.size < 100000 || magic[0] !== 0x50 || magic[1] !== 0x4b || magic[2] !== 3 || magic[3] !== 4) throw new Error('No valid APK available');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'KodiFlow.apk'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      showToast('KodiFlow.apk download started');
    } catch {
      showToast('APK binary not bundled — see build steps below', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const copyCmd = async (cmd) => {
    try { await navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { showToast('Copy failed — select text manually', 'error'); }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 40, opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="kf-card-strong kf-glow-border w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto kf-scroll"
            onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Download Android APK"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-500 text-white shadow-lg"><Smartphone size={22} /></span>
                <div>
                  <h3 className="font-display font-bold text-lg leading-tight">Get KodiFlow for Android</h3>
                  <p className="text-xs kf-muted">One-tap install • Works fully offline</p>
                </div>
              </div>
              <button onClick={onClose} className="kf-btn kf-btn-ghost !p-2" aria-label="Close"><X size={18} /></button>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              {[
                { icon: WifiOff, label: '100% Offline', sub: 'IndexedDB' },
                { icon: ShieldCheck, label: 'Private', sub: 'On-device data' },
                { icon: Package, label: 'Android', sub: 'Debug build' }
              ].map((f) => (
                <div key={f.label} className="kf-card p-3">
                  <f.icon size={18} className="mx-auto text-blue-400" />
                  <p className="text-xs font-bold mt-1.5">{f.label}</p>
                  <p className="text-[11px] kf-muted">{f.sub}</p>
                </div>
              ))}
            </div>

            {!isNative && <button onClick={handleDownload} disabled={downloading} className="kf-btn kf-btn-primary w-full mt-5 !py-3.5 !text-base animate-pulse-glow">
              {downloading ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
              {downloading ? 'Preparing download…' : 'Download Android APK'}
            </button>}
            <p className="text-[11px] kf-muted text-center mt-2">{isNative ? 'You are already using the Android app. Open the KodiFlow website in a browser to download an APK.' : 'Debug build for testing. Android may ask you to allow installation from your browser.'}</p>

            <div className="kf-divider my-5" />
            <div className="flex items-center gap-2 text-sm font-bold"><Terminal size={16} className="text-blue-400" /> Build your own signed APK</div>
            <p className="text-xs kf-muted mt-1">Maintainers can compile a fresh APK from source with Capacitor:</p>
            <div className="mt-3 space-y-2">
              {['npm install', 'npm run build', 'npm run cap:sync', 'npx cap open android  # then Build → Generate Signed Bundle/APK'].map((cmd) => (
                <div key={cmd} className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-mono" style={{ background: 'var(--kf-input)', border: '1px solid var(--kf-border)' }}>
                  <span className="flex-1 truncate">{cmd}</span>
                  <button onClick={() => copyCmd(cmd)} className="kf-btn kf-btn-ghost !p-1.5" aria-label="Copy command">{copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}</button>
                </div>
              ))}
            </div>
            <p className="text-[11px] kf-muted mt-3">The web app can be added to your home screen after the first online visit.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
