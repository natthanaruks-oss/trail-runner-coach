import { LEGACY_STORAGE_KEYS, SOURCE_TYPES, STORES } from '../core/constants.js';
import { createId } from '../core/id.js';
import { addDays, nowIso } from '../core/date.js';
import { bulkPut, get, put } from '../core/db.js';
import { flattenPlan } from '../core/plan.js';

export function isLegacyBackup(value) {
  return Boolean(value && typeof value === 'object' && (
    value.done || value.actual || value.readiness || value.niggles || value.why || value.food || value.sleep || value.water
  ) && !value.stores);
}

export async function migrateLegacyLocalStorage(settings) {
  const marker = await get(STORES.META, 'legacyLocalStorageMigration');
  if (marker) return marker;
  let legacy = null;
  let foundKey = null;
  for (const key of LEGACY_STORAGE_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) { legacy = JSON.parse(raw); foundKey = key; break; }
    } catch { /* ignore malformed or unavailable storage */ }
  }
  if (!legacy) {
    const result = { id: 'legacyLocalStorageMigration', status: 'not_found', migratedAt: nowIso() };
    await put(STORES.META, result);
    return result;
  }

  const imported = await importLegacyBackup(legacy, settings, { source: `localStorage:${foundKey}` });
  const result = { id: 'legacyLocalStorageMigration', status: 'completed', imported, migratedAt: nowIso() };
  await put(STORES.META, result);
  return result;
}

