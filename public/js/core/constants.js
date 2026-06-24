export const APP_NAME = 'Trail Runner Coach';
export const APP_VERSION = '1.2.0';
export const DB_NAME = 'trail_runner_coach';
export const DB_VERSION = 4;
export const LEGACY_STORAGE_KEYS = Object.freeze(['rtc70_v2', 'trail_runner_coach_v1']);

export const STORES = Object.freeze({
  SETTINGS: 'settings',
  RACES: 'raceProfiles',
  PLANS: 'trainingPlans',
  CHECKINS: 'checkins',
  ACTIVITIES: 'activities',
  PAIN: 'painLogs',
  WORKOUTS: 'workouts',
  REHAB: 'rehabLogs',
  GEAR: 'gear',
  META: 'metadata',
  BODY_COMPOSITION: 'bodyComposition',
  FOOD_LOGS: 'foodLogs',
  CUSTOM_FOODS: 'customFoods',
  WATER_LOGS: 'waterLogs',
  DAILY_FLAGS: 'dailyFlags'
});

export const DEFAULT_SETTINGS = Object.freeze({
  id: 'profile',
  language: 'th',
  athlete: {
    age: null,
    sex: null,
    heightCm: null,
    weightKg: null,
    maxHr: null,
    restingHrBaseline: null,
    sleepTargetHours: 7.5,
    flatFeet: false,
    wideForefoot: false
  },
  profile: {
    motivation: '',
    completionGoal: 'finish-healthy-happy'
  },
  selection: {
    activeRaceId: 'race-rtc70-2026',
    activePlanId: 'plan-rtc70-2026'
  },
  preferences: {
    weekStartsOn: 1,
    units: 'metric',
    allowNotifications: false,
    nonExerciseActivityFactor: 1.2
  },
  nutrition: {
    bmrKcal: null,
    proteinTargetGPerKg: 1.8,
    waterBaseMlPerKg: 30
  },
  createdAt: null,
  updatedAt: null
});

export const PAIN_AREAS = Object.freeze([
  { id: 'itb', label: 'ITB / ด้านข้างเข่า' },
  { id: 'achilles', label: 'เอ็นร้อยหวาย' },
  { id: 'plantar', label: 'ฝ่าเท้า / รองช้ำ' },
  { id: 'knee', label: 'เข่า' },
  { id: 'calf', label: 'น่อง' },
  { id: 'ankle', label: 'ข้อเท้า' },
  { id: 'hip', label: 'สะโพก' },
  { id: 'back', label: 'หลัง' },
  { id: 'other', label: 'อื่น ๆ' }
]);

export const SESSION_TYPES = Object.freeze({
  REST: 'Rest',
  REHAB: 'Rehab',
  STRENGTH: 'Strength',
  EASY: 'Easy',
  HILL: 'Hill',
  TEMPO: 'Tempo',
  LONG: 'Long',
  B2B: 'B2B',
  NIGHT: 'Night',
  RACE: 'Race'
});

export const SOURCE_TYPES = Object.freeze({
  MANUAL: 'manual',
  GPX: 'gpx',
  TCX: 'tcx',
  CSV: 'csv',
  LEGACY: 'legacy',
  GARMIN: 'garmin',
  SUUNTO: 'suunto',
  APPLE_HEALTH: 'apple_health',
  HYBRID: 'hybrid'
});
