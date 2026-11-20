import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, computeBalance, fmtMoney, fmtDate, currentMonth, downloadCSV, withBillingTerms } from '../db/db';
import { useApp } from '../context/AppContext';
import { changeTenancy } from '../db/tenancy';
import { spring, Modal, StatusBadge, Field, EmptyState, ConfirmButton } from './ui';
import { Plus, Search, Download, Wallet, Trash2, Pencil, Receipt, ShieldAlert, ChevronDown, Building2, User, Phone, BadgeCheck } from 'lucide-react';

const emptyUnit = { code: '', building: '', type: '1-Bedroom', rent: '', deposit: '', tenantName: '', tenantPhone: '', tenantId: '', status: 'occupied', arrears: '' };

export default function RentLedger() {
  const { isAdmin, perms, settings, showToast, role } = useApp();
  const units = useLiveQuery(() => db.units.toArray(), []) || [];
  const payments = useLiveQuery(() => db.payments.toArray(), []) || [];
  const waivers = useLiveQuery(() => db.waivers.toArray(), []) || [];
  const meterLogs = useLiveQuery(() => db.meterLogs.toArray(), []) || [];
  const archives = useLiveQuery(() => db.archives.toArray(), []) || [];
  const month = currentMonth();

  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');
  const [selectedId, setSelectedId] = useState(null);
  const [unitModal, setUnitModal] = useState(null); // null | 'add' | unit
  const [unitForm, setUnitForm] = useState(emptyUnit);
  const [payModal, setPayModal] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', method: 'M-Pesa', reference: '', note: '' });
  const [waiveAmt, setWaiveAmt] = useState('');
  const [paidPulse, setPaidPulse] = useState(false);
  const [payRevision, setPayRevision] = useState(null);
  const [turnRevision, setTurnRevision] = useState(null);
  const [turnover, setTurnover] = useState(false);
  const [historyId, setHistoryId] = useState(null);
  const [turnForm, setTurnForm] = useState({ status: 'occupied', tenantName: '', tenantPhone: '', tenantId: '', rent: '', deposit: '', confirmed: false });
  const [turnSaving, setTurnSaving] = useState(false);

  const selected = units.find((u) => u.id === selectedId) || null;
  const selBalance = selected ? computeBalance(selected, payments, meterLogs, month, waivers) : null;
  const selectedArchive = archives.find(a => a.id === historyId);

  const rows = useMemo(() => units.map((u) => ({ u, b: computeBalance(u, payments, meterLogs, month, waivers) })), [units, payments, meterLogs, month, waivers]);
  const filtered = rows.filter(({ u, b }) => {
    const matchQ = !q || `${u.code} ${u.tenantName} ${u.building}`.toLowerCase().includes(q.toLowerCase());
    const matchF = filter === 'All' || b.status === filter || (filter === 'Occupied' && u.status === 'occupied');
    return matchQ && matchF;
  });

  const totals = useMemo(() => ({
    expected: rows.filter((r) => r.u.status === 'occupied').reduce((s, r) => s + r.b.due, 0) + archives.filter(a => a.closingMonth === month).reduce((s, a) => s + computeBalance(a.unit, a.payments, a.meterLogs, month, a.waivers).due, 0),
    collected: rows.reduce((s, r) => s + r.b.paid, 0) + archives.filter(a => a.closingMonth === month).reduce((s, a) => s + computeBalance(a.unit, a.payments, a.meterLogs, month, a.waivers).paid, 0),
    arrears: rows.reduce((s, r) => s + Math.max(0, r.b.balance), 0)
  }), [rows, archives, month]);

  const openAdd = () => { setUnitForm(emptyUnit); setUnitModal('add'); };
  const openEdit = (u) => { setUnitForm({ ...emptyUnit, ...u, rent: String(u.rent), deposit: String(u.deposit), arrears: String(u.arrears || 0) }); setUnitModal(u); };

  const saveUnit = async (e) => {
    e.preventDefault();
    if (!unitForm.code.trim() || !unitForm.building.trim()) return showToast('Unit code and building are required', 'error');
    const payload = {
      code: unitForm.code.trim().toUpperCase(), building: unitForm.building.trim(), type: unitForm.type,
      rent: Number(unitForm.rent || 0), deposit: Number(unitForm.deposit || 0),
      tenantName: unitForm.tenantName.trim(), tenantPhone: unitForm.tenantPhone.trim(), tenantId: unitForm.tenantId.trim(),
      status: unitForm.status, arrears: Number(unitForm.arrears || 0)
    };
    if (!perms.manageUnits) return showToast('Landlord access required', 'error');
    if (payload.status === 'occupied' && !payload.tenantName) return showToast('An occupied unit needs a tenant name', 'error');
    if (unitModal !== 'add' && (payload.tenantName !== (unitModal.tenantName || '') || payload.status !== unitModal.status)) return showToast('Use Change tenancy to preserve financial history', 'error');
    if ([payload.rent, payload.deposit, payload.arrears].some(n => !Number.isFinite(n) || n < 0)) return showToast('Enter valid non-negative amounts', 'error');
    try {
      await db.transaction('rw', db.units, async () => {
        const all = await db.units.toArray();
        if (all.some(u => u.id !== unitModal?.id && u.code.toLowerCase() === payload.code.toLowerCase() && u.building.toLowerCase() === payload.building.toLowerCase())) throw new Error('This unit code already exists in the building');
        if (unitModal === 'add') {
          await db.units.add({ ...payload, billingHistory: [{ month, rent: payload.rent, status: payload.status }], meterPrev: 0, createdAt: new Date().toISOString() });
        } else {
          const current = await db.units.get(unitModal.id);
          if (!current || (current.tenancyRevision || 0) !== (unitModal.tenancyRevision || 0)) throw new Error('Tenancy changed. Reopen the unit form.');
          const updated = { ...payload };
          if (payload.rent !== Number(current.rent) || payload.status !== current.status) updated.billingHistory = withBillingTerms(current, payload.rent, payload.status, month);
          await db.units.update(current.id, updated);
        }
      });
      showToast(`Unit ${payload.code} ${unitModal === 'add' ? 'added' : 'updated'}`);
    } catch (error) { return showToast(error.message || 'Could not save unit', 'error'); }
    setUnitModal(null);
  };

  const deleteUnit = async (u) => {
    if (!perms.manageUnits) return showToast('Landlord access required', 'error');
    try { await db.transaction('rw', db.units, db.payments, db.meterLogs, db.tickets, db.waivers, db.archives, async () => {
      const current = await db.units.get(u.id);
      if (!current || (current.tenancyRevision || 0) !== (u.tenancyRevision || 0)) throw new Error('Tenancy changed; review before deleting.');
      await db.units.delete(u.id);
      await db.payments.where('unitId').equals(u.id).delete();
      await db.meterLogs.where('unitId').equals(u.id).delete();
      await db.tickets.where('unitId').equals(u.id).delete();
      await db.waivers.where('unitId').equals(u.id).delete();
      await db.archives.where('unitId').equals(u.id).delete();
    }); } catch (error) { return showToast(error.message || 'Could not delete unit', 'error'); }
    if (selectedId === u.id) setSelectedId(null);
    showToast(`Unit ${u.code} and its records deleted`);
  };

  const openTurnover = () => {
    setTurnRevision(selected.tenancyRevision || 0);
    setTurnForm({ status: 'occupied', tenantName: '', tenantPhone: '', tenantId: '', rent: String(selected.rent || 0), deposit: String(selected.deposit || 0), confirmed: false });
    setTurnover(true);
  };

  const saveTurnover = async (e) => {
    e.preventDefault();
    if (!selected || !perms.manageUnits || turnSaving || !turnForm.confirmed) return;
    setTurnSaving(true);
    try {
      await changeTenancy({ unitId: selected.id, ...turnForm, rent: Number(turnForm.rent), deposit: Number(turnForm.deposit), month, expectedRevision: turnRevision });
      setTurnover(false);
      showToast('Previous ledger archived; new occupancy started');
    } catch (error) { showToast(error.message || 'Could not change tenancy', 'error'); }
    finally { setTurnSaving(false); }
  };

  const logPayment = async (e) => {
    e.preventDefault();
    const amt = Number(payForm.amount);
    if (!selected || !Number.isFinite(amt) || amt <= 0) return showToast('Enter a valid payment amount', 'error');
    try {
      await db.transaction('rw', db.units, db.payments, async () => {
        const current = await db.units.get(selected.id);
        if (!current || (current.tenancyRevision || 0) !== payRevision) throw new Error('Tenancy changed. Reopen the payment form.');
        await db.payments.add({ unitId: selected.id, amount: amt, month, date: new Date().toISOString(),
          method: payForm.method, reference: payForm.reference.trim() || `RCPT-${Date.now().toString().slice(-6)}`,
          note: payForm.note.trim(), createdBy: role });
      });
    } catch (error) { return showToast(error.message || 'Payment could not be saved', 'error'); }
    setPayForm({ amount: '', method: 'M-Pesa', reference: '', note: '' });
    setPayModal(false);
    setPaidPulse(true);
    setTimeout(() => setPaidPulse(false), 1200);
    showToast(`Payment of ${fmtMoney(amt, settings.currency)} recorded for Unit ${selected.code}`);
  };

  const waive = async () => {
    if (!perms.waiveArrears) return showToast('Landlord access required', 'error');
    const amt = Number(waiveAmt);
    if (!selected || !Number.isFinite(amt) || amt <= 0) return showToast('Enter amount to waive', 'error');
    try {
      await db.transaction('rw', db.units, db.payments, db.meterLogs, db.waivers, async () => {
        const current = await db.units.get(selected.id);
        if (!current || (current.tenancyRevision || 0) !== (selected.tenancyRevision || 0)) throw new Error('Tenancy changed; check the balance again.');
        const [ps, ms, ws] = await Promise.all([db.payments.where('unitId').equals(current.id).toArray(), db.meterLogs.where('unitId').equals(current.id).toArray(), db.waivers.where('unitId').equals(current.id).toArray()]);
        if (amt > computeBalance(current, ps, ms, month, ws).arrears) throw new Error('Amount exceeds carried arrears');
        await db.waivers.add({ unitId: current.id, amount: amt, month, date: new Date().toISOString(), reason: 'Arrears waived by landlord' });
      });
    } catch (error) { return showToast(error.message || 'Waiver failed', 'error'); }
    setWaiveAmt('');
    showToast(`Waived ${fmtMoney(amt, settings.currency)} for Unit ${selected.code}`);
  };

  const exportRoll = () => {
    if (!perms.exportRentRoll) return showToast('Export is restricted to the Landlord role', 'error');
    downloadCSV(`kodiflow-rent-roll-${month}.csv`, [
      ['Unit', 'Building', 'Tenant', 'Phone', 'Rent', 'Water', 'Due', 'Paid', 'Arrears', 'Balance', 'Status'],
      ...rows.map(({ u, b }) => [u.code, u.building, u.tenantName || 'Vacant', u.tenantPhone, b.rent, b.waterCharge, b.due, b.paid, b.arrears, Math.max(0, b.balance), b.status])
    ]);
    showToast('Rent roll exported as CSV');
  };

  return (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <h2 className="font-display text-2xl font-extrabold tracking-tight">Rent Roll & Ledger</h2>
          <p className="kf-muted text-sm">{isAdmin ? `${month} • ${fmtMoney(totals.collected, settings.currency)} collected of ${fmtMoney(totals.expected, settings.currency)} expected • ${fmtMoney(totals.arrears, settings.currency)} outstanding` : `${month} • Unit ledger`}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && <button onClick={exportRoll} className="kf-btn"><Download size={16} /> Export CSV</button>}
          {perms.manageUnits && <button onClick={openAdd} className="kf-btn kf-btn-primary"><Plus size={16} /> Add unit</button>}
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.05 }} className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 kf-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search unit, tenant or building…" className="kf-input !pl-9" aria-label="Search units" />
        </div>
        {['All', 'Paid', 'Partial', 'Unpaid', 'Vacant'].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`kf-btn !py-2 ${filter === f ? 'kf-btn-primary' : ''}`} aria-pressed={filter === f}>{f}</button>
        ))}
      </motion.div>

      {!perms.manageUnits && (
        <div className="kf-card p-3 flex items-center gap-2 text-xs kf-muted"><ShieldAlert size={15} className="text-amber-400 shrink-0" /> Caretaker view: rent rates and unit management are read-only. Switch to Landlord in the header to edit.</div>
      )}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map(({ u, b }, i) => (
          <motion.button
            key={u.id}
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.04 }}
            onClick={() => setSelectedId(selectedId === u.id ? null : u.id)}
            className="kf-card kf-glow-border p-4 text-left w-full"
            aria-expanded={selectedId === u.id}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display font-extrabold text-lg">Unit {u.code}</p>
                <p className="text-xs kf-muted flex items-center gap-1"><Building2 size={12} /> {u.building} • {u.type}</p>
              </div>
              <StatusBadge status={b.status} />
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <User size={14} className="kf-muted" />
              <span className="font-semibold truncate">{u.tenantName || 'Vacant — available to let'}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl py-2" style={{ background: 'var(--kf-input)' }}><p className="text-[10px] kf-muted uppercase font-bold">Rent</p><p className="text-xs font-extrabold">{fmtMoney(b.rent, settings.currency)}</p></div>
              <div className="rounded-xl py-2" style={{ background: 'var(--kf-input)' }}><p className="text-[10px] kf-muted uppercase font-bold">Water</p><p className="text-xs font-extrabold">{fmtMoney(b.waterCharge, settings.currency)}</p></div>
              <div className="rounded-xl py-2" style={{ background: 'var(--kf-input)' }}><p className="text-[10px] kf-muted uppercase font-bold">Balance</p><p className={`text-xs font-extrabold ${b.balance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{fmtMoney(Math.max(0, b.balance), settings.currency)}</p></div>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] kf-muted">
              <span>Deposit {fmtMoney(u.deposit, settings.currency)}</span>
              <ChevronDown size={14} className={`transition-transform ${selectedId === u.id ? 'rotate-180' : ''}`} />
            </div>
          </motion.button>
        ))}
      </div>
      {filtered.length === 0 && <EmptyState icon={Receipt} title="No units match" desc="Try a different search or filter." />}

      <AnimatePresence>
        {selected && selBalance && (
          <motion.div
            key="drawer" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={spring} className="overflow-hidden"
          >
            <div className="kf-card-strong kf-glow-border p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-display font-extrabold text-lg">Unit {selected.code} — {selected.tenantName || 'Vacant'}</h3>
                  <p className="text-xs kf-muted flex flex-wrap gap-x-4 gap-y-1 mt-1">
                    <span className="inline-flex items-center gap-1"><Phone size={12} /> {selected.tenantPhone || 'No phone'}</span>
                    <span>ID: {selected.tenantId || '—'}</span>
                    <span>Deposit: {fmtMoney(selected.deposit, settings.currency)}</span>
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => { setPayRevision(selected.tenancyRevision || 0); setPayForm((f) => ({ ...f, amount: selBalance.balance > 0 ? String(selBalance.balance) : '' })); setPayModal(true); }} className="kf-btn kf-btn-emerald">
                    <motion.span animate={paidPulse ? { scale: [1, 1.35, 1] } : {}} transition={spring} className="inline-flex"><Wallet size={16} /></motion.span> Log payment
                  </button>
                  {perms.manageUnits && <button onClick={openTurnover} className="kf-btn">Change tenancy</button>}
                  {perms.manageUnits && <button onClick={() => openEdit(selected)} className="kf-btn"><Pencil size={15} /> Edit</button>}
                  {perms.manageUnits && <ConfirmButton key={`${selected.id}-${selected.tenancyRevision || 0}`} label="Delete unit and records" onConfirm={() => deleteUnit(selected)} />}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4 text-center">
                {[
                  ['Rent', fmtMoney(selBalance.rent, settings.currency)],
                  ['Water', fmtMoney(selBalance.waterCharge, settings.currency)],
                  ['Arrears carried', fmtMoney(selBalance.arrears, settings.currency)],
                  ['Paid (' + month + ')', fmtMoney(selBalance.paid, settings.currency)],
                  ['Balance due', fmtMoney(Math.max(0, selBalance.balance), settings.currency)]
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl py-2.5 px-1" style={{ background: 'var(--kf-input)', border: '1px solid var(--kf-border)' }}>
                    <p className="text-[10px] kf-muted uppercase font-bold">{k}</p><p className="text-sm font-extrabold mt-0.5">{v}</p>
                  </div>
                ))}
              </div>

              {perms.waiveArrears && selBalance.arrears > 0 && (
                <div className="mt-4 flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[160px]"><Field label="Waive arrears (KSh)"><input type="number" min="0" value={waiveAmt} onChange={(e) => setWaiveAmt(e.target.value)} className="kf-input" placeholder="e.g. 5000" /></Field></div>
                  <button onClick={waive} className="kf-btn">Waive</button>
                </div>
              )}

              {perms.manageUnits && archives.some(a => a.unitId === selected.id) && <div className="mt-5">
                <h4 className="font-bold text-sm mb-2">Archived tenancies</h4>
                <div className="space-y-2">{archives.filter(a => a.unitId === selected.id).sort((a, b) => b.closedAt.localeCompare(a.closedAt)).map(a => <button key={a.id} onClick={() => setHistoryId(a.id)} className="kf-btn w-full justify-between"><span>{a.unit.tenantName || 'Vacant period'} • closed {a.closingMonth}</span><span>View records →</span></button>)}</div>
              </div>}
              <h4 className="font-bold text-sm mt-5 mb-2">Payment history</h4>
              <div className="overflow-x-auto kf-scroll">
                <table className="kf-table w-full min-w-[560px]">
                  <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Note</th><th></th></tr></thead>
                  <tbody>
                    {payments.filter((p) => p.unitId === selected.id).sort((a, b) => new Date(b.date) - new Date(a.date)).map((p) => (
                      <tr key={p.id}>
                        <td>{fmtDate(p.date)}</td><td className="font-bold">{fmtMoney(p.amount, settings.currency)}</td>
                        <td>{p.method}</td><td className="font-mono text-xs">{p.reference}</td><td className="kf-muted">{p.note || '—'}</td>
                        <td>{perms.deletePayment ? <ConfirmButton label={<Trash2 size={13} />} onConfirm={async () => { await db.payments.delete(p.id); showToast('Payment record deleted'); }} /> : <span className="text-[11px] kf-muted inline-flex items-center gap-1"><BadgeCheck size={12} /> Locked</span>}</td>
                      </tr>
                    ))}
                    {payments.filter((p) => p.unitId === selected.id).length === 0 && <tr><td colSpan={6} className="kf-muted">No payments recorded yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal open={!!unitModal && perms.manageUnits} onClose={() => setUnitModal(null)} title={unitModal === 'add' ? 'Add new unit' : `Edit Unit ${unitModal?.code || ''}`}>
        <form onSubmit={saveUnit} className="space-y-3">
          <p className="text-xs kf-muted">Rent changes apply from the current month. Use Change tenancy to move a tenant in or out while preserving their ledger.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Unit code *"><input value={unitForm.code} onChange={(e) => setUnitForm({ ...unitForm, code: e.target.value })} className="kf-input" placeholder="e.g. A5" required /></Field>
            <Field label="Building *"><input value={unitForm.building} onChange={(e) => setUnitForm({ ...unitForm, building: e.target.value })} className="kf-input" placeholder="Sunrise Heights" required /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select value={unitForm.type} onChange={(e) => setUnitForm({ ...unitForm, type: e.target.value })} className="kf-input">
                {['Bedsitter', 'Studio', '1-Bedroom', '2-Bedroom', '3-Bedroom', 'Shop'].map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select disabled={unitModal !== 'add'} value={unitForm.status} onChange={(e) => setUnitForm({ ...unitForm, status: e.target.value })} className="kf-input">
                <option value="occupied">Occupied</option><option value="vacant">Vacant</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monthly rent (KSh)" hint={perms.editRent ? '' : 'Read-only for caretakers'}><input type="number" min="0" value={unitForm.rent} onChange={(e) => setUnitForm({ ...unitForm, rent: e.target.value })} className="kf-input" disabled={!perms.editRent} /></Field>
            <Field label="Security deposit (KSh)"><input type="number" min="0" value={unitForm.deposit} onChange={(e) => setUnitForm({ ...unitForm, deposit: e.target.value })} className="kf-input" disabled={!perms.editRent} /></Field>
          </div>
          <Field label="Opening arrears (KSh)" hint="Opening balance at unit creation, not the current calculated balance."><input type="number" min="0" value={unitForm.arrears} onChange={(e) => setUnitForm({ ...unitForm, arrears: e.target.value })} className="kf-input" disabled={!perms.editRent} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tenant name" hint={unitModal !== 'add' ? 'Use Change tenancy to move a tenant in or out' : ''}><input disabled={unitModal !== 'add'} value={unitForm.tenantName} onChange={(e) => setUnitForm({ ...unitForm, tenantName: e.target.value })} className="kf-input" placeholder="Full name" /></Field>
            <Field label="Tenant phone"><input value={unitForm.tenantPhone} onChange={(e) => setUnitForm({ ...unitForm, tenantPhone: e.target.value })} className="kf-input" placeholder="+254 …" /></Field>
          </div>
          <Field label="Tenant ID / Ref"><input value={unitForm.tenantId} onChange={(e) => setUnitForm({ ...unitForm, tenantId: e.target.value })} className="kf-input" placeholder="ID-000000" /></Field>
          <button type="submit" className="kf-btn kf-btn-primary w-full !py-3">{unitModal === 'add' ? 'Add unit' : 'Save changes'}</button>
        </form>
      </Modal>

      <Modal open={turnover && perms.manageUnits} onClose={() => setTurnover(false)} title={`Change tenancy — Unit ${selected?.code || ''}`}>
        <form onSubmit={saveTurnover} className="space-y-3">
          <p className="text-xs kf-muted">The current ledger must be settled to zero. Its payments, readings, waivers and terms will be archived. The meter reading carries over. Repairs remain with the unit.</p>
          <p className="text-xs text-amber-400">The previous and new tenancies can each be charged a full month's rent for {month}. There is no automatic proration. Check the closing balance and agreement first.</p>
          <Field label="New occupancy"><select className="kf-input" value={turnForm.status} onChange={e => setTurnForm({ ...turnForm, status: e.target.value })}><option value="occupied">Occupied — new tenant</option><option value="vacant">Vacant</option></select></Field>
          {turnForm.status === 'occupied' && <>
            <Field label="New tenant name *"><input className="kf-input" required value={turnForm.tenantName} onChange={e => setTurnForm({ ...turnForm, tenantName: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Phone"><input className="kf-input" value={turnForm.tenantPhone} onChange={e => setTurnForm({ ...turnForm, tenantPhone: e.target.value })} /></Field><Field label="Tenant ID"><input className="kf-input" value={turnForm.tenantId} onChange={e => setTurnForm({ ...turnForm, tenantId: e.target.value })} /></Field></div>
          </>}
          <div className="grid grid-cols-2 gap-3"><Field label="Monthly rent"><input type="number" min="0" step="0.01" required className="kf-input" value={turnForm.rent} onChange={e => setTurnForm({ ...turnForm, rent: e.target.value })} /></Field><Field label="Deposit"><input type="number" min="0" step="0.01" required className="kf-input" value={turnForm.deposit} onChange={e => setTurnForm({ ...turnForm, deposit: e.target.value })} /></Field></div>
          <label className="flex items-start gap-2 text-xs"><input type="checkbox" required checked={turnForm.confirmed} onChange={e => setTurnForm({ ...turnForm, confirmed: e.target.checked })} /><span>I checked the closing balance and understand that full monthly rent may apply to both tenancies.</span></label>
          <button disabled={turnSaving} type="submit" className="kf-btn kf-btn-primary w-full">{turnSaving ? 'Saving…' : 'Archive and change tenancy'}</button>
        </form>
      </Modal>
      <Modal open={!!selectedArchive && perms.manageUnits} onClose={() => setHistoryId(null)} title={`Archived ledger — ${selectedArchive?.unit.tenantName || 'Vacant period'}`}>
        {selectedArchive && <div className="space-y-3 text-sm">
          <p className="kf-muted text-xs">Closed {fmtDate(selectedArchive.closedAt)} • Unit {selectedArchive.unit.code} • {selectedArchive.unit.building}</p>
          <p>Closing balance: <strong>{fmtMoney(selectedArchive.closingBalance, settings.currency)}</strong></p>
          <p>Opening arrears: <strong>{fmtMoney(selectedArchive.unit.arrears, settings.currency)}</strong></p>
          <h4 className="font-bold">Billing terms</h4>
          {(selectedArchive.unit.billingHistory || [{ month: selectedArchive.unit.billingStartMonth || selectedArchive.unit.createdAt?.slice(0, 7), rent: selectedArchive.unit.rent, status: selectedArchive.unit.status }]).map((term, i) => <p key={i} className="text-xs kf-muted">{term.month} • {term.status} • {fmtMoney(term.rent, settings.currency)} / month</p>)}
          <h4 className="font-bold">Payments ({selectedArchive.payments.length})</h4>
          {selectedArchive.payments.map(p => <p key={p.id} className="text-xs kf-muted">{p.month} • {fmtMoney(p.amount, settings.currency)} • {p.method} • {p.reference}</p>)}
          <h4 className="font-bold">Meter readings ({selectedArchive.meterLogs.length})</h4>
          {selectedArchive.meterLogs.map(m => <p key={m.id} className="text-xs kf-muted">{m.month} • {m.prevReading ?? m.prev} → {m.currReading ?? m.curr} • {fmtMoney(m.charge, settings.currency)}</p>)}
          <h4 className="font-bold">Waivers ({selectedArchive.waivers.length})</h4>
          {selectedArchive.waivers.map(w => <p key={w.id} className="text-xs kf-muted">{w.month || w.date.slice(0, 7)} • {fmtMoney(w.amount, settings.currency)}</p>)}
        </div>}
      </Modal>

      <Modal open={payModal} onClose={() => setPayModal(false)} title={`Log payment — Unit ${selected?.code || ''}`}>
        <form onSubmit={logPayment} className="space-y-3">
          <Field label="Amount (KSh) *"><input type="number" min="1" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} className="kf-input" placeholder="e.g. 28000" required autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Method">
              <select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })} className="kf-input">
                {['M-Pesa', 'Bank', 'Cash', 'Cheque'].map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Reference"><input value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} className="kf-input" placeholder="MPX…" /></Field>
          </div>
          <Field label="Note"><input value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} className="kf-input" placeholder="Rent + water — Nov" /></Field>
          <button type="submit" className="kf-btn kf-btn-emerald w-full !py-3"><BadgeCheck size={17} /> Confirm payment</button>
        </form>
      </Modal>
    </div>
  );
}
