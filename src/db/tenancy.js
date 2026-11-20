import { db, computeBalance, currentMonth } from './db.js';

/** Close a settled unit ledger before starting another. The old financial records
 * are copied into an immutable local archive in the same transaction. */
export async function changeTenancy({ unitId, status, tenantName = '', tenantPhone = '', tenantId = '', rent, deposit, expectedRevision, month = currentMonth() }) {
  const name = tenantName.trim();
  if (!['occupied', 'vacant'].includes(status)) throw new Error('Select a valid occupancy status.');
  if (status === 'occupied' && !name) throw new Error('Enter the new tenant name.');
  if (!Number.isFinite(rent) || rent < 0 || !Number.isFinite(deposit) || deposit < 0) throw new Error('Enter valid rent and deposit amounts.');
  return db.transaction('rw', db.units, db.payments, db.meterLogs, db.waivers, db.archives, async () => {
    const unit = await db.units.get(unitId);
    if (!unit) throw new Error('Unit no longer exists.');
    if (expectedRevision != null && (unit.tenancyRevision || 0) !== expectedRevision) throw new Error('Tenancy changed. Reload the unit and try again.');
    const payments = await db.payments.where('unitId').equals(unitId).toArray();
    const meterLogs = await db.meterLogs.where('unitId').equals(unitId).toArray();
    const waivers = await db.waivers.where('unitId').equals(unitId).toArray();
    const closing = computeBalance(unit, payments, meterLogs, month, waivers);
    if (Math.abs(closing.balance) > 0.005) throw new Error('Settle the current balance or credit before changing tenancy.');
    const lastMeter = [...meterLogs].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)[0];
    const meterPrev = Number(lastMeter?.currReading ?? lastMeter?.curr ?? unit.meterPrev ?? 0);
    const archiveId = await db.archives.add({ unitId, closedAt: new Date().toISOString(), closingMonth: month, closingBalance: closing.balance, unit, payments, meterLogs, waivers });
    await db.payments.where('unitId').equals(unitId).delete();
    await db.meterLogs.where('unitId').equals(unitId).delete();
    await db.waivers.where('unitId').equals(unitId).delete();
    await db.units.update(unitId, {
      status, tenantName: status === 'occupied' ? name : '',
      tenantPhone: status === 'occupied' ? tenantPhone.trim() : '',
      tenantId: status === 'occupied' ? tenantId.trim() : '',
      rent, deposit, arrears: 0, meterPrev, billingStartMonth: month, tenancyRevision: (unit.tenancyRevision || 0) + 1,
      billingHistory: [{ month, rent, status }]
    });
    return archiveId;
  });
}
