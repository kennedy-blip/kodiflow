import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, computeBalance, fmtMoney, currentMonth } from '../db/db';
import { useApp } from '../context/AppContext';
import { spring, StatusBadge } from './ui';
import { Wallet, Droplets, Wrench, AlertTriangle, TrendingUp, Users, Lock } from 'lucide-react';

export default function Dashboard({ go }) {
  const { isAdmin, settings, perms } = useApp();
  const units = useLiveQuery(() => db.units.toArray(), []) || [];
  const payments = useLiveQuery(() => db.payments.toArray(), []) || [];
  const waivers = useLiveQuery(() => db.waivers.toArray(), []) || [];
  const meterLogs = useLiveQuery(() => db.meterLogs.toArray(), []) || [];
  const tickets = useLiveQuery(() => db.tickets.toArray(), []) || [];
  const archives = useLiveQuery(() => db.archives.toArray(), []) || [];
  const month = currentMonth();

  const stats = useMemo(() => {
    const occupied = units.filter((u) => u.status === 'occupied');
    const balances = units.map((u) => computeBalance(u, payments, meterLogs, month, waivers));
    const closed = archives.filter(a => a.closingMonth === month);
    const expected = occupied.reduce((s, u) => s + balances[units.indexOf(u)].due, 0) + closed.reduce((s, a) => s + computeBalance(a.unit, a.payments, a.meterLogs, month, a.waivers).due, 0);
    const collected = balances.reduce((s, b) => s + b.paid, 0) + closed.reduce((s, a) => s + computeBalance(a.unit, a.payments, a.meterLogs, month, a.waivers).paid, 0);
    const arrearsTotal = balances.reduce((s, b) => s + Math.max(0, b.balance), 0);
    const openTickets = tickets.filter((t) => t.status !== 'Resolved');
    const urgent = tickets.filter((t) => t.priority === 'Urgent' && t.status !== 'Resolved');
    const waterBilled = meterLogs.filter((m) => m.month === month).reduce((s, m) => s + Number(m.charge || 0), 0) + closed.reduce((s, a) => s + a.meterLogs.filter(m => m.month === month).reduce((sum, m) => sum + Number(m.charge || 0), 0), 0);
    const occupancy = units.length ? Math.round((occupied.length / units.length) * 100) : 0;
    const collectionRate = expected ? Math.round((collected / expected) * 100) : 0;
    return { occupied, balances, expected, collected, arrearsTotal, openTickets, urgent, waterBilled, occupancy, collectionRate };
  }, [units, payments, meterLogs, tickets, month, waivers, archives]);

  const arrearsList = units
    .map((u) => ({ u, b: computeBalance(u, payments, meterLogs, month, waivers) }))
    .filter((x) => x.u.status === 'occupied' && x.b.balance > 0)
    .sort((a, b) => b.b.balance - a.b.balance);

  const buildings = useMemo(() => {
    const map = {};
    units.forEach((u) => { (map[u.building] = map[u.building] || []).push(u); });
    return Object.entries(map);
  }, [units]);

  const cards = [
    { icon: Wallet, label: 'Collected this month', value: fmtMoney(stats.collected, settings.currency), sub: `${stats.collectionRate}% of ${fmtMoney(stats.expected, settings.currency)} expected`, tone: 'text-emerald-400', show: true },
    { icon: AlertTriangle, label: 'Outstanding arrears', value: fmtMoney(stats.arrearsTotal, settings.currency), sub: `${arrearsList.length} unit(s) owing`, tone: 'text-rose-400', show: true },
    { icon: Droplets, label: 'Water billed', value: fmtMoney(stats.waterBilled, settings.currency), sub: `${meterLogs.filter((m) => m.month === month).length + archives.filter(a => a.closingMonth === month).reduce((n, a) => n + a.meterLogs.filter(m => m.month === month).length, 0)} readings logged`, tone: 'text-blue-400', show: true },
    { icon: Wrench, label: 'Open repairs', value: String(stats.openTickets.length), sub: `${stats.urgent.length} urgent`, tone: 'text-amber-400', show: true }
  ];

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">Portfolio Overview</h2>
        <p className="kf-muted text-sm mt-1">{settings.businessName} • {month} • {stats.occupied.length}/{units.length} units occupied ({stats.occupancy}%)</p>
      </motion.div>

      <div className="kf-card p-3 text-xs kf-muted">Demo portfolio • Data stays on this device. The role switcher is a UI preview, not authentication.</div>
      {!isAdmin && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="kf-card p-4 flex items-start gap-3 border-amber-500/30">
          <Lock size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold">Caretaker field view</p>
            <p className="text-xs kf-muted mt-0.5">You can record meter readings, log repairs and mark tickets resolved. Revenue totals, rent edits and payment deletion are restricted to the Landlord role — switch roles in the header to preview.</p>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {cards.filter(c => isAdmin || c.label === 'Open repairs').map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.06 }} className="kf-card kf-glow-border p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider kf-muted">{c.label}</span>
              <c.icon size={18} className={c.tone} />
            </div>
            <p className="font-display text-xl sm:text-2xl font-extrabold mt-2">{c.value}</p>
            <p className="text-xs kf-muted mt-1">{c.sub}</p>
          </motion.div>
        ))}
      </div>

      {isAdmin ? (
        <div className="grid lg:grid-cols-5 gap-4">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.15 }} className="kf-card p-5 lg:col-span-3">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold flex items-center gap-2"><TrendingUp size={17} className="text-emerald-400" /> Collection vs expected</h3>
              <span className="kf-badge bg-emerald-500/15 text-emerald-400 border-emerald-500/40">{stats.collectionRate}% collected</span>
            </div>
            <div className="space-y-3">
              {buildings.map(([b, us]) => {
                const closed = archives.filter(a => a.closingMonth === month && a.unit.building === b);
                const exp = us.filter((u) => u.status === 'occupied').reduce((s, u) => s + computeBalance(u, payments, meterLogs, month, waivers).due, 0) + closed.reduce((s, a) => s + computeBalance(a.unit, a.payments, a.meterLogs, month, a.waivers).due, 0);
                const col = us.reduce((s, u) => s + computeBalance(u, payments, meterLogs, month, waivers).paid, 0) + closed.reduce((s, a) => s + computeBalance(a.unit, a.payments, a.meterLogs, month, a.waivers).paid, 0);
                const pct = exp ? Math.min(100, Math.round((col / exp) * 100)) : 0;
                return (
                  <div key={b}>
                    <div className="flex justify-between text-xs mb-1.5"><span className="font-bold">{b}</span><span className="kf-muted">{fmtMoney(col, settings.currency)} / {fmtMoney(exp, settings.currency)}</span></div>
                    <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--kf-input)', border: '1px solid var(--kf-border)' }}>
                      <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ ...spring, delay: 0.3 }} className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400" />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="kf-divider my-4" />
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><p className="text-xs kf-muted">Occupancy</p><p className="font-display font-extrabold text-lg">{stats.occupancy}%</p></div>
              <div><p className="text-xs kf-muted">Vacant units</p><p className="font-display font-extrabold text-lg">{units.filter((u) => u.status === 'vacant').length}</p></div>
              <div><p className="text-xs kf-muted">Repair spend</p><p className="font-display font-extrabold text-lg">{fmtMoney(tickets.reduce((s, t) => s + Number(t.cost || 0), 0), settings.currency)}</p></div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.22 }} className="kf-card p-5 lg:col-span-2">
            <h3 className="font-display font-bold flex items-center gap-2 mb-3"><AlertTriangle size={17} className="text-rose-400" /> Arrears watchlist</h3>
            {arrearsList.length === 0 ? (
              <p className="text-sm kf-muted">All occupied units are fully paid. 🎉</p>
            ) : (
              <ul className="space-y-2.5">
                {arrearsList.slice(0, 5).map(({ u, b }) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: 'var(--kf-input)', border: '1px solid var(--kf-border)' }}>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">Unit {u.code} • {u.tenantName || '—'}</p>
                      <p className="text-[11px] kf-muted">{u.building}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-extrabold text-rose-400">{fmtMoney(b.balance, settings.currency)}</p>
                      <StatusBadge status={b.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button onClick={() => go('rent')} className="kf-btn w-full mt-4">Open rent ledger</button>
          </motion.div>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.15 }} className="kf-card p-5">
          <h3 className="font-display font-bold flex items-center gap-2 mb-3"><Users size={17} className="text-blue-400" /> Field checklist</h3>
          <div className="grid sm:grid-cols-3 gap-3">
            <button onClick={() => go('water')} className="kf-card p-4 text-left hover:scale-[1.02] transition">
              <Droplets size={20} className="text-blue-400" />
              <p className="font-bold text-sm mt-2">Record meter readings</p>
              <p className="text-xs kf-muted mt-0.5">{meterLogs.filter((m) => m.month === month).length} logged this month</p>
            </button>
            <button onClick={() => go('repairs')} className="kf-card p-4 text-left hover:scale-[1.02] transition">
              <Wrench size={20} className="text-amber-400" />
              <p className="font-bold text-sm mt-2">Log / resolve repairs</p>
              <p className="text-xs kf-muted mt-0.5">{stats.openTickets.length} open • {stats.urgent.length} urgent</p>
            </button>
            <button onClick={() => go('rent')} className="kf-card p-4 text-left hover:scale-[1.02] transition">
              <Wallet size={20} className="text-emerald-400" />
              <p className="font-bold text-sm mt-2">View unit balances</p>
              <p className="text-xs kf-muted mt-0.5">{arrearsList.length} unit(s) with balance</p>
            </button>
          </div>
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.28 }} className="kf-card p-5">
        <h3 className="font-display font-bold mb-3">Occupancy grid</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {units.map((u) => {
            const b = computeBalance(u, payments, meterLogs, month, waivers);
            return (
              <button key={u.id} onClick={() => go('rent')} className="kf-card p-3.5 text-left hover:scale-[1.03] transition" aria-label={`Unit ${u.code} ${b.status}`}>
                <div className="flex items-center justify-between">
                  <span className="font-display font-extrabold">{u.code}</span>
                  <StatusBadge status={b.status} />
                </div>
                <p className="text-[11px] kf-muted mt-1 truncate">{u.tenantName || 'Vacant'} • {u.type}</p>
                {u.status === 'occupied' && <p className="text-xs font-bold mt-1">{b.balance <= 0 ? 'Settled' : `${fmtMoney(b.balance, settings.currency)} due`}</p>}
              </button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
