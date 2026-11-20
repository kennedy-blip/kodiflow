import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, fmtMoney, fmtDate, currentMonth, computeBalance, recordMeterReading } from '../db/db';
import { useApp } from '../context/AppContext';
import { spring, Modal, Field, EmptyState } from './ui';
import { Droplets, Calculator, History, Printer, Settings2 } from 'lucide-react';

export default function WaterMeterBilling() {
  const { settings, updateSettings, perms, showToast, role } = useApp();
  const units = useLiveQuery(() => db.units.toArray(), []) || [];
  const meterLogs = useLiveQuery(() => db.meterLogs.toArray(), []) || [];
  const payments = useLiveQuery(() => db.payments.toArray(), []) || [];
  const waivers = useLiveQuery(() => db.waivers.toArray(), []) || [];
  const month = currentMonth();

  const [unitId, setUnitId] = useState('');
  const [prev, setPrev] = useState('');
  const [curr, setCurr] = useState('');
  const [tariffDraft, setTariffDraft] = useState(String(settings.waterTariff));
  const [invoiceId, setInvoiceId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedRevision, setSelectedRevision] = useState(null);
  useEffect(() => setTariffDraft(String(settings.waterTariff)), [settings.waterTariff]);

  const unit = units.find((u) => u.id === Number(unitId)) || null;
  const hasHistory = !!unit && (Boolean(unit.billingStartMonth) || meterLogs.some(m => m.unitId === unit.id));
  const consumption = useMemo(() => {
    const p = Number(prev), c = Number(curr);
    if (prev === '' || curr === '' || isNaN(p) || isNaN(c)) return null;
    return c - p;
  }, [prev, curr]);
  const charge = consumption === null ? null : Math.max(0, consumption) * Number(settings.waterTariff || 0);

  const pickUnit = (id) => {
    setUnitId(id);
    const u = units.find((x) => x.id === Number(id));
    if (u) {
      setSelectedRevision(u.tenancyRevision || 0);
      const last = meterLogs.filter((m) => m.unitId === u.id).sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id)[0];
      setPrev(last ? String(last.currReading ?? last.curr) : String(u.meterPrev || 0));
      setCurr('');
    }
  };

  const saveReading = async (e) => {
    e.preventDefault();
    if (!unit) return showToast('Select a unit first', 'error');
    if (consumption === null) return showToast('Enter both readings', 'error');
    if (consumption < 0) return showToast('Current reading cannot be lower than previous', 'error');
    if (saving) return;
    setSaving(true);
    try {
      const reading = await recordMeterReading({ unitId: unit.id, previous: Number(prev), current: Number(curr), month, createdBy: role, expectedRevision: selectedRevision });
      showToast(`Reading saved — ${reading.consumption} units • ${fmtMoney(reading.charge, settings.currency)}`);
      setCurr('');
      setPrev(String(reading.currReading));
    } catch (error) {
      showToast(error.message || 'Could not save reading', 'error');
    } finally { setSaving(false); }

  };

  const saveTariff = async () => {
    const t = Number(tariffDraft);
    if (!perms.editTariff) return showToast('Landlord access required', 'error');
    if (!Number.isFinite(t) || t <= 0) return showToast('Enter a valid tariff', 'error');
    await updateSettings({ waterTariff: t });
    showToast(`Water tariff set to ${fmtMoney(t, settings.currency)} per unit`);
  };

  const invoice = invoiceId ? meterLogs.find((m) => m.id === invoiceId) : null;
  const invoiceUnit = invoice ? units.find((u) => u.id === invoice.unitId) : null;

  const monthLogs = meterLogs.filter((m) => m.month === month).sort((a, b) => new Date(b.date) - new Date(a.date));
  const totalWater = monthLogs.reduce((s, m) => s + Number(m.charge || 0), 0);

  return (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <h2 className="font-display text-2xl font-extrabold tracking-tight">Water Meter Billing</h2>
        <p className="kf-muted text-sm">{month} • {monthLogs.length} current-tenancy readings {perms.viewRevenue && `• ${fmtMoney(totalWater, settings.currency)} billed`} • {fmtMoney(settings.waterTariff, settings.currency)}/unit</p>
      </motion.div>

      <div className="grid lg:grid-cols-5 gap-4">
        <motion.form onSubmit={saveReading} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.05 }} className="kf-card kf-glow-border p-5 lg:col-span-3 space-y-3">
          <h3 className="font-display font-bold flex items-center gap-2"><Calculator size={17} className="text-blue-400" /> New meter reading</h3>
          <Field label="Unit *">
            <select value={unitId} onChange={(e) => pickUnit(e.target.value)} className="kf-input" required>
              <option value="">Select unit…</option>
              {units.map((u) => <option key={u.id} value={u.id}>Unit {u.code} — {u.tenantName || 'Vacant'} ({u.building})</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Previous reading" hint={hasHistory ? "Locked to the last recorded reading" : "Set the opening meter reading"}><input type="number" min="0" step="any" required readOnly={hasHistory} value={prev} onChange={(e) => setPrev(e.target.value)} className="kf-input" placeholder="12450" /></Field>
            <Field label="Current reading *"><input type="number" min="0" step="any" value={curr} onChange={(e) => setCurr(e.target.value)} className="kf-input" placeholder="12478" required autoFocus /></Field>
          </div>

          <div className="rounded-2xl p-4" style={{ background: 'var(--kf-input)', border: '1px solid var(--kf-border)' }} aria-live="polite">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><p className="text-[10px] kf-muted uppercase font-bold">Consumption</p><p className="font-display font-extrabold text-xl">{consumption === null ? '—' : `${consumption} u`}</p></div>
              <div><p className="text-[10px] kf-muted uppercase font-bold">Tariff</p><p className="font-display font-extrabold text-xl">{fmtMoney(settings.waterTariff, settings.currency)}</p></div>
              <div><p className="text-[10px] kf-muted uppercase font-bold">Charge</p><p className={`font-display font-extrabold text-xl ${consumption !== null && consumption < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{charge === null ? '—' : fmtMoney(charge, settings.currency)}</p></div>
            </div>
            {consumption !== null && consumption < 0 && <p className="text-xs text-rose-400 mt-2 text-center">⚠ Current reading is below previous — check the dial.</p>}
            {unit && charge !== null && consumption >= 0 && (
              <p className="text-xs kf-muted mt-2 text-center">Merged invoice for Unit {unit.code}: this reading adds {fmtMoney(charge, settings.currency)} to the monthly water charge.</p>
            )}
          </div>

          <button type="submit" disabled={saving} className="kf-btn kf-btn-primary w-full !py-3"><Droplets size={17} /> Save reading & bill water</button>
        </motion.form>

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.12 }} className="space-y-4 lg:col-span-2">
          <div className="kf-card p-5">
            <h3 className="font-display font-bold flex items-center gap-2"><Settings2 size={17} className="text-indigo-400" /> Water tariff</h3>
            <p className="text-xs kf-muted mt-1">Per-unit charge applied to every reading. {perms.editTariff ? 'Landlord can adjust anytime.' : 'Only the Landlord can change this.'}</p>
            <div className="flex gap-2 mt-3">
              <input type="number" min="1" value={tariffDraft} onChange={(e) => setTariffDraft(e.target.value)} className="kf-input" disabled={!perms.editTariff} aria-label="Water tariff per unit" />
              <button onClick={saveTariff} disabled={!perms.editTariff} className="kf-btn kf-btn-primary shrink-0">Save</button>
            </div>
            <p className="text-[11px] kf-muted mt-2">Current: <strong style={{ color: 'var(--kf-text)' }}>{fmtMoney(settings.waterTariff, settings.currency)} / unit</strong></p>
          </div>

          <div className="kf-card p-5">
            <h3 className="font-display font-bold flex items-center gap-2"><History size={17} className="text-emerald-400" /> This month</h3>
            <div className="mt-3 space-y-2 max-h-64 overflow-y-auto kf-scroll pr-1">
              {monthLogs.map((m) => {
                const u = units.find((x) => x.id === m.unitId);
                return (
                  <button key={m.id} onClick={() => setInvoiceId(m.id)} className="w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left hover:scale-[1.01] transition" style={{ background: 'var(--kf-input)', border: '1px solid var(--kf-border)' }}>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold truncate">Unit {u?.code || '?'} • {m.consumption} units</span>
                      <span className="block text-[11px] kf-muted">{fmtDate(m.date)} • {m.prevReading} → {m.currReading}</span>
                    </span>
                    <span className="text-sm font-extrabold text-blue-400 shrink-0">{fmtMoney(m.charge, settings.currency)}</span>
                  </button>
                );
              })}
              {monthLogs.length === 0 && <p className="text-sm kf-muted">No readings logged this month yet.</p>}
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.18 }} className="kf-card p-5">
        <h3 className="font-display font-bold mb-3">Current tenancy reading history</h3>
        <div className="overflow-x-auto kf-scroll">
          <table className="kf-table w-full min-w-[640px]">
            <thead><tr><th>Unit</th><th>Month</th><th>Prev</th><th>Current</th><th>Units</th><th>Tariff</th><th>Charge</th><th>Invoice</th></tr></thead>
            <tbody>
              {[...meterLogs].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20).map((m) => {
                const u = units.find((x) => x.id === m.unitId);
                return (
                  <tr key={m.id}>
                    <td className="font-bold">{u?.code || '?'}</td><td>{m.month}</td><td>{m.prevReading}</td><td>{m.currReading}</td>
                    <td>{m.consumption}</td><td>{fmtMoney(m.tariff, settings.currency)}</td><td className="font-bold">{fmtMoney(m.charge, settings.currency)}</td>
                    <td><button onClick={() => setInvoiceId(m.id)} className="kf-btn !py-1 !px-2.5 !text-xs"><Printer size={13} /> View</button></td>
                  </tr>
                );
              })}
              {meterLogs.length === 0 && <tr><td colSpan={8} className="kf-muted">No readings yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </motion.div>

      <Modal printContent open={!!invoice} onClose={() => setInvoiceId(null)} title={`Invoice — Unit ${invoiceUnit?.code || ''} (${invoice?.month || ''})`}>
        {invoice && invoiceUnit && (
          <div>
            <div className="rounded-2xl p-4 space-y-2 text-sm" style={{ background: 'var(--kf-input)', border: '1px solid var(--kf-border)' }}>
              <div className="flex justify-between"><span className="kf-muted">Tenant</span><strong>{invoiceUnit.tenantName || 'Vacant'}</strong></div>
              <div className="flex justify-between"><span className="kf-muted">Building</span><strong>{invoiceUnit.building}</strong></div>
              <div className="kf-divider" />
              <div className="flex justify-between"><span>Monthly rent</span><strong>{fmtMoney(computeBalance(invoiceUnit, payments, meterLogs, invoice.month, waivers).rent, settings.currency)}</strong></div>
              <div className="flex justify-between"><span>Water (all readings in {invoice.month})</span><strong>{fmtMoney(computeBalance(invoiceUnit, payments, meterLogs, invoice.month, waivers).waterCharge, settings.currency)}</strong></div>
              <div className="flex justify-between"><span>Arrears carried</span><strong>{fmtMoney(computeBalance(invoiceUnit, payments, meterLogs, invoice.month, waivers).arrears, settings.currency)}</strong></div>
              <div className="kf-divider" />
              <div className="flex justify-between text-base"><span className="font-bold">Total due</span><span className="font-display font-extrabold">{fmtMoney(computeBalance(invoiceUnit, payments, meterLogs, invoice.month, waivers).due + computeBalance(invoiceUnit, payments, meterLogs, invoice.month, waivers).arrears, settings.currency)}</span></div>
              <div className="flex justify-between"><span className="kf-muted">Paid this month</span><strong>{fmtMoney(payments.filter((p) => p.unitId === invoiceUnit.id && p.month === invoice.month).reduce((s, p) => s + Number(p.amount), 0), settings.currency)}</strong></div>
              <div className="flex justify-between"><span>Balance after payments</span><strong>{fmtMoney(computeBalance(invoiceUnit, payments, meterLogs, invoice.month, waivers).balance, settings.currency)}</strong></div>
            </div>
            <button onClick={() => window.print()} className="kf-btn kf-btn-primary w-full mt-4"><Printer size={16} /> Print invoice</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
