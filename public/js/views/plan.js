import { flattenPlan } from '../core/plan.js';
import { getActivePlan, getActiveRace, raceSummary } from '../core/races.js';
import { localDateKey, formatThaiDate } from '../core/date.js';
import { reconcilePlanWorkouts, isWorkoutCompleted } from '../core/plan-reconciliation.js';
import { pageHeader, escapeHtml, formatNumber, emptyState } from './components.js';

export function renderPlan(container, state, app) {
  const plan = getActivePlan(state);
  const race = getActiveRace(state);
  const en = app.language === 'en';
  if (!plan) {
    container.innerHTML = `${pageHeader(en ? 'Training Plan' : 'แผนซ้อม', en ? 'Training plans are stored separately from race profiles' : 'Training plan เป็นข้อมูลแยกจาก Race profile', 'Multi-race architecture')}${emptyState(en ? 'No training plan for this race yet' : 'สนามนี้ยังไม่มีแผนซ้อม')}<div class="button-row" style="margin-top:14px"><button class="button primary" data-action="races">${en ? 'Manage races and plans' : 'จัดการสนามและสร้างแผน'}</button></div>`;
    container.querySelector('[data-action="races"]')?.addEventListener('click', () => app.navigate('races'));
    return;
  }

  const sessions = flattenPlan(plan);
  const todayKey = localDateKey();
  const todaySession = sessions.find(session => session.date === todayKey);
  const currentWeekIndex = todaySession?.weekIndex ?? 0;
  const selectedWeek = Number(app.ui.planWeek ?? currentWeekIndex);
  app.ui.planWeek = Math.max(0, Math.min(plan.weeks.length - 1, selectedWeek));
  const week = plan.weeks[app.ui.planWeek];
  const weekSessions = sessions.filter(session => session.weekIndex === app.ui.planWeek);
  const workouts = new Map(state.workouts.map(item => [item.planSessionId, item]));
  const totalKm = weekSessions.reduce((sum, item) => sum + (Number(item.km) || 0), 0);
  const totalVert = weekSessions.reduce((sum, item) => sum + (Number(item.vert) || 0), 0);
  const weekWorkouts = weekSessions.map(session => workouts.get(session.id)).filter(Boolean);
  const completedCount = weekWorkouts.filter(isWorkoutCompleted).length;
  const reviewCount = weekWorkouts.filter(item => item.status === 'needs_review').length;
  const reconciliation = state.metadata.find(item => item.id === 'plan_reconciliation_v1');

  container.innerHTML = `
    ${pageHeader(en ? 'Training Plan' : 'แผนซ้อม', escapeHtml(plan.name), race ? escapeHtml(raceSummary(race)) : 'Adaptive trail training')}
    <section class="card plan-sync-summary">
      <div class="section-head">
        <div>
          <div class="card-title">${en ? 'Plan ↔ actual reconciliation' : 'เชื่อมแผนกับการซ้อมจริง'}</div>
          <div class="submetric">${en ? 'Synced activities are matched to planned sessions by date, type, duration, distance and elevation.' : 'ระบบจับคู่กิจกรรมที่ Sync เข้ามากับแผนจากวัน ประเภท เวลา ระยะ และ Elevation'}</div>
        </div>
        <button type="button" class="button secondary compact" data-plan-reconcile>${en ? 'Match recent workouts' : 'จับคู่กิจกรรมล่าสุด'}</button>
      </div>
      <div class="grid three compact-kpi-row">
        <div><span class="card-title">${en ? 'Completed this week' : 'ทำแล้วสัปดาห์นี้'}</span><strong class="metric compact">${completedCount}</strong></div>
        <div><span class="card-title">${en ? 'Needs review' : 'รอยืนยัน'}</span><strong class="metric compact">${reviewCount}</strong></div>
        <div><span class="card-title">${en ? 'Last match' : 'จับคู่ล่าสุด'}</span><strong class="metric compact" style="font-size:16px">${reconciliation?.lastRunAt ? formatSyncTime(reconciliation.lastRunAt, en) : '—'}</strong></div>
      </div>
      <div class="wizard-status submetric" data-plan-reconcile-status>${reviewCount ? (en ? `${reviewCount} possible match(es) need confirmation.` : `มี ${reviewCount} รายการที่ควรตรวจสอบก่อนยืนยัน`) : (en ? 'High-confidence matches are completed automatically.' : 'รายการที่ความมั่นใจสูงจะถูกบันทึกว่าทำแล้วอัตโนมัติ')}</div>
    </section>
    <div class="week-tabs" role="tablist">
      ${plan.weeks.map((item, index) => `<button data-week="${index}" class="${index === app.ui.planWeek ? 'active' : ''}">${escapeHtml(item.id.toUpperCase())}</button>`).join('')}
    </div>
    <section class="card flat" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-start">
        <div><div class="eyebrow">${escapeHtml(week.phase)}</div><h2 style="margin:5px 0 4px">${escapeHtml(app.field(week, 'label') || week.id)}</h2><div style="color:var(--muted);font-size:11px">${formatThaiDate(weekSessions[0].date,{short:true})} – ${formatThaiDate(weekSessions[6].date,{short:true})}</div></div>
        <div style="text-align:right"><div class="metric" style="font-size:23px">${formatNumber(totalKm,1)}<small>km</small></div><div class="submetric">+${formatNumber(totalVert)} m</div></div>
      </div>
    </section>
    <div class="list">
      ${weekSessions.map(session => renderSessionCard(session, workouts.get(session.id), todayKey, app, en)).join('')}
    </div>
    <div class="callout" style="margin-top:14px">${en ? 'The plan is a baseline, not a rigid command. Actual training load, readiness, pain and life demands can reduce the next session without counting as failure.' : 'แผนเป็น baseline ไม่ใช่คำสั่งตายตัว ผลซ้อมจริง Readiness, Pain และภาระชีวิตมีสิทธิ์ลดโหลดของวันถัดไปได้ โดยไม่ถือว่าล้มเหลว'}</div>
  `;

  container.querySelectorAll('[data-week]').forEach(button => button.addEventListener('click', () => {
    app.ui.planWeek = Number(button.dataset.week); app.render();
  }));
  container.querySelectorAll('[data-session-id]').forEach(button => button.addEventListener('click', event => {
    if (event.target.closest('[data-ignore-session-open]')) return;
    const session = sessions.find(item => item.id === button.dataset.sessionId);
    app.openWorkoutModal(session);
  }));
  container.querySelector('[data-plan-reconcile]')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    const status = container.querySelector('[data-plan-reconcile-status]');
    button.disabled = true;
    button.textContent = en ? 'Matching…' : 'กำลังจับคู่…';
    if (status) status.textContent = en ? 'Comparing recent activities with the training plan…' : 'กำลังเปรียบเทียบกิจกรรมล่าสุดกับแผนซ้อม…';
    try {
      const result = await reconcilePlanWorkouts(app.store, { reason: 'plan_manual' });
      app.toast(en ? `${result.autoMatched} matched automatically · ${result.needsReview} need review` : `จับคู่อัตโนมัติ ${result.autoMatched} · รอยืนยัน ${result.needsReview}`);
      app.render();
    } catch (error) {
      if (status) status.textContent = error.message || (en ? 'Matching failed' : 'จับคู่ไม่สำเร็จ');
      button.disabled = false;
      button.textContent = en ? 'Match recent workouts' : 'จับคู่กิจกรรมล่าสุด';
    }
  });
}