export async function importLegacyBackup(legacy, settings, options = {}) {
  if (!isLegacyBackup(legacy)) throw new Error('ไฟล์นี้ไม่ใช่ Backup รุ่นเดิมที่ระบบรู้จัก');
  const migratedSettings = {
    ...settings,
    athlete: {
      ...settings.athlete,
      weightKg: Number(legacy.startWeight) || settings.athlete.weightKg,
      maxHr: Number(legacy.hrmax) || settings.athlete.maxHr
    },
    profile: {
      ...settings.profile,
      motivation: legacy.why || settings.profile?.motivation || ''
    },
    preferences: {
      ...settings.preferences,
      nonExerciseActivityFactor: Number(legacy.activityFactor) || settings.preferences?.nonExerciseActivityFactor || 1.2
    },
    nutrition: {
      ...settings.nutrition,
      bmrKcal: Number(legacy.bmr) || settings.nutrition?.bmrKcal || null
    },
    updatedAt: nowIso()
  };
  await put(STORES.SETTINGS, migratedSettings);

  const activeRaceId = settings.selection?.activeRaceId;
  const activePlanId = settings.selection?.activePlanId;
  const race = activeRaceId ? await get(STORES.RACES, activeRaceId) : null;
  const plan = activePlanId ? await get(STORES.PLANS, activePlanId) : null;
  if (race && legacy.raceDate) {
    race.date = legacy.raceDate;
    race.updatedAt = nowIso();
    await put(STORES.RACES, race);
  }
  if (plan && legacy.startDate) {
    plan.startDate = legacy.startDate;
    plan.updatedAt = nowIso();
    await put(STORES.PLANS, plan);
  }

  const imported = { checkins: 0, painLogs: 0, workouts: 0, activities: 0, foodLogs: 0, customFoods: 0, waterLogs: 0, bodyComposition: 0, gear: 0, source: options.source || 'file' };
  const checkinMap = new Map();
  for (const [date, item] of Object.entries(legacy.readiness || {})) {
    const total = Number(item.tot) || 3;
    checkinMap.set(date, {
      date,
      source: SOURCE_TYPES.LEGACY,
      sleepQuality: total >= 5 ? 4 : total >= 3 ? 3 : 2,
      fatigue: total >= 5 ? 2 : total >= 3 ? 3 : 5,
      stress: 3,
      muscleSoreness: total >= 5 ? 2 : total >= 3 ? 3 : 4,
      legacyScore: total,
      note: 'Migrated from an earlier Trail Runner Coach / RTC70 readiness format.',
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
  }
  for (const [date, item] of Object.entries(legacy.sleep || {})) {
    const row = checkinMap.get(date) || { date, source: SOURCE_TYPES.LEGACY, createdAt: nowIso(), updatedAt: nowIso() };
    row.sleepHours = numberOrNull(item?.h ?? item?.hours);
    row.sleepQuality = numberOrNull(item?.q ?? item?.quality) || row.sleepQuality;
    checkinMap.set(date, row);
  }
  for (const [date, value] of Object.entries(legacy.rhr || {})) {
    const row = checkinMap.get(date) || { date, source: SOURCE_TYPES.LEGACY, createdAt: nowIso(), updatedAt: nowIso() };
    row.restingHr = numberOrNull(value);
    checkinMap.set(date, row);
  }
  const checkins = [...checkinMap.values()];
  await bulkPut(STORES.CHECKINS, checkins);
  imported.checkins = checkins.length;

  const painLogs = (legacy.niggles || []).map(item => ({
    id: createId('pain'),
    date: item.date,
    area: mapArea(item.area),
    severity: Math.min(10, Math.max(0, Number(item.sev) * 2 || 0)),
    during: 'unspecified',
    note: item.note || 'Migrated from an earlier version.',
    source: SOURCE_TYPES.LEGACY,
    createdAt: nowIso()
  }));
  await bulkPut(STORES.PAIN, painLogs);
  imported.painLogs = painLogs.length;

  const refreshedPlan = activePlanId ? await get(STORES.PLANS, activePlanId) : plan;
  const sessions = flattenPlan(refreshedPlan);
  const workouts = [];
  const activities = [];
  for (const session of sessions) {
    const oldId = `${session.weekId}-${session.dayIndex}`;
    const done = legacy.done?.[session.id] ?? legacy.done?.[oldId];
    const actual = legacy.actual?.[session.id] || legacy.actual?.[oldId];
    if (!done && !actual) continue;
    const workout = {
      planSessionId: session.id,
      date: session.date,
      status: done ? 'completed' : 'planned',
      actualDistanceKm: numberOrNull(actual?.km),
      actualElevationGainM: numberOrNull(actual?.v),
      rpe: numberOrNull(actual?.rpe),
      note: actual?.note || '',
      source: SOURCE_TYPES.LEGACY,
      updatedAt: nowIso()
    };
    workouts.push(workout);
    if (workout.status === 'completed' && (session.km > 0 || workout.actualDistanceKm > 0)) {
      activities.push({
        id: createId('activity'),
        externalId: `legacy:${session.id}`,
        date: session.date,
        name: session.title?.th || session.t,
        type: session.t,
        durationMin: estimateDuration(workout.actualDistanceKm ?? session.km, session.t),
        distanceKm: workout.actualDistanceKm ?? session.km ?? 0,
        elevationGainM: workout.actualElevationGainM ?? session.vert ?? 0,
        elevationLossM: workout.actualElevationGainM ?? session.vert ?? 0,
        avgHr: numberOrNull(actual?.hra),
        maxHr: numberOrNull(actual?.hrm),
        rpe: workout.rpe || null,
        terrain: Number(session.vert) > 100 ? 'trail' : 'road',
        isNight: session.t === 'Night',
        source: SOURCE_TYPES.LEGACY,
        importedAt: nowIso()
      });
    }
  }
  await bulkPut(STORES.WORKOUTS, workouts);
  await bulkPut(STORES.ACTIVITIES, activities);
  imported.workouts = workouts.length;
  imported.activities = activities.length;

  const customFoods = (legacy.customFoods || []).map((item, index) => ({
    id: String(item.id || `legacy-custom-${index + 1}`),
    category: item.cat || 'custom',
    nameTh: item.n?.th || item.name || `Legacy food ${index + 1}`,
    nameEn: item.n?.en || item.n?.th || item.name || `Legacy food ${index + 1}`,
    serving: '1 หน่วยบริโภคเดิม',
    kcal: Number(item.kcal) || 0,
    proteinG: Number(item.p) || 0,
    carbG: Number(item.c) || 0,
    fatG: fatFromLegacy(item),
    dataQuality: 'user_entered',
    source: SOURCE_TYPES.LEGACY,
    createdAt: nowIso(), updatedAt: nowIso()
  }));
  await bulkPut(STORES.CUSTOM_FOODS, customFoods);
  imported.customFoods = customFoods.length;

  const foodLogs = [];
  for (const [date, items] of Object.entries(legacy.food || {})) {
    for (const [index, item] of (items || []).entries()) {
      const quantity = Number(item.qty) || 1;
      const nameTh = item.n?.th || item.name || 'Legacy food';
      foodLogs.push({
        id: `legacy-food-log-${date}-${index}`,
        date,
        foodId: item.id || `legacy:${nameTh}`,
        category: item.cat || 'custom',
        nameTh,
        nameEn: item.n?.en || nameTh,
        serving: '1 หน่วยบริโภคเดิม', quantity,
        baseKcal: (Number(item.kcal) || 0) / quantity,
        baseProteinG: (Number(item.p) || 0) / quantity,
        baseCarbG: (Number(item.c) || 0) / quantity,
        baseFatG: fatFromLegacy(item) / quantity,
        kcal: Number(item.kcal) || 0,
        proteinG: Number(item.p) || 0,
        carbG: Number(item.c) || 0,
        fatG: fatFromLegacy(item),
        dataQuality: 'estimated', source: SOURCE_TYPES.LEGACY,
        createdAt: `${date}T12:00:${String(index).padStart(2, '0')}`, updatedAt: nowIso()
      });
    }
  }
  await bulkPut(STORES.FOOD_LOGS, foodLogs);
  imported.foodLogs = foodLogs.length;

  const waterLogs = Object.entries(legacy.water || {}).map(([date, amountMl]) => ({ date, amountMl: Number(amountMl) || 0, source: SOURCE_TYPES.LEGACY, updatedAt: nowIso() }));
  await bulkPut(STORES.WATER_LOGS, waterLogs);
  imported.waterLogs = waterLogs.length;

  const bodyComposition = [];
  if (Number(legacy.startWeight) > 0) bodyComposition.push({ id: 'legacy-start-weight', date: legacy.startDate || new Date().toISOString().slice(0,10), weightKg: Number(legacy.startWeight), source: SOURCE_TYPES.LEGACY, createdAt: nowIso(), updatedAt: nowIso() });
  for (const [week, value] of Object.entries(legacy.weights || {})) {
    if (!(Number(value) > 0)) continue;
    const date = addDays(legacy.startDate || new Date().toISOString().slice(0,10), (Number(week) - 1) * 7);
    bodyComposition.push({ id: `legacy-weight-week-${week}`, date, weightKg: Number(value), source: SOURCE_TYPES.LEGACY, createdAt: nowIso(), updatedAt: nowIso() });
  }
  await bulkPut(STORES.BODY_COMPOSITION, bodyComposition);
  imported.bodyComposition = bodyComposition.length;

  const equipmentMap = ['resistance-band','adjustable-dumbbell','step-box','yoga-mat','foam-roller','massage-ball'];
  const gear = equipmentMap.filter((id,index)=>legacy.gear?.[`eq${index}`]).map(id=>({ id, context:'home_training', owned:true, source:SOURCE_TYPES.LEGACY, updatedAt:nowIso() }));
  await bulkPut(STORES.GEAR, gear);
  imported.gear = gear.length;
  return imported;
}

function mapArea(value = '') {
  if (/ITB|ข้างเข่า/i.test(value)) return 'itb';
  if (/Achilles|ร้อยหวาย/i.test(value)) return 'achilles';
  if (/Plantar|รองช้ำ|ฝ่าเท้า/i.test(value)) return 'plantar';
  if (/เข่า|Knee/i.test(value)) return 'knee';
  return 'other';
}
function numberOrNull(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function estimateDuration(distanceKm, type) { const distance = Number(distanceKm) || 0; if (!distance) return type === 'Strength' ? 45 : 30; return Math.round(distance * (/Long|B2B|Hill|Night/.test(type) ? 11 : 8)); }

function fatFromLegacy(item) { if (item?.f != null && item.f !== '') return Number(item.f) || 0; return Math.max(0, Math.round(((Number(item?.kcal)||0) - 4*(Number(item?.p)||0) - 4*(Number(item?.c)||0)) / 9 * 10) / 10); }
