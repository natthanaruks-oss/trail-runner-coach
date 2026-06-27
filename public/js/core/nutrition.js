import { getPlanContext } from './plan.js';
import { localDateKey, addDays } from './date.js';

export function foodItemsForDate(state, dateKey = localDateKey()) {
  return state.foodLogs.filter(item => item.date === dateKey).sort((a,b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export function foodTotals(state, dateKey = localDateKey()) {
  return foodItemsForDate(state, dateKey).reduce((total, item) => {
    total.kcal += number(item.kcal);
    total.proteinG += number(item.proteinG);
    total.carbG += number(item.carbG);
    total.fatG += number(item.fatG);
    return total;
  }, { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 });
}

export function latestBodyComposition(state) {
  return [...state.bodyComposition].sort((a,b)=>String(b.measuredAt || b.date).localeCompare(String(a.measuredAt || a.date)))[0] || null;
}

export function athleteWeightKg(state) {
  return number(latestBodyComposition(state)?.weightKg) || number(state.settings?.athlete?.weightKg) || 89;
}

export function estimateBmrKcal(state) {
  const latest = latestBodyComposition(state);
  const fixed = number(state.settings?.nutrition?.bmrKcal);
  if (fixed > 0) return { value: Math.round(fixed), source: 'settings' };
  const inbody = number(latest?.basalMetabolicRateKcal);
  if (inbody > 0) return { value: Math.round(inbody), source: latest?.source || 'body_composition' };
  const weight = athleteWeightKg(state);
  const height = number(state.settings?.athlete?.heightCm) || number(latest?.heightCm);
  const age = number(state.settings?.athlete?.age);
  const sex = state.settings?.athlete?.sex;
  if (height > 0 && age > 0) {
    const base = 10 * weight + 6.25 * height - 5 * age;
    return { value: Math.round(base + (sex === 'female' ? -161 : 5)), source: 'mifflin_estimate' };
  }
  return { value: Math.round(weight * 21.5), source: 'weight_estimate' };
}

export function proteinTargetG(state) {
  const factor = number(state.settings?.nutrition?.proteinTargetGPerKg) || 1.8;
  return Math.round(athleteWeightKg(state) * factor);
}

export function dailyWaterTargetMl(state, dateKey = localDateKey()) {
  const weight = athleteWeightKg(state);
  const baseFactor = number(state.settings?.nutrition?.waterBaseMlPerKg) || 30;
  const activityMinutes = state.activities.filter(item => item.date === dateKey).reduce((sum,item)=>sum+number(item.durationMin),0);
  const plan = getPlanContext(state, dateKey)?.todaySession;
  const plannedMinutes = !activityMinutes && plan?.km ? Math.max(30, number(plan.km) * (/Long|B2B|Night|Hill/.test(plan.t) ? 10 : 8)) : 0;
  const exerciseHours = Math.max(activityMinutes, plannedMinutes) / 60;
  return Math.round((weight * baseFactor + exerciseHours * 550) / 250) * 250;
}

export function nutritionTarget(state, dateKey = localDateKey()) {
  const bmr = estimateBmrKcal(state);
  const plan = getPlanContext(state, dateKey)?.todaySession;
  const sessionType = plan?.t || 'Rest';
  const checkin = state.checkins.find(item => item.date === dateKey);
  const appleActive = number(checkin?.activeEnergyKcal);
  const activityFactor = number(state.settings?.preferences?.nonExerciseActivityFactor) || 1.2;
  // Apple Health Active Energy already represents calories burned above resting metabolism.
  // When it is available, combine it with BMR directly so sedentary activity is not counted twice.
  const baseOut = appleActive > 0 ? bmr.value : Math.round(bmr.value * activityFactor);
  const activityOut = appleActive > 0 ? appleActive : estimateExerciseEnergy(state, dateKey, plan);
  const hard = /Long|B2B|Night|Hill|Tempo|Race/.test(sessionType);
  const phase = getPlanContext(state, dateKey)?.week?.phase || '';
  const buildPeak = /build|peak/i.test(phase);
  const target = baseOut + activityOut;
  return {
    kcal: Math.max(1500, Math.round(target / 50) * 50),
    low: Math.max(1500, Math.round((target - (hard || buildPeak ? 100 : 200)) / 50) * 50),
    high: Math.round((target + 200) / 50) * 50,
    proteinG: proteinTargetG(state),
    carbG: Math.round(athleteWeightKg(state) * (hard ? 5 : /Easy/.test(sessionType) ? 3.5 : 3)),
    waterMl: dailyWaterTargetMl(state, dateKey),
    bmrKcal: bmr.value,
    bmrSource: bmr.source,
    restingEnergyKcal: baseOut,
    activeEnergyKcal: activityOut,
    activitySource: appleActive > 0 ? 'apple_health' : 'estimated_from_training',
    totalOutSource: appleActive > 0 ? 'bmr_plus_apple_active_energy' : 'activity_factor_plus_training_estimate',
    mode: hard || buildPeak ? 'fuel_recovery' : 'maintenance',
    sessionType,
    phase
  };
}

export function energyBalanceForDate(state, dateKey = localDateKey()) {
  const totals = foodTotals(state, dateKey);
  const target = nutritionTarget(state, dateKey);
  const flag = state.dailyFlags.find(item => item.date === dateKey);
  const totalOut = target.restingEnergyKcal + target.activeEnergyKcal;
  return {
    date: dateKey,
    intakeKcal: Math.round(totals.kcal),
    totalOutKcal: Math.round(totalOut),
    netKcal: Math.round(totals.kcal - totalOut),
    foodComplete: Boolean(flag?.foodComplete),
    ...totals,
    target
  };
}

export function energyBalanceRange(state, days = 7, endDateKey = localDateKey()) {
  const safeDays = Math.max(1, Math.min(366, Number(days) || 7));
  return energyBalancePeriod(state, addDays(endDateKey, -(safeDays - 1)), endDateKey);
}

export function energyBalancePeriod(state, startDateKey, endDateKey = localDateKey()) {
  const start = normalizeDateKey(startDateKey || endDateKey);
  const end = normalizeDateKey(endDateKey || startDateKey);
  const [from, to] = start <= end ? [start, end] : [end, start];
  const days = Math.min(366, daysInclusive(from, to));
  const rows = [];
  for (let offset = 0; offset < days; offset += 1) rows.push(energyBalanceForDate(state, addDays(from, offset)));
  const complete = rows.filter(row => row.foodComplete);
  const net = complete.reduce((sum,row)=>sum+row.netKcal,0);
  const deficits = complete.filter(row => row.netKcal < 0);
  const surpluses = complete.filter(row => row.netKcal > 0);
  const deficitKcal = deficits.reduce((sum,row)=>sum+Math.abs(row.netKcal),0);
  const surplusKcal = surpluses.reduce((sum,row)=>sum+row.netKcal,0);
  return {
    rows,
    startDate: from,
    endDate: to,
    selectedDays: rows.length,
    completeDays: complete.length,
    coveragePct: rows.length ? Math.round(complete.length / rows.length * 100) : 0,
    deficitDays: deficits.length,
    surplusDays: surpluses.length,
    deficitKcal: Math.round(deficitKcal),
    surplusKcal: Math.round(surplusKcal),
    netKcal: Math.round(net),
    averageNetKcal: complete.length ? Math.round(net / complete.length) : null,
    averageDeficitKcal: deficits.length ? Math.round(deficitKcal / deficits.length) : null,
    estimatedWeightChangeKg: +(net / 7700).toFixed(2),
    averageIntakeKcal: complete.length ? Math.round(complete.reduce((s,r)=>s+r.intakeKcal,0)/complete.length) : null,
    averageProteinG: complete.length ? Math.round(complete.reduce((s,r)=>s+r.proteinG,0)/complete.length) : null
  };
}

function normalizeDateKey(value) {
  const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}$/);
  return match ? match[0] : localDateKey();
}
function daysInclusive(start, end) {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.max(1, Math.floor(ms / 86400000) + 1);
}

export function recentFoodBases(state, catalog, limit = 12) {
  const baseById = new Map([...catalog, ...state.customFoods].map(item => [item.id, item]));
  const seen = new Set();
  const out = [];
  for (const log of [...state.foodLogs].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))) {
    if (seen.has(log.foodId)) continue;
    const base = baseById.get(log.foodId) || {
      id: log.foodId, category: log.category || 'custom', nameTh: log.nameTh, nameEn: log.nameEn,
      kcal: log.baseKcal || log.kcal, proteinG: log.baseProteinG || log.proteinG,
      carbG: log.baseCarbG || log.carbG, fatG: log.baseFatG || log.fatG,
      serving: log.serving || '1 หน่วย', dataQuality: log.dataQuality || 'user_entered', source: log.source || 'food_log'
    };
    seen.add(log.foodId); out.push(base);
    if (out.length >= limit) break;
  }
  return out;
}

