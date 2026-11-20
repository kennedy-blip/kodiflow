import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db, seedIfEmpty, computeBalance, currentMonth } from '../src/db/db.js';

test('seed is idempotent including concurrent initialization', async () => {
  await Promise.all([seedIfEmpty(), seedIfEmpty()]);
  assert.equal(await db.units.count(), 8);
  assert.equal(await db.payments.count(), 6);
  const reading = await db.meterLogs.toCollection().first();
  assert.equal(reading.currReading - reading.prevReading, reading.consumption);
  assert.equal(reading.charge, reading.consumption * reading.tariff);
  const unit = await db.units.get(reading.unitId);
  const balance = computeBalance(unit, await db.payments.toArray(), await db.meterLogs.toArray(), currentMonth());
  assert.equal(balance.waterCharge, reading.charge);
});

test('unpaid rent and water carry forward, payments, credits, waivers and month filtering', () => {
  const unit = { id: 1, rent: 1000, arrears: 200, status: 'occupied', createdAt: '2026-01-01' };
  const payments = [{ unitId: 1, month: '2026-01', amount: 600 }, { unitId: 1, month: '2026-02', amount: 100 }];
  const water = [{ unitId: 1, month: '2026-01', charge: 50 }, { unitId: 1, month: '2026-02', charge: 20 }, { unitId: 1, month: '2026-02', charge: 30 }, { unitId: 1, month: '2026-03', charge: 999 }];
  const waivers = [{ unitId: 1, month: '2026-02', amount: 100, date: '2026-02-01' }];
  const feb = computeBalance(unit, payments, water, '2026-02', waivers);
  assert.equal(feb.arrears, 550);
  assert.equal(feb.waterCharge, 50);
  assert.equal(feb.balance, 1500);
  const mar = computeBalance(unit, payments, water, '2026-03', waivers);
  assert.equal(mar.arrears, 1500);
  assert.equal(mar.balance, 3499);
  const credit = computeBalance(unit, [{ unitId: 1, month: '2026-01', amount: 2000 }], [], '2026-02');
  assert.equal(credit.balance, 200);
});

test('an intentionally emptied portfolio is not silently reseeded', async () => {
  await db.units.clear();
  await seedIfEmpty();
  assert.equal(await db.units.count(), 0);
});

test('rent and occupancy changes do not rewrite prior months', async () => {
  const { withBillingTerms } = await import('../src/db/db.js');
  let unit = { id: 55, rent: 1000, status: 'occupied', arrears: 0, createdAt: '2026-01-10' };
  unit.billingHistory = withBillingTerms(unit, 1500, 'occupied', '2026-03');
  unit.rent = 1500;
  assert.equal(computeBalance(unit, [], [], '2026-02').rent, 1000);
  assert.equal(computeBalance(unit, [], [], '2026-03').arrears, 2000);
  assert.equal(computeBalance(unit, [], [], '2026-03').balance, 3500);
  unit.billingHistory = withBillingTerms(unit, 1500, 'vacant', '2026-04');
  unit.status = 'vacant';
  assert.equal(computeBalance(unit, [], [], '2026-03').rent, 1500);
  assert.equal(computeBalance(unit, [], [], '2026-04').balance, 3500);
  assert.equal(computeBalance(unit, [], [], '2026-04').status, 'Vacant');
});

test('meter writes are atomic and reject stale or invalid readings', async () => {
  const { recordMeterReading } = await import('../src/db/db.js');
  const unitId = await db.units.add({ code: 'TEST', status: 'occupied', rent: 100, createdAt: '2026-01-01' });
  const first = await recordMeterReading({ unitId, previous: 10, current: 12.5, month: '2026-01', createdBy: 'caretaker' });
  assert.equal(first.charge, 212.5);
  assert.equal((await db.units.get(unitId)).meterPrev, 12.5);
  await assert.rejects(recordMeterReading({ unitId, previous: 10, current: 13 }), /Previous reading changed/);
  await assert.rejects(recordMeterReading({ unitId, previous: 12.5, current: 11 }), /valid readings/);
  assert.equal((await db.meterLogs.where('unitId').equals(unitId).count()), 1);
  await recordMeterReading({ unitId, previous: 12.5, current: 13, month: '2026-01' });
  assert.equal((await db.meterLogs.where('unitId').equals(unitId).count()), 2);
});

