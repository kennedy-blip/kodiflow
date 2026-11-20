import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { db, getStorageStats, downloadJSON, seedIfEmpty, DEFAULT_SETTINGS } from '../db/db';
import { exportBackup, restoreBackup } from '../db/backup';
import { useApp, THEMES } from '../context/AppContext';
import { spring, Field, ConfirmButton } from './ui';
import { Smartphone, Database, Moon, Sun, Contrast, Download, Upload, Trash2, ShieldCheck, Building2, Phone, User } from 'lucide-react';

const THEME_ICONS = { midnight: Moon, estate: Sun, meter: Contrast };

export default function Settings({ onOpenApk }) {
  const { settings, updateSettings, theme, setTheme, role, isAdmin, showToast } = useApp();
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState({ businessName: '', currency: 'KSh', managerName: '', managerPhone: '' });

  useEffect(() => { getStorageStats().then(setStats); }, []);
  useEffect(() => { setForm({ businessName: settings.businessName, currency: settings.currency, managerName: settings.managerName, managerPhone: settings.managerPhone }); }, [settings]);

  const save = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    await updateSettings(form);
    showToast('Settings saved');
  };

  const exportAll = async () => {
    if (!isAdmin) return;
    try {
      const data = await exportBackup();
      downloadJSON(`kodiflow-backup-${new Date().toISOString().slice(0, 10)}.json`, data);
      showToast('Full backup exported');
    } catch { showToast('Could not export backup', 'error'); }
  };

  const importAll = async (e) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file || !isAdmin) return;
    try {
      const data = JSON.parse(await file.text());
      if (!window.confirm('Restore this backup? It will replace ALL data on this device. Export a backup first.')) return;
      const restored = await restoreBackup(data);
      await updateSettings(restored);
      showToast('Backup restored ✓');
      getStorageStats().then(setStats);
    } catch (error) { showToast(`Import failed: ${error.message}`, 'error'); }
    finally { input.value = ''; }
  };

  const resetAll = async () => {
    if (!isAdmin) return;
    await db.transaction('rw', db.units, db.payments, db.meterLogs, db.tickets, db.waivers, db.archives, db.settings, async () => {
      await Promise.all([db.units.clear(), db.payments.clear(), db.meterLogs.clear(), db.tickets.clear(), db.waivers.clear(), db.archives.clear(), db.settings.clear()]);
      await seedIfEmpty();
    });
    await updateSettings(DEFAULT_SETTINGS);
    showToast('Data reset to demo portfolio');
    getStorageStats().then(setStats);
  };

  const fmtBytes = (b) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`;

  return (
    <div className="space-y-4 max-w-3xl">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <h2 className="font-display text-2xl font-extrabold tracking-tight">Settings & APK Center</h2>
        <p className="kf-muted text-sm">Theme, portfolio profile, offline storage and Android app.</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.05 }} className="kf-card kf-glow-border p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-500 text-white"><Smartphone size={22} /></span>
            <div>
              <h3 className="font-display font-bold">KodiFlow for Android</h3>
              <p className="text-xs kf-muted">Android • Offline-first • Build from source</p>
            </div>
          </div>
          <button onClick={onOpenApk} className="kf-btn kf-btn-primary !py-3 animate-pulse-glow"><Download size={18} /> Download Android APK</button>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4 text-center text-xs">
          <div className="rounded-xl py-2.5" style={{ background: 'var(--kf-input)' }}><p className="font-bold">Works offline</p><p className="kf-muted mt-0.5">Dexie / IndexedDB</p></div>
          <div className="rounded-xl py-2.5" style={{ background: 'var(--kf-input)' }}><p className="font-bold">Private by design</p><p className="kf-muted mt-0.5">Data stays on device</p></div>
          <div className="rounded-xl py-2.5" style={{ background: 'var(--kf-input)' }}><p className="font-bold">Android package</p><p className="kf-muted mt-0.5">Capacitor build</p></div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 }} className="kf-card p-5">
        <h3 className="font-display font-bold mb-3">Theme engine</h3>
        <div className="grid sm:grid-cols-3 gap-2">
          {THEMES.map((t) => {
            const Icon = THEME_ICONS[t.id];
            const active = theme === t.id;
            return (
              <button key={t.id} onClick={() => setTheme(t.id)} className={`kf-card p-4 text-left transition ${active ? 'kf-glow-border' : ''}`} aria-pressed={active} style={active ? { borderColor: 'rgba(59,130,246,.7)' } : {}}>
                <Icon size={20} className={active ? 'text-blue-400' : 'kf-muted'} />
                <p className="font-bold text-sm mt-2">{t.label}</p>
                <p className="text-xs kf-muted mt-0.5">{t.desc}</p>
                {active && <p className="text-[11px] font-bold text-emerald-400 mt-2">● Active</p>}
              </button>
            );
          })}
        </div>
      </motion.div>

      <motion.form onSubmit={save} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.15 }} className="kf-card p-5 space-y-3">
        <h3 className="font-display font-bold flex items-center gap-2"><Building2 size={17} className="text-blue-400" /> Portfolio profile</h3>
        <fieldset disabled={!isAdmin} className="grid sm:grid-cols-2 gap-3">
          <Field label="Business / estate name"><input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} className="kf-input" /></Field>
          <Field label="Currency"><input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="kf-input" placeholder="KSh" /></Field>
          <Field label="Manager name"><input value={form.managerName} onChange={(e) => setForm({ ...form, managerName: e.target.value })} className="kf-input" /></Field>
          <Field label="Manager phone"><input value={form.managerPhone} onChange={(e) => setForm({ ...form, managerPhone: e.target.value })} className="kf-input" /></Field>
        </fieldset>
        {isAdmin && <button type="submit" className="kf-btn kf-btn-primary">Save profile</button>}
        <p className="text-[11px] kf-muted inline-flex items-center gap-1 ml-2"><User size={12} /> Signed in as: {role === 'admin' ? 'Property Owner / Landlord (Admin)' : 'Apartment Caretaker (Field Staff)'}</p>
      </motion.form>

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.2 }} className="kf-card p-5">
        <h3 className="font-display font-bold flex items-center gap-2"><Database size={17} className="text-emerald-400" /> Offline storage</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-center">
          {[
            ['Units', stats?.units ?? '—'], ['Payments', stats?.payments ?? '—'],
            ['Meter logs', stats?.meterLogs ?? '—'], ['Tickets', stats?.tickets ?? '—']
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl py-3" style={{ background: 'var(--kf-input)', border: '1px solid var(--kf-border)' }}>
              <p className="font-display font-extrabold text-lg">{v}</p><p className="text-[11px] kf-muted">{k}</p>
            </div>
          ))}
        </div>
        <p className="text-xs kf-muted mt-3">IndexedDB usage: <strong style={{ color: 'var(--kf-text)' }}>{stats ? fmtBytes(stats.bytes) : '…'}</strong> • All records are stored locally and work without internet. Export a backup before clearing browser data.</p>
        {isAdmin && <div className="flex flex-wrap gap-2 mt-4">
          <button onClick={exportAll} className="kf-btn"><Download size={15} /> Export backup (JSON)</button>
          <label className="kf-btn cursor-pointer"><Upload size={15} /> Import backup<input type="file" accept="application/json" className="hidden" onChange={importAll} /></label>
          <ConfirmButton label={<span className="inline-flex items-center gap-1.5"><Trash2 size={14} /> Reset demo data</span>} onConfirm={resetAll} />
        </div>}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.25 }} className="kf-card p-5 flex items-start gap-3">
        <ShieldCheck size={20} className="text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-display font-bold">Role privileges</h3>
          <ul className="text-xs kf-muted mt-1.5 space-y-1 list-disc pl-4">
            <li><strong style={{ color: 'var(--kf-text)' }}>Landlord (Admin):</strong> revenue analytics, rent & tariff edits, arrears waivers, budget approval, payment deletion, CSV rent-roll export.</li>
            <li><strong style={{ color: 'var(--kf-text)' }}>Caretaker (Field):</strong> meter readings, repair logging & resolution only — financial controls stay locked.</li>
          </ul>
          <p className="text-[11px] kf-muted mt-2 inline-flex items-center gap-1"><Phone size={12} /> Support: {settings.managerPhone}</p>
        </div>
      </motion.div>
    </div>
  );
}