export function hrZones(maxHr) {
  const max = number(maxHr);
  if (!max) return [];
  return [
    { zone:'Z1', min:Math.round(max*.50), max:Math.round(max*.60), label:'Recovery / เบามาก' },
    { zone:'Z2', min:Math.round(max*.60), max:Math.round(max*.70), label:'Easy aerobic / คุยได้' },
    { zone:'Z3', min:Math.round(max*.70), max:Math.round(max*.80), label:'Steady / Tempo เบา' },
    { zone:'Z4', min:Math.round(max*.80), max:Math.round(max*.90), label:'Threshold / หนัก' },
    { zone:'Z5', min:Math.round(max*.90), max:Math.round(max), label:'VO₂ / สูงมาก' }
  ];
}

function estimateExerciseEnergy(state, dateKey, plan) {
  const activities = state.activities.filter(item => item.date === dateKey);
  if (activities.length) return Math.round(activities.reduce((sum,item)=>sum+estimateActivity(item),0));
  if (!plan || !plan.km) return /Strength|Rehab/.test(plan?.t || '') ? 180 : 0;
  const weight = athleteWeightKg(state);
  const distanceCost = weight * number(plan.km) * (/Trail|Long|B2B|Hill|Night/.test(plan.t) ? 1.15 : 1.0);
  const climbCost = number(plan.vert) * weight * 0.0008;
  return Math.round(distanceCost + climbCost);
}
function estimateActivity(item) {
  if (number(item.activeEnergyKcal) > 0) return number(item.activeEnergyKcal);
  if (number(item.caloriesKcal) > 0) return number(item.caloriesKcal);
  const duration = number(item.durationMin);
  const rpe = number(item.rpe) || 4;
  return duration * (2.5 + rpe * .45);
}
function number(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