test('backup round trip preserves records and rejects malformed restores without deleting data', async () => {
  const { exportBackup, restoreBackup } = await import('../src/db/backup.js');
  await Promise.all([db.units.clear(), db.payments.clear(), db.meterLogs.clear(), db.tickets.clear(), db.waivers.clear(), db.settings.clear()]);
  await seedIfEmpty();
  const before = await exportBackup();
  assert.ok(before.units.length > 0);
  const damaged = structuredClone(before);
  damaged.payments.push({ id: 99999, unitId: 99999, amount: 12, month: '2026-01' });
  await assert.rejects(restoreBackup(damaged), /missing unit/);
  assert.deepEqual(await exportBackup().then(x => x.units), before.units);
  await db.units.clear();
  await restoreBackup(before);
  assert.deepEqual(await db.units.toArray(), before.units);
  assert.deepEqual(await db.meterLogs.toArray(), before.meterLogs);
});

test('tenancy change preserves settled history, meter continuity, and backup round-trip', async () => {
  const { changeTenancy } = await import('../src/db/tenancy.js');
  const { exportBackup, restoreBackup } = await import('../src/db/backup.js');
  const { recordMeterReading } = await import('../src/db/db.js');
  const month = currentMonth();
  const unitId = await db.units.add({ code: 'T1', building: 'Test', status: 'occupied', tenantName: 'Outgoing', rent: 100, deposit: 100, arrears: 0, createdAt: new Date().toISOString(), meterPrev: 0 });
  await recordMeterReading({ unitId, previous: 0, current: 1, month, createdBy: 'caretaker', expectedRevision: 0 });
  await assert.rejects(changeTenancy({ unitId, status: 'occupied', tenantName: 'Incoming', rent: 200, deposit: 200, month, expectedRevision: 0 }), /Settle/);
  assert.equal(await db.archives.where('unitId').equals(unitId).count(), 0);
  await db.payments.add({ unitId, month, amount: 185, method: 'Cash', reference: 'test' });
  const archiveId = await changeTenancy({ unitId, status: 'occupied', tenantName: 'Incoming', rent: 200, deposit: 200, month, expectedRevision: 0 });
  const archived = await db.archives.get(archiveId);
  assert.equal(archived.unit.tenantName, 'Outgoing');
  assert.equal(archived.payments.length, 1);
  assert.equal(archived.meterLogs.length, 1);
  assert.equal(archived.closingBalance, 0);
  const unit = await db.units.get(unitId);
  assert.equal(unit.tenantName, 'Incoming');
  assert.equal(unit.meterPrev, 1);
  assert.equal(unit.tenancyRevision, 1);
  assert.equal(await db.payments.where('unitId').equals(unitId).count(), 0);
  assert.equal(computeBalance(unit, [], [], month).balance, 200);
  await assert.rejects(recordMeterReading({ unitId, previous: 1, current: 2, month, expectedRevision: 0 }), /Tenancy changed/);
  await assert.rejects(recordMeterReading({ unitId, previous: 0, current: 2, month, expectedRevision: 1 }), /previous tenancy/);
  await recordMeterReading({ unitId, previous: 1, current: 2, month, expectedRevision: 1 });
  await assert.rejects(changeTenancy({ unitId, status: 'vacant', rent: 200, deposit: 200, month, expectedRevision: 0 }), /Tenancy changed/);
  const backup = await exportBackup();
  await db.archives.clear();
  await restoreBackup(backup);
  assert.deepEqual(await db.archives.get(archiveId), archived);
});

test('minor-unit rounding prevents phantom arrears from decimal payments', () => {
  const unit = { id: 123, rent: 0.3, status: 'occupied', arrears: 0, createdAt: '2026-01-01' };
  const payments = [{ unitId: 123, month: '2026-01', amount: 0.1 }, { unitId: 123, month: '2026-01', amount: 0.2 }];
  const balance = computeBalance(unit, payments, [], '2026-01');
  assert.equal(balance.balance, 0);
  assert.equal(balance.status, 'Paid');
});

test('CSV exports quote values and neutralize spreadsheet formulas', async () => {
  const { encodeCSV } = await import('../src/db/db.js');
  assert.equal(encodeCSV([['=1+1', ' "quote" ', 123, -5, '+254700000000']]), '"\'=1+1"," ""quote"" ","123","-5","\'+254700000000"');
});
