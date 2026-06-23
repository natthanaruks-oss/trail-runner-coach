import { TRAIL_ULTRA_20W_TEMPLATE_WEEKS } from './trail-ultra-20w-template.js';

export const DEFAULT_RACE_PROFILE = Object.freeze({
  id: 'race-rtc70-2026',
  name: 'RTC 70',
  edition: '2026',
  date: '2026-10-16',
  location: 'Thailand',
  distanceKm: 72.5,
  elevationGainM: 3586,
  elevationLossM: 3598,
  cutoffMinutes: 900,
  startTime: '16:00',
  aidStations: 3,
  technicalLevel: 4,
  nightRunning: true,
  status: 'upcoming',
  notes: 'Initial race profile migrated from the original project.',
  createdAt: null,
  updatedAt: null
});

const defaultWeeks = structuredClone(TRAIL_ULTRA_20W_TEMPLATE_WEEKS);
for (const week of defaultWeeks) {
  for (const day of week.days || []) {
    if (day.t !== 'Race') continue;
    day.title = { th: `RACE DAY — ${DEFAULT_RACE_PROFILE.name}`, en: `RACE DAY — ${DEFAULT_RACE_PROFILE.name}` };
    day.km = DEFAULT_RACE_PROFILE.distanceKm;
    day.vert = DEFAULT_RACE_PROFILE.elevationGainM;
  }
}

export const DEFAULT_TRAINING_PLAN = Object.freeze({
  id: 'plan-rtc70-2026',
  raceId: DEFAULT_RACE_PROFILE.id,
  name: 'RTC 70 — Finish Healthy & Happy',
  templateId: 'trail-ultra-20w-v1',
  startDate: '2026-06-01',
  goal: 'finish-healthy-happy',
  status: 'active',
  weeks: defaultWeeks,
  createdAt: null,
  updatedAt: null
});

export const PLAN_TEMPLATE = Object.freeze({
  id: 'trail-ultra-20w-v1',
  name: 'Trail Ultra 20-week Foundation + Race Specific',
  weeks: TRAIL_ULTRA_20W_TEMPLATE_WEEKS
});
