import { DEFAULT_SETTINGS, STORES } from './constants.js';
import { DEFAULT_RACE_PROFILE, DEFAULT_TRAINING_PLAN } from '../data/defaults.js';
import * as db from './db.js';
import { nowIso } from './date.js';

const listeners = new Set();
const state = {
  ready: false,
  settings: null,
  raceProfiles: [],
  trainingPlans: [],
  checkins: [],
  activities: [],
  painLogs: [],
  workouts: [],
  rehabLogs: [],
  gear: [],
  metadata: [],
  bodyComposition: [],
  foodLogs: [],
  customFoods: [],
  waterLogs: [],
  dailyFlags: []
};

function deepMerge(target, source) {
  const out = structuredClone(target);
  for (const [key, value] of Object.entries(source || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && out[key] && typeof out[key] === 'object') {
      out[key] = deepMerge(out[key], value);
    } else if (value !== undefined) out[key] = value;
  }
  return out;
}

export async function initializeStore() {
  const saved = await db.get(STORES.SETTINGS, 'profile');
  const now = nowIso();
  state.settings = deepMerge(DEFAULT_SETTINGS, saved || { createdAt: now, updatedAt: now });
  await seedDomainData(now);
  await migrateEmbeddedProgramSettings(saved, now);
  if (!saved) await db.put(STORES.SETTINGS, state.settings);
  await refreshAll();
  state.ready = true;
  emit();
  return state;
}

async function seedDomainData(now) {
  const races = await db.getAll(STORES.RACES);
  const plans = await db.getAll(STORES.PLANS);
  if (!races.length) await db.put(STORES.RACES, { ...structuredClone(DEFAULT_RACE_PROFILE), createdAt: now, updatedAt: now });
  if (!plans.length) await db.put(STORES.PLANS, { ...structuredClone(DEFAULT_TRAINING_PLAN), createdAt: now, updatedAt: now });
}

async function migrateEmbeddedProgramSettings(saved, now) {
  if (!saved?.program) return;
  const marker = await db.get(STORES.META, 'embeddedProgramMigration');
  if (marker) return;
  const race = await db.get(STORES.RACES, DEFAULT_RACE_PROFILE.id);
  const plan = await db.get(STORES.PLANS, DEFAULT_TRAINING_PLAN.id);
  if (race && saved.program.raceDate) {
    race.date = saved.program.raceDate;
    race.updatedAt = now;
    await db.put(STORES.RACES, race);
  }
  if (plan && saved.program.startDate) {
    plan.startDate = saved.program.startDate;
    plan.updatedAt = now;
    await db.put(STORES.PLANS, plan);
  }
  state.settings = deepMerge(state.settings, {
    profile: {
      motivation: saved.program.motivation || state.settings.profile.motivation,
      completionGoal: saved.program.completionGoal || state.settings.profile.completionGoal
    }
  });
  delete state.settings.program;
  state.settings.updatedAt = now;
  await db.put(STORES.SETTINGS, state.settings);
  await db.put(STORES.META, { id: 'embeddedProgramMigration', migratedAt: now, status: 'completed' });
}

export async function refreshAll() {
  const [savedSettings, raceProfiles, trainingPlans, checkins, activities, painLogs, workouts, rehabLogs, gear, metadata, bodyComposition, foodLogs, customFoods, waterLogs, dailyFlags] = await Promise.all([
    db.get(STORES.SETTINGS, 'profile'),
    db.getAll(STORES.RACES),
    db.getAll(STORES.PLANS),
    db.getAll(STORES.CHECKINS),
    db.getAll(STORES.ACTIVITIES),
    db.getAll(STORES.PAIN),
    db.getAll(STORES.WORKOUTS),
    db.getAll(STORES.REHAB),
    db.getAll(STORES.GEAR),
    db.getAll(STORES.META),
    db.getAll(STORES.BODY_COMPOSITION),
    db.getAll(STORES.FOOD_LOGS),
    db.getAll(STORES.CUSTOM_FOODS),
    db.getAll(STORES.WATER_LOGS),
    db.getAll(STORES.DAILY_FLAGS)
  ]);
  if (savedSettings) state.settings = deepMerge(DEFAULT_SETTINGS, savedSettings);
  Object.assign(state, { raceProfiles, trainingPlans, checkins, activities, painLogs, workouts, rehabLogs, gear, metadata, bodyComposition, foodLogs, customFoods, waterLogs, dailyFlags });
  return state;
}

export function getState() { return state; }
export function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
function emit() { listeners.forEach(listener => listener(state)); }

export async function saveSettings(patch) {
  state.settings = deepMerge(state.settings, patch);
  state.settings.updatedAt = nowIso();
  await db.put(STORES.SETTINGS, state.settings);
  emit();
}

export async function setActiveRace(raceId, planId = null) {
  const race = state.raceProfiles.find(item => item.id === raceId);
  if (!race) throw new Error('ไม่พบ Race profile');
  const plan = planId
    ? state.trainingPlans.find(item => item.id === planId && item.raceId === raceId)
    : state.trainingPlans.find(item => item.raceId === raceId && item.status === 'active') || state.trainingPlans.find(item => item.raceId === raceId);
  await saveSettings({ selection: { activeRaceId: raceId, activePlanId: plan?.id || null } });
}

export async function upsertRecord(storeName, record) {
  await db.put(storeName, record);
  await refreshAll(); emit(); return record;
}
export async function upsertMany(storeName, records) { await db.bulkPut(storeName, records); await refreshAll(); emit(); }
export async function deleteRecord(storeName, key) { await db.remove(storeName, key); await refreshAll(); emit(); }

export { db };
