import { selectRaceCountdown, selectToday, selectWeekSummary, selectScoreHistory } from '../core/selectors.js';
import { selectAppleHealthInsights } from '../core/health-insights.js';
import { buildUnifiedInsights } from '../core/unified-insights.js';
import { buildPersonalTrends } from '../core/personal-trends.js';
import { buildTrailCoachIntelligence } from '../core/trail-coach.js';
import { buildRaceHorizonCoach } from '../core/race-horizon-coach.js';
import { energyBalanceForDate, nutritionTarget } from '../core/nutrition.js';
import { pageHeader, escapeHtml, formatNumber } from './components.js';

export function renderRaceRoadmap(container, state, app) {
  const en = app.language === 'en';
  const today = selectToday(state);
  const countdown = selectRaceCountdown(state);
  const week = selectWeekSummary(state, today.plan.weekSessions);
  const health = selectAppleHealthInsights(state, today.dateKey, 90);
  const scoreHistory = selectScoreHistory(state, 7, today.dateKey);
  const nutritionBalance = energyBalanceForDate(state, today.dateKey);
  const nutritionPlan = nutritionTarget(state, today.dateKey);
  const unified = buildUnifiedInsights({ today, health, scoreHistory, nutritionBalance, nutritionTarget: nutritionPlan });
  const personalTrends = buildPersonalTrends({ healthRows: health.rows, activities: state.activities, endDateKey: today.dateKey, rangeDays: 90, sleepTargetHours: 7.5 });
  const trailCoach = buildTrailCoachIntelligence({ state, today, unified, personalTrends, week, countdown, endDateKey: today.dateKey });
  const model = buildRaceHorizonCoach({ state, today, unified, trailCoach, week, endDateKey: today.dateKey });

  if (!model.race) {
    container.innerHTML = `${pageHeader(en?'Race Roadmap':'เส้นทางสู่สนาม','', 'ADAPTIVE RACE HORIZON')}<section class="card empty"><p>${en?'Select a target race first.':'เลือกสนามเป้าหมายก่อน'}</p><a class="button primary" href="#/races">${en?'Choose race':'เลือกสนาม'}</a></section>`;
    return;
  }

  container.innerHTML = `
    ${pageHeader(en?'Race Roadmap':'เส้นทางสู่สนาม', `${escapeHtml(model.race.name)} · ${model.daysRemaining} ${en?'days remaining':'วันคงเหลือ'}`, 'ADAPTIVE RACE HORIZON')}
    <section class="card horizon-hero">
      <div><span class="eyebrow">${escapeHtml(model.horizon.toUpperCase())}</span><h2>${escapeHtml(en?model.block.titleEn:model.block.titleTh)}</h2><p>${escapeHtml(objectiveLabel(model.objective,en))}</p></div>
      <div class="horizon-count"><strong>${model.daysRemaining}</strong><span>${en?'days':'วัน'}</span></div>
    </section>
    <section class="section"><div class="section-head"><h2>${en?'Capability gaps':'Capability Gap'}</h2><span>${en?'What can still change safely':'สิ่งที่ยังพัฒนาได้อย่างปลอดภัย'}</span></div><div class="horizon-gap-grid">${model.gaps.map(item=>gapCard(item,en)).join('')}</div></section>
    <section class="section"><div class="section-head"><h2>${en?'Current block':'Block ปัจจุบัน'}</h2><span>${model.block.durationWeeks} ${en?'weeks':'สัปดาห์'}</span></div><article class="card flat"><div class="grid three"><div><div class="card-title">${en?'Focus':'Focus'}</div><strong>${escapeHtml(en?model.block.titleEn:model.block.titleTh)}</strong></div><div><div class="card-title">${en?'Weekly ceiling':'เพดานรายสัปดาห์'}</div><strong>${formatNumber(model.block.loadEnvelope.weeklyDistanceCeilingKm,1)} km</strong></div><div><div class="card-title">${en?'Intensity max':'จำนวน Session หนักสูงสุด'}</div><strong>${model.block.loadEnvelope.intensitySessionsMax}</strong></div></div></article></section>
    <section class="section"><div class="section-head"><h2>${en?'Today’s mission':'Mission วันนี้'}</h2><a href="#/today">${en?'Open Today':'เปิด Today'}</a></div><article class="card mission-detail"><h3>${escapeHtml(en?model.mission.titleEn:model.mission.titleTh)}</h3><p>${escapeHtml(en?model.mission.whyItMattersEn:model.mission.whyItMattersTh)}</p><div class="callout"><strong>${en?'Challenge':'Challenge'}</strong><br>${escapeHtml(en?model.mission.challenge.en:model.mission.challenge.th)}</div><blockquote>“${escapeHtml(en?model.mission.coachMessageEn:model.mission.coachMessageTh)}”</blockquote></article></section>
    <section class="section"><div class="section-head"><h2>${en?'Evidence':'หลักฐานที่ใช้'}</h2><span>${model.confidence}% ${en?'confidence':'ความเชื่อมั่น'}</span></div><div class="grid three">${evidenceCard(en?'Avg weekly distance':'ระยะเฉลี่ย/สัปดาห์',`${formatNumber(model.evidence.averageWeeklyDistanceKm,1)} km`)}${evidenceCard(en?'Avg weekly vertical':'Vertical เฉลี่ย/สัปดาห์',`+${formatNumber(model.evidence.averageWeeklyVerticalM)} m`)}${evidenceCard(en?'Longest recent session':'Long session ล่าสุด',`${formatNumber(model.evidence.longestDistanceKm,1)} km · ${formatNumber(model.evidence.longestDurationMin)} min`)}</div></section>`;
}

