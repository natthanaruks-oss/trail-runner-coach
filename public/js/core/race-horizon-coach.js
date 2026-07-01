import { addDays, daysBetween, localDateKey } from './date.js';
import { getActiveRace } from './races.js';
import { calculateSessionLoad } from '../engines/strain.js';

const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const sum = values => values.reduce((total, value) => total + (Number(value) || 0), 0);
const average = values => values.length ? sum(values) / values.length : 0;

export const RACE_HORIZON_VERSION = '4.0.0';

export function buildRaceHorizonCoach({
  state = {},
  today = {},
  unified = {},
  trailCoach = {},
  week = {},
  endDateKey = localDateKey()
} = {}) {
  const race = Array.isArray(state?.raceProfiles)
    ? (getActiveRace(state) || today?.race || null)
    : (today?.race || null);
  if (!race?.date) return emptyModel('race_missing');

  const daysRemaining = Math.max(0, daysBetween(endDateKey, race.date));
  const usableWeeks = Math.max(0, Math.floor(Math.max(0, daysRemaining - minimumTaperDays(race)) / 7));
  const evidence = buildCapabilityEvidence(state.activities || [], endDateKey);
  const demands = buildRaceDemandModel(race);
  const gaps = buildCapabilityGaps({ race, demands, evidence, daysRemaining, usableWeeks });
  const objective = resolveObjective({ race, gaps, daysRemaining, evidence });
  const block = buildDynamicBlock({ race, daysRemaining, usableWeeks, gaps, evidence, objective });
  const mission = buildDailyMission({
    race,
    daysRemaining,
    block,
    gaps,
    today,
    unified,
    trailCoach,
    week,
    evidence
  });
  const confidence = Math.round(clamp(average([
    evidence.confidence,
    trailCoach?.race?.confidence || 0,
    unified?.coverage?.confidence || 0
  ].filter(finite)), 0, 100));

  return {
    version: RACE_HORIZON_VERSION,
    race: compactRace(race),
    daysRemaining,
    usableWeeks,
    horizon: horizonBand(daysRemaining),
    objective,
    demands,
    evidence,
    gaps,
    block,
    mission,
    confidence,
    evaluatedAt: new Date().toISOString(),
    disclaimerCode: 'adaptive_training_guidance_not_medical'
  };
}

export function buildRaceDemandModel(race = {}) {
  const distance = Math.max(1, Number(race.distanceKm) || 1);
  const gain = Math.max(0, Number(race.elevationGainM) || 0);
  const cutoffHours = Math.max(0, Number(race.cutoffMinutes) || 0) / 60;
  const technical = clamp(Number(race.technicalLevel) || 3, 1, 5);
  const climbDensity = gain / distance;
  return {
    distanceKm: round(distance, 1),
    elevationGainM: Math.round(gain),
    climbDensityMPerKm: Math.round(climbDensity),
    cutoffHours: cutoffHours ? round(cutoffHours, 1) : null,
    technicalLevel: technical,
    nightRunning: Boolean(race.nightRunning),
    targetWeeklyDistanceKm: round(clamp(distance * 0.65, 25, 95), 1),
    targetWeeklyVerticalM: Math.round(clamp(gain * 0.40, 500, 4500)),
    targetLongRunKm: round(clamp(distance * 0.55, 16, 55), 1),
    targetLongRunMinutes: Math.round(clamp((cutoffHours || distance / 6) * 60 * 0.45, 120, 420)),
    fuelingTargetGPerHour: distance >= 50 ? 65 : distance >= 30 ? 55 : 45,
    downhillDemand: gain >= 2500 || technical >= 4 ? 'high' : gain >= 1200 ? 'moderate' : 'general',
    hikingDemand: climbDensity >= 55 || distance >= 50 ? 'high' : 'moderate'
  };
}