function renderSessionCard(session, workout, todayKey, app, en) {
  const isToday = session.date === todayKey;
  const isRest = ['Rest','Rehab'].includes(session.t) && Number(session.km) === 0;
  const status = workoutStatus(workout, isRest, en);
  const actual = workout && (workout.actualDistanceKm != null || workout.durationMin != null || workout.actualElevationGainM != null)
    ? `${workout.actualDistanceKm != null ? `${formatNumber(workout.actualDistanceKm, 1)} km` : '—'} · ${workout.durationMin != null ? formatDuration(workout.durationMin, en) : '—'}${workout.actualElevationGainM != null ? ` · +${formatNumber(workout.actualElevationGainM)} m` : ''}`
    : null;
  const completion = workout?.completionPct != null ? `${Math.round(workout.completionPct)}%` : null;
  const splitTag = workout?.isSplitSession ? `<span class="tag split">${en ? `${workout.activityCount || workout.actualActivityIds?.length || 2} sessions` : `${workout.activityCount || workout.actualActivityIds?.length || 2} รอบ`}</span>` : '';
  const continuity = workout?.isSplitSession && workout?.continuousObjective
    ? `<div class="split-session-summary"><span>${en ? 'Combined volume' : 'ปริมาณรวม'} <strong>${Math.round(workout.volumeCompletionPct || workout.completionPct || 0)}%</strong></span><span>${en ? 'Continuous endurance' : 'ความต่อเนื่อง'} <strong>${Math.round(workout.continuousCompletionPct || 0)}%</strong></span></div>`
    : '';
  return `<button class="card flat day-card plan-actual-card ${workout?.status === 'needs_review' ? 'needs-review' : ''}" data-session-id="${session.id}" style="width:100%;text-align:left;color:inherit;cursor:pointer;${isToday ? 'border-color:var(--mint)' : ''}">
    <div class="day-date"><small>${escapeHtml(session.day)}</small><strong>${session.date.slice(-2)}</strong></div>
    <div class="plan-session-copy">
      <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap"><strong>${escapeHtml(app.field(session, 'title') || session.t)}</strong>${isToday ? `<span class="tag">${en ? 'Today' : 'วันนี้'}</span>` : ''}${status.tag}${splitTag}</div>
      <small style="color:var(--muted)">${escapeHtml(session.t)}${app.field(session, 'note') ? ` · ${escapeHtml(app.field(session, 'note'))}` : ''}</small>
      ${actual ? `<div class="planned-actual-inline"><span>${en ? 'Plan' : 'แผน'} ${session.km ? `${formatNumber(session.km,1)} km` : '—'}${session.vert ? ` · +${formatNumber(session.vert)} m` : ''}</span><strong>${en ? 'Actual total' : 'รวมที่ทำจริง'} ${escapeHtml(actual)}</strong>${completion ? `<em>${completion}</em>` : ''}</div>` : ''}
      ${continuity}
      ${workout?.status === 'needs_review' ? `<div class="submetric warning-text">${en ? `Possible match · ${workout.matchConfidence}% confidence · tap to confirm` : `พบกิจกรรมที่น่าจะตรงกัน · มั่นใจ ${workout.matchConfidence}% · แตะเพื่อยืนยัน`}</div>` : ''}
    </div>
    <div style="text-align:right"><strong>${session.km ? `${formatNumber(session.km,1)} km` : '—'}</strong><small style="display:block;color:var(--muted);margin-top:3px">${session.vert ? `+${formatNumber(session.vert)} m` : ''}</small></div>
  </button>`;
}

function workoutStatus(workout, isRest, en) {
  if (!workout) return { tag: isRest ? `<span class="tag rest">Recovery</span>` : '' };
  const labels = {
    completed: en ? 'Completed' : 'ทำแล้ว',
    partial: en ? 'Partial' : 'ทำบางส่วน',
    exceeded: en ? 'Above plan' : 'เกินแผน',
    modified: en ? 'Modified' : 'ปรับแผน',
    skipped: en ? 'Skipped' : 'ข้าม',
    needs_review: en ? 'Review match' : 'รอยืนยัน'
  };
  const cls = workout.status === 'completed' ? 'done' : workout.status === 'needs_review' ? 'warning' : workout.status === 'skipped' ? 'rest' : '';
  return { tag: labels[workout.status] ? `<span class="tag ${cls}">${escapeHtml(labels[workout.status])}</span>` : '' };
}

function formatDuration(minutes, en) {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  if (!hours) return `${mins} ${en ? 'min' : 'นาที'}`;
  return `${hours}h ${mins ? `${mins}m` : ''}`.trim();
}

function formatSyncTime(value, en) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(en ? 'en-GB' : 'th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}
