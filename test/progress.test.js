import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProgressDashboard, normalizeProgressRange, isFootActivity } from '../public/js/core/progress.js';

function stateFixture() {
  const days = [
    { t:'Easy', km:5, vert:50 }, { t:'Strength', km:0, vert:0 }, { t:'Rest', km:0, vert:0 },
    { t:'Hill', km:8, vert:500 }, { t:'Easy', km:5, vert:50 }, { t:'Long', km:15, vert:900 }, { t:'Rehab', km:0, vert:0 }
  ];
  return {
    settings: {
      athlete:{ weightKg:89, age:34, heightCm:178, sex:'male', sleepTargetHours:7.5 },
      selection:{ activeRaceId:'race-1', activePlanId:'plan-1' },
      preferences:{ nonExerciseActivityFactor:1.2 },
      nutrition:{ bmrKcal:1900, proteinTargetGPerKg:1.8, waterBaseMlPerKg:30 },
      scoring:{ calibrationEnabled:true }
    },
    raceProfiles:[{ id:'race-1', name:'Test Trail', status:'upcoming', date:'2026-10-01' }],
    trainingPlans:[{ id:'plan-1', raceId:'race-1', name:'Test Plan', status:'active', startDate:'2026-06-01', weeks:[{ id:'w1', phase:'Build', label:'Week 1', days }] }],
    activities:[
      { id:'a1', date:'2026-06-01', type:'Trail Run', terrain:'trail', durationMin:50, distanceKm:6, elevationGainM:120, elevationLossM:120, rpe:4 },
      { id:'a2', date:'2026-06-04', type:'Trail Run', terrain:'trail', durationMin:90, distanceKm:9, elevationGainM:550, elevationLossM:550, rpe:7 },
      { id:'a3', date:'2026-06-06', type:'Hike', terrain:'trail', durationMin:180, distanceKm:16, elevationGainM:950, elevationLossM:950, rpe:6 },
      { id:'a4', date:'2026-06-06', type:'Strength', terrain:'strength', durationMin:35, distanceKm:0, elevationGainM:0, rpe:5 },
      { id:'old', date:'2026-05-30', type:'Run', durationMin:40, distanceKm:5, elevationGainM:20, rpe:4 }
    ],
    workouts:[
      { planSessionId:'plan-1:w1-0', date:'2026-06-01', status:'completed' },
      { planSessionId:'plan-1:w1-3', date:'2026-06-04', status:'modified' },
      { planSessionId:'plan-1:w1-5', date:'2026-06-06', status:'completed' },
      { planSessionId:'plan-1:w1-4', date:'2026-06-05', status:'skipped' }
    ],
    checkins:[], metadata:[],
    painLogs:[
      { id:'p1', date:'2026-06-02', area:'achilles', severity:3, trend:'same', during:'morning' },
      { id:'p2', date:'2026-06-06', area:'achilles', severity:5, trend:'worse', during:'after_run' }
    ],
    foodLogs:[
      { id:'f1', date:'2026-06-01', kcal:2200, proteinG:130, carbG:260, fatG:70 },
      { id:'f2', date:'2026-06-02', kcal:1800, proteinG:110, carbG:210, fatG:55 }
    ],
    dailyFlags:[
      { date:'2026-06-01', foodComplete:true },
      { date:'2026-06-02', foodComplete:true }
    ],
    bodyComposition:[], customFoods:[], waterLogs:[], rehabLogs:[], gear:[]
  };
}

test('progress range presets and custom ranges normalize safely', () => {
  assert.deepEqual(normalizeProgressRange({ preset:7, endDate:'2026-06-07' }), {
    preset:7, startDate:'2026-06-01', endDate:'2026-06-07', days:7, bucket:'day'
  });
  const custom = normalizeProgressRange({ preset:'custom', startDate:'2026-05-01', endDate:'2026-06-07' });
  assert.equal(custom.days, 38);
  assert.equal(custom.bucket, 'week');
});

test('progress dashboard consolidates activity, plan, pain and nutrition without counting strength distance', () => {
  const result = buildProgressDashboard(stateFixture(), { preset:7, endDate:'2026-06-07' });
  assert.equal(result.current.activity.distanceKm, 31);
  assert.equal(result.current.activity.elevationGainM, 1620);
  assert.equal(result.current.activity.durationMin, 355);
  assert.equal(result.current.activity.footSessions, 3);
  assert.equal(result.current.plan.plannedSessions, 5);
  assert.equal(result.current.plan.completedSessions, 3);
  assert.equal(result.current.plan.adherencePct, 60);
  assert.equal(result.current.pain.maxSeverity, 5);
  assert.equal(result.current.pain.worstArea.area, 'achilles');
  assert.equal(result.current.energy.completeDays, 2);
  assert.equal(result.current.buckets.length, 7);
  assert.ok(result.insights.some(item => item.code === 'adherence_watch'));
  assert.ok(result.coverage.confidence >= 0 && result.coverage.confidence <= 100);
});

test('foot activity classifier excludes cycling and strength but includes trail and hiking', () => {
  assert.equal(isFootActivity({ type:'Trail Run' }), true);
  assert.equal(isFootActivity({ type:'Hike' }), true);
  assert.equal(isFootActivity({ type:'Cycling', distanceKm:30 }), false);
  assert.equal(isFootActivity({ type:'Strength', terrain:'strength' }), false);
});
