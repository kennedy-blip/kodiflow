import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { db, DEFAULT_SETTINGS, seedIfEmpty } from '../db/db';

const AppContext = createContext(null);

export const THEMES = [
  { id: 'midnight', label: 'Architectural Midnight', desc: 'Deep slate-obsidian dark glass' },
  { id: 'estate', label: 'Estate Glass', desc: 'Frosted milk-glass light mode' },
  { id: 'meter', label: 'High-Contrast Meter', desc: 'Bold type for utility shafts' }
];

export function AppProvider({ children }) {
  const [role, setRole] = useState(() => localStorage.getItem('kodiflow-role') || 'admin');
  const [theme, setTheme] = useState(() => localStorage.getItem('kodiflow-theme') || 'midnight');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [toast, setToast] = useState(null);
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        await seedIfEmpty();
        const s = await db.settings.get(1);
        if (s) setSettings(s);
        setReady(true);
      } catch (error) {
        console.error('Database initialization failed', error);
        setStartupError('Could not open local storage. Check browser storage permissions and try again.');
      }
    })();
  }, []);

  useEffect(() => { localStorage.setItem('kodiflow-role', role); }, [role]);
  useEffect(() => {
    localStorage.setItem('kodiflow-theme', theme);
    document.documentElement.setAttribute('data-theme', theme === 'midnight' ? '' : theme);
    if (theme === 'midnight') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const showToast = useCallback((msg, kind = 'success') => {
    setToast({ msg, kind, id: Date.now() });
    setTimeout(() => setToast(null), 3200);
  }, []);

  const updateSettings = useCallback(async (patch) => {
    const next = { ...settings, ...patch };
    await db.settings.put(next);
    setSettings(next);
  }, [settings]);

  const isAdmin = role === 'admin';
  const perms = {
    viewRevenue: isAdmin,
    editRent: isAdmin,
    editTariff: isAdmin,
    deletePayment: isAdmin,
    waiveArrears: isAdmin,
    exportRentRoll: isAdmin,
    approveBudget: isAdmin,
    manageUnits: isAdmin,
    recordMeter: true,
    logTicket: true,
    resolveTicket: true
  };

  return (
    <AppContext.Provider value={{ role, setRole, isAdmin, perms, theme, setTheme, settings, updateSettings, toast, showToast, ready, startupError }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
