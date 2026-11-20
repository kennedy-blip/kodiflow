import { db, DEFAULT_SETTINGS } from './db.js';

const tables = ['units', 'payments', 'meterLogs', 'tickets', 'waivers', 'archives'];
const validId = value => Number.isSafeInteger(value) && value > 0;
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Reject incomplete or inconsistent backups before touching the current database. */
export function validateBackup(data) {
  if (!data || typeof data !== 'object' || !data.settings || data.settings.id !== 1) throw new Error('Missing settings');
  if (data.formatVersion != null && ![1, 2].includes(data.formatVersion)) throw new Error('Unsupported backup version');
  if (!nonnegative(data.settings.waterTariff)) throw new Error('Invalid water tariff');
  for (const table of tables) {
    if ((table === 'waivers' || table === 'archives') && data[table] == null) continue; // Earlier backups omitted these tables.
    if (!Array.isArray(data[table])) throw new Error(`Missing ${table}`);
    const ids = new Set();
    for (const item of data[table]) {
      if (!item || !validId(item.id) || ids.has(item.id)) throw new Error(`Invalid or duplicate ${table} ID`);
      ids.add(item.id);
    }
  }
  const ids = new Set(data.units.map(u => u.id));
  for (const u of data.units) {
    if (typeof u.code !== 'string' || typeof u.building !== 'string' || !['occupied', 'vacant'].includes(u.status) || !nonnegative(u.rent || 0) || !nonnegative(u.arrears || 0)) throw new Error('Invalid unit');
    if (u.billingHistory && (!Array.isArray(u.billingHistory) || u.billingHistory.some(h => !monthPattern.test(h.month) || !nonnegative(h.rent) || !['occupied', 'vacant'].includes(h.status)))) throw new Error('Invalid billing history');
  }
  for (const archive of data.archives || []) {
    if (!ids.has(archive.unitId) || !archive.unit || archive.unit.id !== archive.unitId || !monthPattern.test(archive.closingMonth) || typeof archive.closedAt !== 'string' || !Number.isFinite(archive.closingBalance) || !['payments', 'meterLogs', 'waivers'].every(k => Array.isArray(archive[k]))) throw new Error('Invalid archived tenancy');
    if ([...archive.payments, ...archive.meterLogs, ...archive.waivers].some(row => row.unitId !== archive.unitId)) throw new Error('Invalid archived records');
  }
  for (const table of ['payments', 'meterLogs', 'tickets', 'waivers']) {
    for (const row of data[table] || []) {
      if (!(table === 'tickets' && row.unitId == null) && !ids.has(row.unitId)) throw new Error(`${table} refers to a missing unit`);
      if (['payments', 'meterLogs'].includes(table) && !monthPattern.test(row.month)) throw new Error(`Invalid ${table} month`);
      if (table === 'payments' && !nonnegative(row.amount)) throw new Error('Invalid payment amount');
      if (table === 'meterLogs' && (!nonnegative(row.charge) || !nonnegative(row.currReading ?? row.curr) || !nonnegative(row.prevReading ?? row.prev))) throw new Error('Invalid meter reading');
      if (table === 'waivers' && (!nonnegative(row.amount) || !(monthPattern.test(row.month || '') || typeof row.date === 'string' && monthPattern.test(row.date.slice(0, 7))))) throw new Error('Invalid waiver');
    }
  }
  return data;
}

export async function exportBackup() {
  return db.transaction('r', db.units, db.payments, db.meterLogs, db.tickets, db.waivers, db.archives, db.settings, async () => {
    const data = { formatVersion: 2, exportedAt: new Date().toISOString(), settings: await db.settings.get(1) };
    for (const table of tables) data[table] = await db[table].toArray();
    return data;
  });
}

export async function restoreBackup(data) {
  validateBackup(data);
  const settings = { ...DEFAULT_SETTINGS, ...data.settings };
  await db.transaction('rw', db.units, db.payments, db.meterLogs, db.tickets, db.waivers, db.archives, db.settings, async () => {
    for (const table of tables) {
      await db[table].clear();
      await db[table].bulkPut(data[table] || []);
    }
    await db.settings.put(settings);
  });
  return settings;
}
