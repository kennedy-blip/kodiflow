import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, fmtMoney, fmtDate } from '../db/db';
import { useApp } from '../context/AppContext';
import { spring, Modal, StatusBadge, Field, EmptyState, ConfirmButton } from './ui';
import { Plus, Search, Wrench, CheckCircle2, Clock, User, ShieldCheck, Banknote } from 'lucide-react';

const emptyTicket = { unitId: '', title: '', category: 'Plumbing', priority: 'Routine', cost: '', technician: '', description: '' };

export default function MaintenanceTracker() {
  const { settings, perms, showToast, role } = useApp();
  const units = useLiveQuery(() => db.units.toArray(), []) || [];
  const tickets = useLiveQuery(() => db.tickets.toArray(), []) || [];

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyTicket);
  const [editing, setEditing] = useState(null); // ticket being edited (assign tech / cost / status)

  const filtered = useMemo(() => tickets
    .filter((t) => statusFilter === 'All' || t.status === statusFilter)
    .filter((t) => !q || `${t.title} ${t.category} ${t.technician}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [tickets, q, statusFilter]);

  const stats = useMemo(() => ({
    open: tickets.filter((t) => t.status === 'Open').length,
    progress: tickets.filter((t) => t.status === 'In Progress').length,
    resolved: tickets.filter((t) => t.status === 'Resolved').length,
    spend: tickets.reduce((s, t) => s + Number(t.cost || 0), 0),
    urgent: tickets.filter((t) => t.priority === 'Urgent' && t.status !== 'Resolved').length
  }), [tickets]);

  const unitLabel = (id) => { const u = units.find((x) => x.id === id); return u ? `Unit ${u.code}` : 'General'; };

  const create = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return showToast('Ticket title is required', 'error');
    await db.tickets.add({
      unitId: form.unitId ? Number(form.unitId) : null, title: form.title.trim(), category: form.category,
      priority: form.priority, status: 'Open', cost: Number(form.cost || 0), technician: form.technician.trim(),
      description: form.description.trim(), budgetApproved: false, createdAt: new Date().toISOString(), resolvedAt: null, createdBy: role
    });
    setForm(emptyTicket); setModal(false);
    showToast('Repair ticket logged');
  };

  const updateTicket = async (patch) => {
    if (!editing || !perms.approveBudget) return;
    const next = { ...patch };
    if (patch.status === 'Resolved' && editing.status !== 'Resolved') next.resolvedAt = new Date().toISOString();
    if (patch.status && patch.status !== 'Resolved') next.resolvedAt = null;
    if (Number(patch.cost) !== Number(editing.cost)) next.budgetApproved = false;
    await db.tickets.update(editing.id, next);
    setEditing(null);
    showToast(patch.status === 'Resolved' ? 'Ticket marked resolved ✓' : 'Ticket updated');
  };

  const resolveQuick = async (t) => {
    await db.tickets.update(t.id, { status: 'Resolved', resolvedAt: new Date().toISOString() });
    showToast(`"${t.title}" resolved ✓`);
  };

  return (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <h2 className="font-display text-2xl font-extrabold tracking-tight">Maintenance & Defects</h2>
          <p className="kf-muted text-sm">{stats.open + stats.progress} active • {stats.urgent} urgent {perms.viewRevenue && `• ${fmtMoney(stats.spend, settings.currency)} total repair spend`}</p>
        </div>
        <button onClick={() => { setForm(emptyTicket); setModal(true); }} className="kf-btn kf-btn-primary"><Plus size={16} /> Log repair</button>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: Clock, label: 'Open', value: stats.open, tone: 'text-rose-400' },
          { icon: Wrench, label: 'In progress', value: stats.progress, tone: 'text-amber-400' },
          { icon: CheckCircle2, label: 'Resolved', value: stats.resolved, tone: 'text-emerald-400' },
          { icon: Banknote, label: 'Repair spend', value: fmtMoney(stats.spend, settings.currency), tone: 'text-blue-400' }
        ].filter(c => perms.viewRevenue || c.label !== 'Repair spend').map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.05 }} className="kf-card p-4">
            <div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider kf-muted">{c.label}</span><c.icon size={17} className={c.tone} /></div>
            <p className="font-display text-xl font-extrabold mt-1.5">{c.value}</p>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 }} className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 kf-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tickets, technician…" className="kf-input !pl-9" aria-label="Search tickets" />
        </div>
        {['All', 'Open', 'In Progress', 'Resolved'].map((f) => (
          <button key={f} onClick={() => setStatusFilter(f)} className={`kf-btn !py-2 ${statusFilter === f ? 'kf-btn-primary' : ''}`} aria-pressed={statusFilter === f}>{f}</button>
        ))}
      </motion.div>

      <div className="space-y-3">
        {filtered.map((t, i) => (
          <motion.div key={t.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.04 }} className="kf-card kf-glow-border p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold">{t.title}</h3>
                  <StatusBadge status={t.priority} />
                  <StatusBadge status={t.status} />
                </div>
                <p className="text-xs kf-muted mt-1">{unitLabel(t.unitId)} • {t.category} • Logged {fmtDate(t.createdAt)}{t.resolvedAt ? ` • Resolved ${fmtDate(t.resolvedAt)}` : ''}</p>
                {t.description && <p className="text-sm mt-2">{t.description}</p>}
                <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs kf-muted">
                  <span className="inline-flex items-center gap-1"><User size={12} /> {t.technician || 'Unassigned'}</span>
                  <span className="inline-flex items-center gap-1"><Banknote size={12} /> {fmtMoney(t.cost || 0, settings.currency)}</span>
                  {t.budgetApproved && Number(t.cost || 0) > 0 && <span className="inline-flex items-center gap-1 text-emerald-400"><ShieldCheck size={12} /> Budget approved by landlord</span>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0 flex-wrap">
                {t.status !== 'Resolved' && <button onClick={() => resolveQuick(t)} className="kf-btn kf-btn-emerald !py-2 !text-xs"><CheckCircle2 size={14} /> Resolve</button>}
                {perms.approveBudget && <button onClick={() => setEditing(t)} className="kf-btn !py-2 !text-xs">Manage</button>}
                {perms.approveBudget && Number(t.cost) > 0 && !t.budgetApproved && <button onClick={async () => { await db.tickets.update(t.id, { budgetApproved: true }); showToast('Budget approved'); }} className="kf-btn !py-2 !text-xs">Approve budget</button>}
                {perms.approveBudget && <ConfirmButton label="Delete" onConfirm={async () => { await db.tickets.delete(t.id); showToast('Ticket deleted'); }} />}
              </div>
            </div>
          </motion.div>
        ))}
        {filtered.length === 0 && <EmptyState icon={Wrench} title="No tickets found" desc="Log a repair request to get started." action={<button onClick={() => setModal(true)} className="kf-btn kf-btn-primary"><Plus size={15} /> Log repair</button>} />}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Log repair request">
        <form onSubmit={create} className="space-y-3">
          <Field label="Unit"><select value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })} className="kf-input"><option value="">General / common area</option>{units.map((u) => <option key={u.id} value={u.id}>Unit {u.code} — {u.tenantName || 'Vacant'}</option>)}</select></Field>
          <Field label="Issue title *"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="kf-input" placeholder="e.g. Bathroom tap leaking" required autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category"><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="kf-input">{['Plumbing', 'Electrical', 'Locks', 'Painting', 'Appliances', 'Structural', 'Other'].map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Priority"><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="kf-input"><option>Routine</option><option>Urgent</option></select></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Estimated cost (KSh)"><input type="number" min="0" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className="kf-input" placeholder="0" /></Field>
            <Field label="Technician"><input value={form.technician} onChange={(e) => setForm({ ...form, technician: e.target.value })} className="kf-input" placeholder="Name" /></Field>
          </div>
          <Field label="Description"><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="kf-input" rows={3} placeholder="Details, photos note, access info…" /></Field>
          <button type="submit" className="kf-btn kf-btn-primary w-full !py-3">Log ticket</button>
        </form>
      </Modal>

      <Modal open={!!editing && perms.approveBudget} onClose={() => setEditing(null)} title={editing ? `Manage — ${editing.title}` : ''}>
        {editing && (
          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); updateTicket({ technician: fd.get('tech'), cost: Number(fd.get('cost') || 0), status: fd.get('status'), priority: fd.get('priority') }); }} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status"><select name="status" defaultValue={editing.status} className="kf-input"><option>Open</option><option>In Progress</option><option>Resolved</option></select></Field>
              <Field label="Priority"><select name="priority" defaultValue={editing.priority} className="kf-input"><option>Routine</option><option>Urgent</option></select></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Technician"><input name="tech" defaultValue={editing.technician} className="kf-input" placeholder="Assign technician" /></Field>
              <Field label="Actual cost (KSh)"><input name="cost" type="number" min="0" defaultValue={editing.cost || ''} className="kf-input" placeholder="0" /></Field>
            </div>
            <p className="text-[11px] kf-muted">Changing a cost requires landlord approval.</p>
            <button type="submit" className="kf-btn kf-btn-primary w-full !py-3">Save changes</button>
          </form>
        )}
      </Modal>
    </div>
  );
}
