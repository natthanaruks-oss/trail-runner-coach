import { buildRaceHorizonCoach } from '../core/race-horizon-coach.js';
import { escapeHtml } from './components.js';

export function renderRaceMissionCard({ state, today, unified, trailCoach, week, en=false }) {
  const model = buildRaceHorizonCoach({ state, today, unified, trailCoach, week, endDateKey: today?.dateKey });
  if (!model.race) return '';
  const mission = model.mission;
  return `<section class="race-mission-card" data-race-mission-v4><div class="race-mission-top"><div><span class="eyebrow">${model.daysRemaining} ${en?'DAYS TO RACE':'วันถึงสนาม'} · ${escapeHtml(model.horizon.toUpperCase())}</span><h2>${escapeHtml(en?mission.titleEn:mission.titleTh)}</h2></div><a href="#/roadmap">${en?'Roadmap':'Roadmap'}</a></div><p>${escapeHtml(en?mission.whyItMattersEn:mission.whyItMattersTh)}</p><div class="mission-challenge"><strong>${en?'TODAY’S CHALLENGE':'CHALLENGE วันนี้'}</strong><span>${escapeHtml(en?mission.challenge.en:mission.challenge.th)}</span></div><blockquote>“${escapeHtml(en?mission.coachMessageEn:mission.coachMessageTh)}”</blockquote><div class="mission-actions"><a class="button secondary" href="#/plan">${en?'Open plan':'เปิดแผน'}</a><a class="button secondary" href="#/ai-coach">${en?'Ask coach':'ถาม Coach'}</a></div></section>`;
}
