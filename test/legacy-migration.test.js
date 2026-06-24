import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { initializeStore, getState, db } from '../public/js/core/store.js';
import { STORES } from '../public/js/core/constants.js';
import { importLegacyBackup, isLegacyBackup } from '../public/js/adapters/legacy.js';

test('legacy roadtopyc70 backup migrates food, water, sleep, pain, body and equipment', async () => {
  await initializeStore();
  const legacy = {
    why: 'จบอย่างสุขภาพดี',
    startDate: '2026-06-22',
    raceDate: '2026-10-16',
    startWeight: 89,
    hrmax: 190,
    bmr: 1780,
    activityFactor: 1.25,
    sleep: { '2026-06-23': { h: 7.5, q: 4 } },
    rhr: { '2026-06-23': 56 },
    niggles: [{ date: '2026-06-23', area: 'Achilles', sev: 2, note: 'ตึงหลังวิ่ง' }],
    customFoods: [{ id: 'c1', cat: 'meal', n: { th: 'เมนูเดิม', en: 'Legacy meal' }, kcal: 500, p: 25, c: 60, f: 15 }],
    food: { '2026-06-23': [{ id: 'c1', cat: 'meal', n: { th: 'เมนูเดิม', en: 'Legacy meal' }, qty: 1, kcal: 500, p: 25, c: 60, f: 15 }] },
    water: { '2026-06-23': 1750 },
    weights: { 2: 88.5 },
    gear: { eq0: true, eq2: true },
    done: {}, actual: {}, readiness: {}
  };
  assert.equal(isLegacyBackup(legacy), true);
  const result = await importLegacyBackup(legacy, getState().settings, { source: 'test' });
  assert.equal(result.foodLogs, 1);
  assert.equal(result.customFoods, 1);
  assert.equal(result.waterLogs, 1);
  assert.equal(result.painLogs, 1);
  assert.equal(result.bodyComposition, 2);
  assert.equal(result.gear, 2);
  assert.equal((await db.getAll(STORES.CHECKINS))[0].sleepHours, 7.5);
  assert.equal((await db.getAll(STORES.CHECKINS))[0].restingHr, 56);
  assert.equal((await db.getAll(STORES.FOOD_LOGS))[0].nameTh, 'เมนูเดิม');
  assert.equal((await db.getAll(STORES.WATER_LOGS))[0].amountMl, 1750);
});