export function buildCapabilityEvidence(activities = [], endDateKey = localDateKey()) {
  const foot = activities.filter(isFootActivity);
  const start28 = addDays(endDateKey, -27);
  const start56 = addDays(endDateKey, -55);
  const recent28 = foot.filter(item => item.date >= start28 && item.date <= endDateKey);
  const recent56 = foot.filter(item => item.date >= start56 && item.date <= endDateKey);
  const weeks = [];
  for (let offset = 3; offset >= 0; offset -= 1) {
    const end = addDays(endDateKey, -(offset * 7));
    const start = addDays(end, -6);
    const rows = recent28.filter(item => item.date >= start && item.date <= end);
    weeks.push({
      start,
      end,
      distanceKm: round(sum(rows.map(item => item.distanceKm)), 1),
      verticalM: Math.round(sum(rows.map(item => item.elevationGainM))),
      durationMin: Math.round(sum(rows.map(durationMin))),
      sessions: rows.length,
      activeDays: new Set(rows.map(item => item.date)).size,
      load: Math.round(sum(rows.map(item => calculateSessionLoad(item).totalLoad)))
    });
  }
  const longCandidates = recent56.filter(item => durationMin(item) >= 90 || Number(item.distanceKm) >= 14);
  const longest = longCandidates.sort((a,b) => durationMin(b) - durationMin(a))[0] || null;
  const activeWeeks = weeks.filter(item => item.sessions > 0).length;
  const confidence = Math.round(clamp(activeWeeks * 18 + Math.min(28, recent56.length * 2), 0, 100));
  return {
    observedDays: 56,
    confidence,
    activeWeeks,
    recentSessions: recent28.length,
    averageWeeklyDistanceKm: round(average(weeks.map(item => item.distanceKm)), 1),
    averageWeeklyVerticalM: Math.round(average(weeks.map(item => item.verticalM))),
    averageActiveDays: round(average(weeks.map(item => item.activeDays)), 1),
    currentWeekDistanceKm: weeks.at(-1)?.distanceKm || 0,
    currentWeekVerticalM: weeks.at(-1)?.verticalM || 0,
    longestDistanceKm: round(Number(longest?.distanceKm) || 0, 1),
    longestDurationMin: Math.round(durationMin(longest || {})),
    longestVerticalM: Math.round(Number(longest?.elevationGainM) || 0),
    trailSessions: recent56.filter(item => /trail|hike|mountain/i.test(`${item.type || ''} ${item.terrain || ''} ${item.name || ''}`)).length,
    nightSessions: recent56.filter(item => item.isNight).length,
    weeks
  };
}

export function buildCapabilityGaps({ race, demands, evidence, daysRemaining, usableWeeks }) {
  const raw = [
    gap('weekly_volume', evidence.averageWeeklyDistanceKm, demands.targetWeeklyDistanceKm, 'km/week', 1.0),
    gap('vertical_capacity', evidence.averageWeeklyVerticalM, demands.targetWeeklyVerticalM, 'm/week', 1.1),
    gap('long_run_endurance', Math.max(evidence.longestDistanceKm, evidence.longestDurationMin / 10), Math.max(demands.targetLongRunKm, demands.targetLongRunMinutes / 10), 'evidence index', 1.25),
    gap('training_consistency', evidence.averageActiveDays, race.distanceKm >= 50 ? 4.5 : 3.5, 'days/week', .85),
    gap('terrain_specificity', evidence.trailSessions, race.technicalLevel >= 4 ? 8 : 4, 'sessions/8w', .8),
    gap('night_exposure', evidence.nightSessions, race.nightRunning ? 2 : 0, 'sessions/8w', .55)
  ].filter(item => item.target > 0);

  return raw.map(item => {
    const weeksNeeded = estimateWeeksNeeded(item);
    const feasibility = item.severity === 'none' ? 'maintain'
      : usableWeeks >= weeksNeeded + 2 ? 'buildable'
      : usableWeeks >= Math.max(2, Math.ceil(weeksNeeded * .55)) ? 'partial'
      : daysRemaining <= 21 ? 'race_strategy'
      : 'unsafe_to_chase';
    return { ...item, weeksNeeded, feasibility };
  }).sort((a,b) => b.priorityScore - a.priorityScore);
}

