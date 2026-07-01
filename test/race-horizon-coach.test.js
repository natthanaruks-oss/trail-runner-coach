import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRaceDemandModel, buildCapabilityEvidence, buildCapabilityGaps, buildRaceHorizonCoach } from '../public/js/core/race-horizon-coach.js';

const race={id:'race-x',name:'Trail 70K',date:'2026-10-28',distanceKm:70,elevationGainM:3500,cutoffMinutes:900,technicalLevel:4,nightRunning:true,priority:'A',goalType:'finish'};
const activities=[
 {id:'a1',date:'2026-06-20',type:'Trail Run',distanceKm:24,elevationGainM:1200,durationMin:240,rpe:6},
 {id:'a2',date:'2026-06-24',type:'Easy Run',distanceKm:8,elevationGainM:100,durationMin:55,rpe:3},
 {id:'a3',date:'2026-06-27',type:'Trail Run',distanceKm:18,elevationGainM:900,durationMin:190,rpe:5},
 {id:'a4',date:'2026-06-29',type:'Easy Run',distanceKm:7,elevationGainM:80,durationMin:50,rpe:3}
];

test('race demand scales from the actual target race',()=>{const d=buildRaceDemandModel(race);assert.equal(d.distanceKm,70);assert.ok(d.targetWeeklyVerticalM>=1000);assert.equal(d.nightRunning,true);});
test('capability evidence is derived from actual activities',()=>{const e=buildCapabilityEvidence(activities,'2026-06-30');assert.equal(e.recentSessions,4);assert.equal(e.longestDistanceKm,24);assert.ok(e.averageWeeklyDistanceKm>0);});
test('short horizon marks large gaps as partial or race strategy',()=>{const demands=buildRaceDemandModel(race);const evidence=buildCapabilityEvidence([], '2026-06-30');const gaps=buildCapabilityGaps({race,demands,evidence,daysRemaining:28,usableWeeks:2});assert.ok(gaps.some(g=>['partial','race_strategy','unsafe_to_chase'].includes(g.feasibility)));});
test('daily mission connects current day to race horizon',()=>{const model=buildRaceHorizonCoach({state:{raceProfiles:[race],settings:{selection:{activeRaceId:'race-x'}},activities},today:{dateKey:'2026-06-30',race,plan:{todaySession:{t:'Easy',title:'Easy Run',km:8},week:{}}},unified:{readiness:{status:'good'},coverage:{confidence:70}},trailCoach:{prescription:{actionCode:'follow_plan',suggestedType:'Easy',suggestedDistanceKm:8},race:{confidence:65}},week:{completionPct:80},endDateKey:'2026-06-30'});assert.equal(model.race.name,'Trail 70K');assert.ok(model.daysRemaining>0);assert.ok(model.mission.challenge.th);assert.match(model.mission.whyItMattersTh,/เหลือ/);});
