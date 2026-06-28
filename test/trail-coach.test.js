import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDailyTrainingPrescription,
  buildElevationAwareLoad,
  buildLongRunReadiness,
  buildRaceReadiness,
  buildTrailCoachIntelligence,
  buildWeeklyTrailProgression
} from '../public/js/core/trail-coach.js';

const activities = [
  { id:'a1', date:'2026-05-24', type:'Trail Run', terrain:'trail', durationMin:80, distanceKm:10, elevationGainM:420, elevationLossM:400, rpe:5 },
  { id:'a2', date:'2026-05-31', type:'Hike', terrain:'trail', durationMin:150, distanceKm:15, elevationGainM:850, elevationLossM:820, rpe:5 },
  { id:'a3', date:'2026-06-07', type:'Trail Run', terrain:'trail', durationMin:110, distanceKm:14, elevationGainM:720, elevationLossM:700, rpe:6 },
  { id:'a4', date:'2026-06-14', type:'Trail Run', terrain:'trail', durationMin:170, distanceKm:21, elevationGainM:1150, elevationLossM:1100, rpe:6 },
  { id:'a5', date:'2026-06-21', type:'Trail Run', terrain:'trail', durationMin:190, distanceKm:24, elevationGainM:1350, elevationLossM:1300, rpe:7 },
  { id:'a6', date:'2026-06-27', type:'Easy Run', terrain:'road', durationMin:55, distanceKm:8, elevationGainM:60, elevationLossM:60, rpe:4 },
  { id:'strength', date:'2026-06-27', type:'Strength', terrain:'strength', durationMin:45, distanceKm:0, elevationGainM:0, rpe:6 }
];

test('weekly trail progression tracks distance, vertical and load without counting strength distance', () => {
  const model = buildWeeklyTrailProgression(activities, '2026-06-28', 6);
  assert.equal(model.buckets.length, 6);
  assert.ok(model.current.distanceKm >= 8);
  assert.equal(model.current.sessions, 1);
  assert.ok(model.buckets.some(item => item.elevationGainM >= 1000));
  assert.ok(model.confidence > 50);
});

test('elevation-aware load includes climbing density and trail-equivalent distance', () => {
  const progression = buildWeeklyTrailProgression(activities, '2026-06-21', 6);
  const load = buildElevationAwareLoad(activities, '2026-06-21', 7, progression);
  assert.equal(load.sessions, 1);
  assert.equal(load.elevationGainM, 1350);
  assert.ok(load.climbDensityMPerKm > 50);
  assert.ok(load.trailEquivalentKm > load.distanceKm);
  assert.ok(load.mechanicalLoad > 0);
});

test('pain hard stop always overrides an otherwise strong daily prescription', () => {
  const result = buildDailyTrainingPrescription({
    plannedSession:{ t:'Hill', km:12, vert:700 },
    readiness:{ score:90, confidence:90 },
    recovery:{ score:88, confidence:90 },
    load:{ status:'balanced', score:85 },
    energy:{ score:82 },
    pain:{ hardStop:true, caution:false },
    checkinComplete:true,
    longRun:{ score:85, confidence:80 },
    race:{ confidence:80 },
    elevationLoad:{ status:'general' },
    freshness:{ staleRecoveryMetrics:false }
  });
  assert.equal(result.actionCode, 'rest_assess');
  assert.equal(result.distanceFactor, 0);
  assert.equal(result.verticalFactor, 0);
  assert.equal(result.hardStop, true);
});

test('long-run readiness uses recent endurance evidence and remains bounded', () => {
  const ready = buildLongRunReadiness({
    activities,
    endDateKey:'2026-06-28',
    plannedSession:{ t:'Long', km:26, vert:1400 },
    recoveryScore:78,
    loadStatus:'balanced',
    form:-6,
    pain:{ hardStop:false, caution:false },
    healthConfidence:80
  });
  const sparse = buildLongRunReadiness({
    activities:activities.slice(-1),
    endDateKey:'2026-06-28',
    plannedSession:{ t:'Long', km:26, vert:1400 },
    recoveryScore:78,
    loadStatus:'balanced',
    form:-6,
    pain:{ hardStop:false, caution:false },
    healthConfidence:80
  });
  assert.ok(ready.score >= 0 && ready.score <= 100);
  assert.ok(ready.longSessionCount >= 2);
  assert.ok(ready.score > sparse.score);
  assert.ok(ready.confidence > sparse.confidence);
});

test('race readiness exposes transparent components and gaps without promising a finish', () => {
  const progression = buildWeeklyTrailProgression(activities, '2026-06-28', 6);
  const longRun = buildLongRunReadiness({ activities, endDateKey:'2026-06-28', recoveryScore:72, loadStatus:'balanced', form:-4, healthConfidence:75 });
  const model = buildRaceReadiness({
    race:{ name:'Mountain 70K', date:'2026-10-16', distanceKm:72.5, elevationGainM:3586 },
    countdownDays:110,
    week:{ completionPct:80 },
    progression,
    longRun,
    recoveryScore:72,
    loadStatus:'balanced',
    form:-4,
    healthConfidence:75,
    planPhase:'Base'
  });
  assert.ok(model.score >= 0 && model.score <= 100);
  assert.ok(model.confidence >= 0 && model.confidence <= 100);
  assert.ok(Number.isFinite(model.components.weeklyVolume));
  assert.ok(Number.isFinite(model.components.verticalSpecificity));
  assert.ok(Array.isArray(model.gaps));
  assert.equal('finishProbability' in model, false);
});

test('trail coach intelligence is provider-neutral and lowers confidence for stale recovery inputs', () => {
  const base = {
    state:{ activities },
    today:{
      checkin:null,
      race:{ name:'Mountain 70K', date:'2026-10-16', distanceKm:72.5, elevationGainM:3586 },
      plan:{ todaySession:{ t:'Hill', km:10, vert:600 }, week:{ phase:'Build' } },
      readiness:{ pain:{ hardStop:false, caution:false } }
    },
    unified:{
      hasData:true,
      readiness:{ score:72, confidence:70 },
      pillars:{ recovery:{ score:70, confidence:70 }, load:{ status:'balanced', score:80 }, energy:{ score:65 } },
      coverage:{ confidence:70 },
      metrics:[
        { key:'sleepHours', date:'2026-06-24' },
        { key:'restingHr', date:'2026-06-24' },
        { key:'hrvMs', date:null }
      ]
    },
    personalTrends:{ load:{ form:-5 } },
    week:{ completionPct:75 },
    countdown:{ days:110, race:{ name:'Mountain 70K', date:'2026-10-16', distanceKm:72.5, elevationGainM:3586 } },
    endDateKey:'2026-06-28'
  };
  const model = buildTrailCoachIntelligence(base);
  assert.equal(model.freshness.staleRecoveryMetrics, true);
  assert.ok(model.prescription.missing.includes('subjective_checkin'));
  assert.ok(model.prescription.missing.includes('fresh_recovery_metrics'));
  assert.equal('source' in model, false);
  assert.equal(JSON.stringify(model).includes('strava'), false);
  assert.equal(JSON.stringify(model).includes('apple_health'), false);
});