export function buildDynamicBlock({ race, daysRemaining, usableWeeks, gaps, evidence, objective }) {
  const primary = gaps.find(item => ['buildable','partial'].includes(item.feasibility) && item.severity !== 'none') || gaps[0] || null;
  const taperDays = minimumTaperDays(race);
  const durationWeeks = daysRemaining <= taperDays ? 1 : clamp(Math.min(6, usableWeeks || 1), 1, 6);
  const horizon = horizonBand(daysRemaining);
  const focus = daysRemaining <= taperDays ? 'freshness_and_execution'
    : daysRemaining <= 42 ? 'race_specific_and_risk_control'
    : primary?.code || 'consistency';
  const loadEnvelope = loadEnvelopeFor({ horizon, evidence, objective });
  return {
    id: `${race.id || 'race'}:${horizon}:${focus}`,
    horizon,
    durationWeeks,
    focus,
    titleTh: blockTitle(focus, 'th'),
    titleEn: blockTitle(focus, 'en'),
    objective,
    loadEnvelope,
    keySessionLimit: daysRemaining <= 14 ? 1 : 2,
    minimumRecoveryDays: daysRemaining <= 14 ? 2 : 1,
    exitCriteria: buildExitCriteria(primary, focus),
    replanTriggers: [
      'pain_hard_stop',
      'missed_key_sessions',
      'load_spike_over_25pct',
      'race_date_changed',
      'availability_changed'
    ]
  };
}

export function buildDailyMission({ race, daysRemaining, block, gaps, today, unified, trailCoach, week, evidence }) {
  const session = today?.plan?.todaySession || null;
  const type = sessionType(session);
  const prescription = trailCoach?.prescription || {};
  const hardStop = Boolean(prescription.hardStop || today?.readiness?.pain?.hardStop);
  const action = String(prescription.actionCode || 'follow_plan');
  const primaryGap = gaps.find(item => item.severity !== 'none') || null;
  const phaseMeaning = daysRemaining <= minimumTaperDays(race)
    ? 'arrive_fresh'
    : block.focus;
  const missionCode = hardStop ? 'protect_health'
    : ['rest_assess','replace_easy_or_rest'].includes(action) ? 'protect_recovery'
    : type === 'Rest' || !type ? 'absorb_training'
    : ['Long','B2B','Night'].includes(type) ? 'build_specific_endurance'
    : ['Hill','Tempo','Intervals','Interval'].includes(type) ? 'build_quality_without_excess'
    : type === 'Strength' ? 'build_durability'
    : 'build_consistency';
  const challenge = chooseChallenge({ missionCode, type, daysRemaining, evidence, week, action });
  return {
    code: missionCode,
    titleTh: missionTitle(missionCode, 'th'),
    titleEn: missionTitle(missionCode, 'en'),
    workout: {
      type: type || 'Rest',
      title: sessionTitle(session),
      distanceKm: finite(prescription.suggestedDistanceKm) ? Number(prescription.suggestedDistanceKm) : Number(session?.km) || null,
      verticalM: finite(prescription.suggestedVerticalM) ? Number(prescription.suggestedVerticalM) : Number(session?.vert) || null,
      actionCode: action,
      hardStop
    },
    successCriteria: successCriteria({ missionCode, type, action, daysRemaining }),
    challenge,
    whyItMattersTh: whyItMatters({ race, daysRemaining, block, primaryGap, phaseMeaning, language: 'th' }),
    whyItMattersEn: whyItMatters({ race, daysRemaining, block, primaryGap, phaseMeaning, language: 'en' }),
    impactTomorrowTh: impactTomorrow({ missionCode, language: 'th' }),
    impactTomorrowEn: impactTomorrow({ missionCode, language: 'en' }),
    coachMessageTh: coachMessage({ missionCode, daysRemaining, language: 'th' }),
    coachMessageEn: coachMessage({ missionCode, daysRemaining, language: 'en' }),
    stopConditions: hardStop ? ['follow_safety_lock'] : ['pain_changes_movement','unusual_dizziness','illness_symptoms'],
    evidenceCodes: [
      `days_remaining:${daysRemaining}`,
      `block:${block.focus}`,
      `local_action:${action}`,
      `primary_gap:${primaryGap?.code || 'none'}`,
      `readiness:${unified?.readiness?.status || 'unknown'}`
    ]
  };
}

