import Dexie from 'dexie';

export const db = new Dexie('KodiFlowDB');

db.version(1).stores({
  units: '++id, code, building, status',
  payments: '++id, unitId, month, date',
  meterLogs: '++id, unitId, month, date',
  tickets: '++id, unitId, status, priority, createdAt',
  settings: 'id',
  waivers: '++id, unitId, date'
});

db.version(2).stores({ archives: '++id, unitId, closedAt' });

export const DEFAULT_SETTINGS = {
  id: 1,
  businessName: 'Sunrise Heights & Palm Court',
  currency: 'KSh',
  waterTariff: 85,
  rentDueDay: 5,
  lateFeePct: 5,
  managerName: 'KodiFlow Manager',
  managerPhone: '+254 700 000 000'
};

export function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function fmtMoney(n, currency = 'KSh') {
  const v = Number(n || 0);
  return `${currency} ${v.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/** Billing terms are effective for whole calendar months. Legacy units use their current terms
 * as their opening terms; the original history cannot be reconstructed. */
export function billingTerms(unit, month) {
  const history = unit.billingHistory || [];
  const entry = history.filter(x => x.month <= month).sort((a, b) => b.month.localeCompare(a.month))[0];
  return entry || (history.length ? { rent: 0, status: 'vacant' } : { rent: Number(unit.rent || 0), status: unit.status });
}

export function withBillingTerms(unit, rent, status, month = currentMonth()) {
  const opening = unit.billingStartMonth || (unit.createdAt || month).slice(0, 7);
  const history = unit.billingHistory?.length ? [...unit.billingHistory] : [{ month: opening, rent: Number(unit.rent || 0), status: unit.status }];
  const next = { month, rent: Number(rent), status };
  return [...history.filter(x => x.month !== month), next].sort((a, b) => a.month.localeCompare(b.month));
}

export function computeBalance(unit, payments = [], meterLogs = [], month = currentMonth(), waivers = []) {
  const start = unit.billingStartMonth || (unit.createdAt || month).slice(0, 7);
  const logs = meterLogs.filter(m => m.unitId === unit.id && m.month === month);
  const waterCharge = roundMoney(logs.reduce((s, m) => s + Number(m.charge || 0), 0));
  const terms = billingTerms(unit, month);
  const rent = terms.status === 'occupied' ? Number(terms.rent || 0) : 0;
  const paid = roundMoney(payments.filter(p => p.unitId === unit.id && p.month === month).reduce((s, p) => s + Number(p.amount || 0), 0));
  let carried = Number(unit.arrears || 0);
  if (/^\d{4}-\d{2}$/.test(start) && start <= month) {
    let [year, m] = start.split('-').map(Number);
    for (let n = 0; n < 1200; n++) {
      const period = `${year}-${String(m).padStart(2, '0')}`;
      if (period >= month) break;
      const previousTerms = billingTerms(unit, period);
      carried += (previousTerms.status === 'occupied' ? Number(previousTerms.rent || 0) : 0)
        + meterLogs.filter(x => x.unitId === unit.id && x.month === period).reduce((s, x) => s + Number(x.charge || 0), 0)
        - payments.filter(x => x.unitId === unit.id && x.month === period).reduce((s, x) => s + Number(x.amount || 0), 0)
        - waivers.filter(x => x.unitId === unit.id && (x.month || x.date?.slice(0, 7)) === period).reduce((s, x) => s + Number(x.amount || 0), 0);
      carried = roundMoney(carried);
      if (++m > 12) { m = 1; year++; }
    }
  }
  const waived = waivers.filter(x => x.unitId === unit.id && (x.month || x.date?.slice(0, 7)) === month).reduce((s, x) => s + Number(x.amount || 0), 0);
  const arrears = roundMoney(carried - waived);
  const due = roundMoney(rent + waterCharge);
  const balance = roundMoney(arrears + due - paid);
  const status = terms.status !== 'occupied' ? 'Vacant' : balance <= 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid';
  return { rent, waterCharge, due, paid, arrears, balance, status, latestLog: logs.at(-1) || null };
}

/** Append a reading atomically. A stale previous reading cannot be billed twice. */
export async function recordMeterReading({ unitId, previous, current, month = currentMonth(), createdBy, expectedRevision }) {
  if (!Number.isFinite(previous) || !Number.isFinite(current) || previous < 0 || current < previous) {
    throw new Error('Enter valid readings; current must not be below previous.');
  }
  return db.transaction('rw', db.meterLogs, db.units, db.settings, async () => {
    const unit = await db.units.get(unitId);
    if (!unit) throw new Error('Unit no longer exists.');
    if (expectedRevision != null && (unit.tenancyRevision || 0) !== expectedRevision) throw new Error('Tenancy changed. Re-select the unit.');
    const logs = await db.meterLogs.where('unitId').equals(unitId).toArray();
    const latest = logs.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)[0];
    if (latest && Number(latest.currReading ?? latest.curr) !== previous) {
      throw new Error('Previous reading changed. Re-select the unit to load the latest reading.');
    }
    if (!latest && unit.billingStartMonth && Number(unit.meterPrev ?? 0) !== previous) {
      throw new Error('Previous reading must match the last reading from the previous tenancy.');
    }
    const settings = await db.settings.get(1);
    const tariff = Number(settings?.waterTariff);
    if (!Number.isFinite(tariff) || tariff < 0) throw new Error('Water tariff is invalid.');
    const consumption = Math.round((current - previous) * 1000) / 1000;
    const charge = Math.round(consumption * tariff * 100) / 100;
    const reading = { unitId, prevReading: previous, currReading: current, consumption, tariff, charge, month, date: new Date().toISOString(), createdBy };
    reading.id = await db.meterLogs.add(reading);
    await db.units.update(unitId, { meterPrev: current });
    return reading;
  });
}

export async function seedIfEmpty() {
  return db.transaction('rw', db.units, db.payments, db.meterLogs, db.tickets, db.settings, async () => {
  if (await db.settings.get(1)) return;
  if (await db.units.count()) { await db.settings.put(DEFAULT_SETTINGS); return; }
  const now = new Date();
  const month = currentMonth();
  const prevMonth = (() => { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();

  const units = [
    { code: 'A1', building: 'Sunrise Heights', type: '2-Bedroom', rent: 28000, deposit: 28000, tenantName: 'Wanjiru Mwangi', tenantPhone: '+254 712 345 678', tenantId: 'ID-102938', status: 'occupied', arrears: 0, meterPrev: 12450, createdAt: now.toISOString() },
    { code: 'A2', building: 'Sunrise Heights', type: '1-Bedroom', rent: 18000, deposit: 18000, tenantName: 'Otieno Ochieng', tenantPhone: '+254 733 456 789', tenantId: 'ID-204811', status: 'occupied', arrears: 9000, meterPrev: 8320, createdAt: now.toISOString() },
    { code: 'A3', building: 'Sunrise Heights', type: 'Bedsitter', rent: 9500, deposit: 9500, tenantName: 'Achieng Achieng', tenantPhone: '+254 745 567 890', tenantId: 'ID-309122', status: 'occupied', arrears: 0, meterPrev: 5210, createdAt: now.toISOString() },
    { code: 'A4', building: 'Sunrise Heights', type: '2-Bedroom', rent: 28000, deposit: 28000, tenantName: '', tenantPhone: '', tenantId: '', status: 'vacant', arrears: 0, meterPrev: 9900, createdAt: now.toISOString() },
    { code: 'B1', building: 'Palm Court', type: 'Studio', rent: 14000, deposit: 14000, tenantName: 'Kamau Njoroge', tenantPhone: '+254 722 678 901', tenantId: 'ID-411233', status: 'occupied', arrears: 0, meterPrev: 3100, createdAt: now.toISOString() },
    { code: 'B2', building: 'Palm Court', type: '1-Bedroom', rent: 18000, deposit: 18000, tenantName: 'Nyambura Karanja', tenantPhone: '+254 711 789 012', tenantId: 'ID-522344', status: 'occupied', arrears: 18000, meterPrev: 6740, createdAt: now.toISOString() },
    { code: 'B3', building: 'Palm Court', type: 'Bedsitter', rent: 9500, deposit: 9500, tenantName: 'Mutiso Kioko', tenantPhone: '+254 700 890 123', tenantId: 'ID-633455', status: 'occupied', arrears: 0, meterPrev: 4180, createdAt: now.toISOString() },
    { code: 'B4', building: 'Palm Court', type: 'Studio', rent: 14000, deposit: 14000, tenantName: '', tenantPhone: '', tenantId: '', status: 'vacant', arrears: 0, meterPrev: 2750, createdAt: now.toISOString() }
  ];
  const unitIds = await db.units.bulkAdd(units, { allKeys: true });

  const tariff = 85;
  const meterSeed = [
    { unitId: unitIds[0], prev: 12450, curr: 12478, month, date: now.toISOString(), createdBy: 'caretaker' },
    { unitId: unitIds[1], prev: 8320, curr: 8345, month, date: now.toISOString(), createdBy: 'caretaker' },
    { unitId: unitIds[2], prev: 5210, curr: 5222, month, date: now.toISOString(), createdBy: 'caretaker' },
    { unitId: unitIds[4], prev: 3100, curr: 3116, month, date: now.toISOString(), createdBy: 'caretaker' },
    { unitId: unitIds[5], prev: 6740, curr: 6768, month, date: now.toISOString(), createdBy: 'caretaker' },
    { unitId: unitIds[6], prev: 4180, curr: 4191, month, date: now.toISOString(), createdBy: 'caretaker' }
  ];
  await db.meterLogs.bulkAdd(meterSeed.map((m) => ({
    ...m, prevReading: m.prev, currReading: m.curr, consumption: m.curr - m.prev, tariff, charge: (m.curr - m.prev) * tariff
  })));

  const paySeed = [
    { unitId: unitIds[0], amount: 28000 + 28 * tariff, month, date: now.toISOString(), method: 'M-Pesa', reference: 'MPX8K2L9', note: 'Rent + water — Nov', createdBy: 'admin' },
    { unitId: unitIds[2], amount: 9500, month, date: now.toISOString(), method: 'Bank', reference: 'TRF-8812', note: 'Rent only', createdBy: 'admin' },
    { unitId: unitIds[4], amount: 14000 + 16 * tariff, month, date: now.toISOString(), method: 'M-Pesa', reference: 'MPX3Q7W1', note: 'Rent + water', createdBy: 'admin' },
    { unitId: unitIds[5], amount: 10000, month, date: now.toISOString(), method: 'Cash', reference: 'RCPT-104', note: 'Partial payment', createdBy: 'caretaker' },
    { unitId: unitIds[6], amount: 9500 + 11 * tariff, month, date: now.toISOString(), method: 'M-Pesa', reference: 'MPX9Z4T6', note: 'Rent + water', createdBy: 'admin' },
    { unitId: unitIds[1], amount: 18000, month: prevMonth, date: new Date(now.getTime() - 30 * 864e5).toISOString(), method: 'M-Pesa', reference: 'MPX1A2B3', note: 'Last month rent', createdBy: 'admin' }
  ];
  await db.payments.bulkAdd(paySeed);

  const ticketSeed = [
    { unitId: unitIds[0], title: 'Kitchen sink leaking', category: 'Plumbing', priority: 'Urgent', status: 'In Progress', cost: 3500, technician: 'Brian M.', description: 'Under-sink trap leaking onto cabinet floor.', createdAt: now.toISOString(), resolvedAt: null },
    { unitId: unitIds[1], title: 'Bathroom tap dripping', category: 'Plumbing', priority: 'Routine', status: 'Open', cost: 0, technician: '', description: 'Cold tap needs washer replacement.', createdAt: now.toISOString(), resolvedAt: null },
    { unitId: unitIds[5], title: 'Gate lock jammed', category: 'Locks', priority: 'Urgent', status: 'Open', cost: 0, technician: '', description: 'Main gate lock sticking — tenant locked out twice.', createdAt: now.toISOString(), resolvedAt: null },
    { unitId: unitIds[2], title: 'Corridor light flickering', category: 'Electrical', priority: 'Routine', status: 'Resolved', cost: 1200, technician: 'Brian M.', description: 'Replaced ballast in Block A corridor.', createdAt: new Date(now.getTime() - 3 * 864e5).toISOString(), resolvedAt: new Date(now.getTime() - 2 * 864e5).toISOString() }
  ];
  await db.tickets.bulkAdd(ticketSeed);
  await db.settings.put(DEFAULT_SETTINGS);
  });
}

export async function getStorageStats() {
  const [u, p, m, t] = await Promise.all([
    db.units.count(), db.payments.count(), db.meterLogs.count(), db.tickets.count()
  ]);
  let bytes = 0;
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      bytes = est.usage || 0;
    }
  } catch { /* noop */ }
  return { units: u, payments: p, meterLogs: m, tickets: t, bytes };
}

export function encodeCSV(rows) {
  return rows.map(row => row.map(value => {
    let text = String(value ?? '');
    // Prevent spreadsheet programs from interpreting untrusted text as formulas.
    if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
  }).join(',')).join('\n');
}

export function downloadCSV(filename, rows) {
  const csv = encodeCSV(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
