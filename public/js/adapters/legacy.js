import { LEGACY_STORAGE_KEYS, SOURCE_TYPES, STORES } from '../core/constants.js';
import { createId } from '../core/id.js';
import { nowIso } from '../core/date.js';
import { bulkPut, get, put } from '../core/db.js';
import { flattenPlan } from '../core/plan.js';

export function isLegacyBackup(value) {
  return Boolean(value && typeof value === 'object' && (
    value.done || value.actual || value.readiness || value.niggles || value.why
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

  const imported = { checkins: 0, painLogs: 0, workouts: 0, activities: 0, source: options.source || 'file' };
  const checkins = Object.entries(legacy.readiness || {}).map(([date, item]) => {
    const total = Number(item.tot) || 3;
    return {
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
    };
  });
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