export function compactHorizonForAi(model = {}, language = 'th') {
  if (!model?.race) return { available: false };
  const en = language === 'en';
  return {
    available: true,
    race: model.race,
    daysRemaining: model.daysRemaining,
    usableWeeks: model.usableWeeks,
    horizon: model.horizon,
    objective: model.objective,
    block: {
      focus: model.block.focus,
      title: en ? model.block.titleEn : model.block.titleTh,
      durationWeeks: model.block.durationWeeks,
      loadEnvelope: model.block.loadEnvelope
    },
    topGaps: model.gaps.slice(0, 4).map(item => ({
      code: item.code,
      severity: item.severity,
      feasibility: item.feasibility,
      current: item.current,
      target: item.target
    })),
    mission: {
      code: model.mission.code,
      title: en ? model.mission.titleEn : model.mission.titleTh,
      successCriteria: model.mission.successCriteria,
      challenge: en ? model.mission.challenge.en : model.mission.challenge.th,
      whyItMatters: en ? model.mission.whyItMattersEn : model.mission.whyItMattersTh,
      impactTomorrow: en ? model.mission.impactTomorrowEn : model.mission.impactTomorrowTh,
      coachMessage: en ? model.mission.coachMessageEn : model.mission.coachMessageTh
    },
    confidence: model.confidence
  };
}

function resolveObjective({ race, gaps, daysRemaining, evidence }) {
  const requested = race.goalType || race.objective || 'finish';
  const severeUnsafe = gaps.filter(item => ['unsafe_to_chase','race_strategy'].includes(item.feasibility) && item.severity === 'high').length;
  if (daysRemaining <= 35 && severeUnsafe >= 2) return 'safe_completion';
  if (evidence.confidence < 30) return 'build_evidence';
  return requested === 'performance' ? 'performance' : requested === 'time' ? 'time_goal' : 'finish_strong';
}

