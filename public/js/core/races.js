import { addDays } from './date.js';
import { createId } from './id.js';
import { PLAN_TEMPLATE } from '../data/defaults.js';

export function getActiveRace(state) {
  const selected = state.settings?.selection?.activeRaceId;
  return state.raceProfiles.find(race => race.id === selected)
    || state.raceProfiles.find(race => race.status === 'upcoming')
    || state.raceProfiles[0]
    || null;
}

export function getActivePlan(state) {
  const selected = state.settings?.selection?.activePlanId;
  const activeRace = getActiveRace(state);
  return state.trainingPlans.find(plan => plan.id === selected)
    || state.trainingPlans.find(plan => plan.raceId === activeRace?.id && plan.status === 'active')
    || state.trainingPlans.find(plan => plan.raceId === activeRace?.id)
    || state.trainingPlans[0]
    || null;
}

export function createRaceProfile(input = {}) {
  const now = new Date().toISOString();
  const distanceKm = positiveNumber(input.distanceKm);
  const elevationGainM = nonNegativeNumber(input.elevationGainM);
  const elevationLossM = nonNegativeNumber(input.elevationLossM);
  const cutoffMinutes = input.cutoffMinutes != null
    ? nonNegativeNumber(input.cutoffMinutes)
    : Math.round(nonNegativeNumber(input.cutoffHours) * 60);

  if (!String(input.name || '').trim()) throw new Error('กรุณาใส่ชื่อสนาม');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date || ''))) throw new Error('กรุณาใส่วันแข่งขัน');
  if (!distanceKm) throw new Error('ระยะทางต้องมากกว่า 0');

  return {
    id: input.id || createId('race'),
    name: String(input.name).trim(),
    edition: String(input.edition || new Date(`${input.date}T12:00:00`).getFullYear()),
    date: input.date,
    location: String(input.location || '').trim(),
    distanceKm,
    elevationGainM,
    elevationLossM,
    cutoffMinutes,
    startTime: String(input.startTime || '06:00'),
    aidStations: Math.round(nonNegativeNumber(input.aidStations)),
    technicalLevel: clamp(Math.round(nonNegativeNumber(input.technicalLevel) || 3), 1, 5),
    nightRunning: Boolean(input.nightRunning),
    priority: ['A','B','C'].includes(String(input.priority || '').toUpperCase()) ? String(input.priority).toUpperCase() : 'A',
    goalType: ['finish','time','performance'].includes(String(input.goalType || '')) ? String(input.goalType) : 'finish',
    targetTimeMinutes: input.targetTimeMinutes != null ? nonNegativeNumber(input.targetTimeMinutes) : null,
    status: input.status || 'upcoming',
    notes: String(input.notes || '').trim(),
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

export function createPlanFromTemplate(race, options = {}) {
  if (!race?.id || !race.date) throw new Error('Race profile ไม่สมบูรณ์');
  const weeks = structuredClone(options.weeks || PLAN_TEMPLATE.weeks);
  const raceOffset = findRaceSessionOffset(weeks);
  if (raceOffset < 0) throw new Error('Training template ไม่มี Race session');
  const startDate = options.startDate || addDays(race.date, -raceOffset);
  const planId = options.id || createId('plan');

  for (const week of weeks) {
    for (const day of week.days || []) {
      if (day.t !== 'Race') continue;
      day.title = { th: `RACE DAY — ${race.name}`, en: `RACE DAY — ${race.name}` };
      day.km = race.distanceKm;
      day.vert = race.elevationGainM;
    }
  }

  const now = new Date().toISOString();
  return {
    id: planId,
    raceId: race.id,
    name: options.name || `${race.name} — Adaptive Trail Plan`,
    templateId: options.templateId || PLAN_TEMPLATE.id,
    startDate,
    goal: options.goal || 'finish-healthy-happy',
    status: options.status || 'active',
    weeks,
    createdAt: options.createdAt || now,
    updatedAt: now
  };
}

export function findRaceSessionOffset(weeks = []) {
  let offset = 0;
  for (const week of weeks) {
    for (const day of week.days || []) {
      if (day.t === 'Race') return offset;
      offset += 1;
    }
  }
  return -1;
}

export function raceSummary(race) {
  if (!race) return 'ยังไม่ได้เลือกสนาม';
  const cutoff = race.cutoffMinutes ? `${Math.floor(race.cutoffMinutes / 60)} ชม. ${race.cutoffMinutes % 60 || ''}`.trim() : 'ไม่ระบุ Cut-off';
  return `${race.distanceKm} km · +${race.elevationGainM || 0} m · ${cutoff}`;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}
function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
