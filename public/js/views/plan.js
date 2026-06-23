import { flattenPlan } from '../core/plan.js';
import { getActivePlan, getActiveRace, raceSummary } from '../core/races.js';
import { localDateKey, formatThaiDate } from '../core/date.js';
import { pageHeader, escapeHtml, formatNumber, emptyState } from './components.js';

export function renderPlan(container, state, app) {
  const plan = getActivePlan(state);
  const race = getActiveRace(state);
  if (!plan) {
    container.innerHTML = `${pageHeader('แผนซ้อม', 'Training plan เป็นข้อมูลแยกจาก Race profile', 'Multi-race architecture')}${emptyState('สนามนี้ยังไม่มีแผนซ้อม')}<div class="button-row" style="margin-top:14px"><button class="button primary" data-action="races">จัดการสนามและสร้างแผน</button></div>`;
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
  const completed = new Map(state.workouts.map(item => [item.planSessionId, item]));
  const totalKm = weekSessions.reduce((sum, item) => sum + (Number(item.km) || 0), 0);
  const totalVert = weekSessions.reduce((sum, item) => sum + (Number(item.vert) || 0), 0);

  container.innerHTML = `
    ${pageHeader('แผนซ้อม', escapeHtml(plan.name), race ? escapeHtml(raceSummary(race)) : 'Adaptive trail training')}
    <div class="week-tabs" role="tablist">
      ${plan.weeks.map((item, index) => `<button data-week="${index}" class="${index === app.ui.planWeek ? 'active' : ''}">${escapeHtml(item.id.toUpperCase())}</button>`).join('')}
    </div>
    <section class="card flat" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-start">
        <div><div class="eyebrow">${escapeHtml(week.phase)}</div><h2 style="margin:5px 0 4px">${escapeHtml(week.label?.th || week.id)}</h2><div style="color:var(--muted);font-size:11px">${formatThaiDate(weekSessions[0].date,{short:true})} – ${formatThaiDate(weekSessions[6].date,{short:true})}</div></div>
        <div style="text-align:right"><div class="metric" style="font-size:23px">${formatNumber(totalKm,1)}<small>km</small></div><div class="submetric">+${formatNumber(totalVert)} m</div></div>
      </div>
    </section>
    <div class="list">
      ${weekSessions.map(session => {
        const workout = completed.get(session.id);
        const isToday = session.date === todayKey;
        const isRest = ['Rest','Rehab'].includes(session.t) && Number(session.km) === 0;
        return `<button class="card flat day-card" data-session-id="${session.id}" style="width:100%;text-align:left;color:inherit;cursor:pointer;${isToday ? 'border-color:var(--mint)' : ''}">
          <div class="day-date"><small>${escapeHtml(session.day)}</small><strong>${session.date.slice(-2)}</strong></div>
          <div><div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap"><strong>${escapeHtml(session.title?.th || session.t)}</strong>${isToday ? '<span class="tag">วันนี้</span>' : ''}${workout?.status === 'completed' ? '<span class="tag done">ทำแล้ว</span>' : isRest ? '<span class="tag rest">Recovery</span>' : ''}</div><small style="color:var(--muted)">${escapeHtml(session.t)}${session.note?.th ? ` · ${escapeHtml(session.note.th)}` : ''}</small></div>
          <div style="text-align:right"><strong>${session.km ? `${formatNumber(session.km,1)} km` : '—'}</strong><small style="display:block;color:var(--muted);margin-top:3px">${session.vert ? `+${formatNumber(session.vert)} m` : ''}</small></div>
        </button>`;
      }).join('')}
    </div>
    <div class="callout" style="margin-top:14px">แผนเป็น baseline ไม่ใช่คำสั่งตายตัว Readiness, Pain และภาระชีวิตมีสิทธิ์ลดโหลดได้ โดยไม่ถือว่าล้มเหลว</div>
  `;

  container.querySelectorAll('[data-week]').forEach(button => button.addEventListener('click', () => {
    app.ui.planWeek = Number(button.dataset.week); app.render();
  }));
  container.querySelectorAll('[data-session-id]').forEach(button => button.addEventListener('click', () => {
    const session = sessions.find(item => item.id === button.dataset.sessionId);
    app.openWorkoutModal(session);
  }));
}