function gap(code, current, target, unit, weight) {
  const ratio = target > 0 ? Number(current || 0) / target : 1;
  const severity = ratio >= .9 ? 'none' : ratio >= .7 ? 'low' : ratio >= .45 ? 'moderate' : 'high';
  const priorityScore = Math.round((1 - clamp(ratio,0,1)) * 100 * weight);
  return { code, current: round(current,1), target: round(target,1), unit, ratio: round(ratio,2), severity, priorityScore };
}
function estimateWeeksNeeded(item) { return item.severity === 'high' ? 10 : item.severity === 'moderate' ? 6 : item.severity === 'low' ? 3 : 0; }
function minimumTaperDays(race) { return Number(race.distanceKm) >= 80 ? 18 : Number(race.distanceKm) >= 50 ? 14 : 10; }
function horizonBand(days) { return days <= 7 ? 'race_week' : days <= 21 ? 'taper' : days <= 56 ? 'specific' : days <= 112 ? 'build' : 'foundation'; }
function loadEnvelopeFor({ horizon, evidence, objective }) {
  const base = Math.max(15, Number(evidence.averageWeeklyDistanceKm) || 0);
  const maxIncreasePct = horizon === 'foundation' ? 12 : horizon === 'build' ? 10 : horizon === 'specific' ? 7 : 0;
  return { maxIncreasePct, weeklyDistanceCeilingKm: round(base * (1 + maxIncreasePct/100),1), intensitySessionsMax: horizon === 'race_week' ? 0 : objective === 'safe_completion' ? 1 : 2 };
}
function buildExitCriteria(primary, focus) { return primary ? [`${primary.code}_ratio_at_least_0.70`,'no_pain_hard_stop','plan_adherence_at_least_0.75'] : [`${focus}_maintained`,'no_pain_hard_stop']; }
function blockTitle(focus, language) {
  const map={freshness_and_execution:['ความสดและแผนวันแข่ง','Freshness & race execution'],race_specific_and_risk_control:['ความจำเพาะสนามและคุมความเสี่ยง','Race specificity & risk control'],weekly_volume:['สร้างความทนทานรายสัปดาห์','Build weekly endurance'],vertical_capacity:['สร้าง Vertical Capacity','Build vertical capacity'],long_run_endurance:['สร้าง Long-run Endurance','Build long-run endurance'],training_consistency:['สร้างความต่อเนื่อง','Build consistency'],terrain_specificity:['สร้างความคุ้นเคยกับสนาม','Build terrain specificity'],night_exposure:['เตรียมการวิ่งกลางคืน','Build night-running readiness'],consistency:['รักษาความต่อเนื่อง','Maintain consistency']};
  return (map[focus]||map.consistency)[language==='en'?1:0];
}
function missionTitle(code, language) {
  const map={protect_health:['ปกป้องร่างกายก่อนแผน','Protect health before the plan'],protect_recovery:['ลดความล้าเพื่อรักษาความต่อเนื่อง','Protect recovery and continuity'],absorb_training:['ให้ร่างกายเปลี่ยนการซ้อมเป็นความสามารถ','Absorb training and adapt'],build_specific_endurance:['สร้าง Endurance ที่ใช้ได้ในสนามจริง','Build race-specific endurance'],build_quality_without_excess:['สร้างคุณภาพโดยไม่เผาผลาญสัปดาห์','Build quality without wasting the week'],build_durability:['สร้างความทนทานของขาและลำตัว','Build durability'],build_consistency:['สะสมงานที่ทำซ้ำได้','Bank repeatable work']};
  return (map[code]||map.build_consistency)[language==='en'?1:0];
}
function chooseChallenge({ missionCode, type, daysRemaining, evidence, week, action }) {
  if (missionCode==='protect_health') return {id:'honest_stop',th:'Challenge วันนี้คือหยุดให้เร็วพอ ก่อนอาการบังคับให้หยุด',en:'Today’s challenge is to stop early enough that symptoms never have to stop you.'};
  if (missionCode==='protect_recovery') return {id:'no_compensation',th:'ห้ามชดเชย Session ที่ลดลงด้วยการเพิ่มอย่างอื่น',en:'Do not compensate for a reduced session by adding something else.'};
  if (type==='Long' || type==='B2B') return {id:'fuel_before_hunger',th:'รับพลังงานตามแผนก่อนหิว และเริ่มช้ากว่าความรู้สึกอยากวิ่ง',en:'Fuel before hunger and start slower than your impulse.'};
  if (['Hill','Tempo','Intervals','Interval'].includes(type)) return {id:'last_rep_control',th:'Rep สุดท้ายต้องยังควบคุม Form ได้ ไม่ใช่แค่เอาตัวรอด',en:'The final rep must still look controlled, not merely survived.'};
  if (type==='Easy') return {id:'pace_blind',th:'30 นาทีแรกไม่ดู Pace ใช้ลมหายใจและ RPE คุมแทน',en:'Do not check pace for the first 30 minutes; use breathing and RPE.'};
  if (daysRemaining<=14) return {id:'discipline_taper',th:'ความสำเร็จคือไม่เปลี่ยนวันนี้ให้เป็น Workout เพิ่ม',en:'Success is refusing to turn today into an extra workout.'};
  if ((week?.completionPct||0)<70) return {id:'show_up',th:'เริ่มให้ได้ 10 นาที แล้วค่อยตัดสินใจต่อจากข้อมูลจริง',en:'Start for 10 minutes, then decide from real feedback.'};
  return {id:'finish_fresh',th:'จบ Session โดยรู้สึกว่ายังทำต่อได้อีกเล็กน้อย',en:'Finish feeling you could have done a little more.'};
}
function successCriteria({ missionCode, type, action, daysRemaining }) {
  if (missionCode==='protect_health') return ['no_training_escalation','symptoms_do_not_worsen','complete_checkin_or_assessment'];
  if (missionCode==='protect_recovery') return ['rpe_at_or_below_3','no_extra_distance','finish_fresher_than_started'];
  if (type==='Long'||type==='B2B') return ['start_controlled','fuel_on_schedule','no_late_form_collapse'];
  if (['Hill','Tempo','Intervals','Interval'].includes(type)) return ['quality_without_failure','form_remains_stable','no_unplanned_extra_reps'];
  if (type==='Strength') return ['controlled_reps','stop_before_form_breaks','complete_planned_sets_only'];
  if (daysRemaining<=10) return ['preserve_freshness','no_new_stimulus','finish_confident'];
  return ['rpe_3_to_4','no_unplanned_intensity','finish_with_reserve'];
}
function whyItMatters({ race, daysRemaining, block, primaryGap, language }) {
  if (language==='en') return `${daysRemaining} days remain to ${race.name}. Today supports ${block.titleEn.toLowerCase()}${primaryGap ? ` and addresses ${primaryGap.code.replaceAll('_',' ')}` : ''}.`;
  return `เหลือ ${daysRemaining} วันถึง ${race.name} วันนี้เชื่อมกับช่วง “${block.titleTh}”${primaryGap ? ` และ Gap หลักคือ ${primaryGap.code.replaceAll('_',' ')}` : ''}`;
}
function impactTomorrow({ missionCode, language }) {
  const hard=['protect_health','protect_recovery'].includes(missionCode);
  return language==='en' ? (hard?'This protects tomorrow’s options instead of borrowing from them.':'A controlled finish preserves the next planned adaptation.') : (hard?'วันนี้รักษาทางเลือกของพรุ่งนี้ แทนการยืมพลังจากพรุ่งนี้มาใช้':'การจบแบบคุมได้ช่วยให้พรุ่งนี้ยังสร้าง Adaptation ตามแผน');
}
function coachMessage({ missionCode, daysRemaining, language }) {
  if (language==='en') {
    if (missionCode==='protect_recovery') return 'Restraint is training when the future matters more than today’s ego.';
    if (daysRemaining<=14) return 'Fitness is already built; now arrive with it intact.';
    return 'Do the work your future race can actually use.';
  }
  if (missionCode==='protect_recovery') return 'การยับยั้งใจคือการซ้อม เมื่ออนาคตสำคัญกว่าอีโก้ของวันนี้';
  if (daysRemaining<=14) return 'Fitness สร้างมาแล้ว หน้าที่ตอนนี้คือพามันไปถึงเส้นสตาร์ตให้ครบ';
  return 'ทำงานที่ตัวคุณในวันแข่งนำไปใช้ได้จริง';
}
function compactRace(race){return {id:race.id,name:race.name,date:race.date,distanceKm:Number(race.distanceKm)||0,elevationGainM:Number(race.elevationGainM)||0,cutoffMinutes:Number(race.cutoffMinutes)||0,priority:race.priority||'A',goalType:race.goalType||'finish'};}
function emptyModel(reasonCode){return {version:RACE_HORIZON_VERSION,race:null,daysRemaining:null,usableWeeks:0,horizon:'none',objective:'select_race',demands:{},evidence:{confidence:0},gaps:[],block:{},mission:{},confidence:0,reasonCode,evaluatedAt:new Date().toISOString()};}
function isFootActivity(item={}){return /run|trail|hike|walk/i.test(`${item.type||''} ${item.terrain||''} ${item.name||''}`);}
function durationMin(item={}){if(finite(item.durationMin)) return Number(item.durationMin);if(finite(item.movingTimeSec)) return Number(item.movingTimeSec)/60;if(finite(item.durationSec)) return Number(item.durationSec)/60;return 0;}
function sessionType(session={}){return String(session?.t||session?.type||'').trim();}
function sessionTitle(session={}){const value=session?.title||session?.name||session?.t||session?.type||'Rest';if(typeof value==='string')return value;return value?.th||value?.en||'Rest';}
function round(value,digits=0){const factor=10**digits;return Math.round((Number(value)||0)*factor)/factor;}