function gapCard(item,en){const labels={weekly_volume:['Weekly volume','ระยะรายสัปดาห์'],vertical_capacity:['Vertical capacity','Vertical Capacity'],long_run_endurance:['Long-run endurance','Long-run Endurance'],training_consistency:['Consistency','ความต่อเนื่อง'],terrain_specificity:['Terrain specificity','ความจำเพาะสนาม'],night_exposure:['Night exposure','ประสบการณ์กลางคืน']};const l=labels[item.code]||[item.code,item.code];return `<article class="card horizon-gap ${item.severity}"><div class="section-head"><strong>${escapeHtml(en?l[0]:l[1])}</strong><span class="tag">${escapeHtml(feasibility(item.feasibility,en))}</span></div><div class="metric compact">${formatNumber(item.current,1)}<small>/ ${formatNumber(item.target,1)} ${escapeHtml(item.unit)}</small></div><div class="progress"><span style="width:${Math.min(100,Math.max(0,item.ratio*100))}%"></span></div></article>`;}
function evidenceCard(label,value){return `<article class="card flat"><div class="card-title">${escapeHtml(label)}</div><div class="metric compact">${escapeHtml(value)}</div></article>`;}
function feasibility(value,en){const map={buildable:[en?'Buildable':'สร้างทัน'],partial:[en?'Partial':'สร้างได้บางส่วน'],maintain:[en?'Maintain':'รักษา'],race_strategy:[en?'Race strategy':'ชดเชยด้วย Race Strategy'],unsafe_to_chase:[en?'Do not chase':'ไม่ควรเร่ง']};return (map[value]||[value,value])[en?0:1];}
function objectiveLabel(value,en){const map={performance:[en?'Performance target':'เป้าหมาย Performance'],time_goal:[en?'Time target':'เป้าหมายเวลา'],finish_strong:[en?'Finish strong':'จบอย่างแข็งแรง'],safe_completion:[en?'Safe completion strategy':'กลยุทธ์จบอย่างปลอดภัย'],build_evidence:[en?'Build reliable evidence first':'สร้างข้อมูลที่น่าเชื่อถือก่อน']};return (map[value]||[value,value])[en?0:1];}
