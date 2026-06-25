import { selectRaceCountdown, selectToday, selectWeekSummary, selectRecentActivities } from '../core/selectors.js';
import { recommendSession } from '../engines/recommendation.js';
import { formatNumber, metricCard, pageHeader, statusBadge, escapeHtml } from './components.js';
import { formatThaiDate } from '../core/date.js';
import { raceSummary } from '../core/races.js';
import { foodTotals, nutritionTarget, dailyWaterTargetMl } from '../core/nutrition.js';
import { STORES } from '../core/constants.js';
import { nowIso } from '../core/date.js';

export function renderDashboard(container, state, app) {
  const today = selectToday(state);
  const countdown = selectRaceCountdown(state);
  const week = selectWeekSummary(state, today.plan.weekSessions);
  const session = today.plan.todaySession;
  const recommendation = recommendSession(today.readiness, session);
  const readinessStatus = today.readiness?.status || 'neutral';
  const nutrition = foodTotals(state, today.dateKey);
  const nutritionPlan = nutritionTarget(state, today.dateKey);
  const water = state.waterLogs.find(item => item.date === today.dateKey)?.amountMl || 0;
  const waterTarget = dailyWaterTargetMl(state, today.dateKey);
  const readinessLabel = today.readiness
    ? readinessStatus === 'green' ? 'พร้อมซ้อม' : readinessStatus === 'yellow' ? 'ลดโหลด' : 'พัก/ประเมินอาการ'
    : 'ยังไม่ได้ Check-in';

  container.innerHTML = `
    ${pageHeader('วันนี้', formatThaiDate(today.dateKey), today.race ? `${escapeHtml(today.race.name)} · ${escapeHtml(raceSummary(today.race))}` : 'เลือกสนามเป้าหมายเพื่อเริ่มวางแผน')}
    <section class="card hero">
      <div>
        ${statusBadge(readinessStatus, readinessLabel)}
        <h2 style="font-size:24px;margin:12px 0 6px">${escapeHtml(session ? (app.field(session, 'title') || session.t) : 'อยู่นอกช่วงแผน')}</h2>
        <div style="color:var(--muted);font-size:12px">${escapeHtml(session?.t || 'Rest')} ${session?.km ? `· ${session.km} km · +${session.vert || 0} m` : ''}</div>
        <div class="callout ${today.readiness?.status === 'red' ? 'danger' : today.readiness?.status === 'green' ? 'good' : ''}" style="margin-top:14px">
          <strong>${escapeHtml(recommendation.intensity)}</strong><br>
          ${escapeHtml(recommendation.reasons.join(' · '))}
        </div>
        <div class="button-row" style="margin-top:13px">
          <button class="button primary" data-action="checkin">${today.checkin ? 'แก้ไข Check-in' : 'Check-in ก่อนซ้อม'}</button>
          ${session ? '<button class="button secondary" data-action="record-workout">บันทึกผลจริง</button>' : ''}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Strain · Recovery · Readiness</h2><a href="#/scores">ดูเหตุผลและแนวโน้ม</a></div>
      <div class="score-ring-grid">
        ${scoreRing({ label:'STRAIN', value:today.strain.score, max:21, normalized:today.strain.normalizedScore, color:strainColor(today.strain.score), sub:`${today.strain.classification.label} · confidence ${today.strain.confidence}%` })}
        ${scoreRing({ label:'RECOVERY', value:today.recovery?.score, max:100, normalized:today.recovery?.score || 0, color:recoveryColor(today.recovery?.score), sub:today.recovery ? `${recoveryLabel(today.recovery.score)} · confidence ${today.recovery.confidence}%` : 'รอ Sleep / RHR / HRV' })}
        ${scoreRing({ label:'READINESS', value:today.readiness?.score, max:100, normalized:today.readiness?.score || 0, color:ringColor(readinessStatus), sub:today.readiness ? `${readinessLabel} · confidence ${today.readiness.confidence}%` : 'กรอก Pain / Fatigue ก่อนซ้อม' })}
      </div>
      <div class="score-explainer">
        <div><strong>Strain</strong><span>โหลดจาก Workout + Vertical + Downhill + Night + พฤติกรรมประจำวัน</span></div>
        <div><strong>Recovery</strong><span>Sleep, RHR, HRV, ความล้า และโหลด 1–3 วันก่อน</span></div>
        <div><strong>Readiness</strong><span>Recovery เทียบกับ Pain Safety Gate และแนวโน้มโหลด</span></div>
      </div>
    </section>

    <section class="grid three section">
      ${metricCard(countdown.race ? `ถึง ${escapeHtml(countdown.race.name)}` : 'วันแข่งขัน', countdown.race ? countdown.days : '—', countdown.race ? 'วัน' : '', countdown.race ? `${countdown.weeks} สัปดาห์ ${countdown.remainderDays} วัน` : 'ยังไม่มีสนามที่เลือก')}
      ${metricCard('สัปดาห์นี้', `${week.completionPct}%`, '', `${week.completedSessions}/${week.trainableSessions} sessions`)}
      ${metricCard('7-day Load', formatNumber(today.loadTrend.last7.totalLoad), '', `เทียบสัปดาห์ก่อน ${formatWeekChange(today.loadTrend.weekChangePct)}`)}
    </section>

    <section class="section">
      <div class="section-head"><h2>อาหารและน้ำวันนี้</h2><a href="#/fuel">เปิดบันทึกอาหาร</a></div>
      <div class="grid two">
        <a class="card flat tap-card" href="#/fuel">
          <div class="card-title">Calories / Protein</div>
          <div class="metric">${formatNumber(nutrition.kcal)}<small>/ ${formatNumber(nutritionPlan.kcal)} kcal</small></div>
          <div class="submetric">Protein ${formatNumber(nutrition.proteinG,1)} / ${nutritionPlan.proteinG} g · Carb ${formatNumber(nutrition.carbG,1)} g</div>
          <div class="progress" style="margin-top:12px"><span style="width:${Math.min(100,nutrition.kcal/Math.max(1,nutritionPlan.kcal)*100)}%;background:var(--mint)"></span></div>
        </a>
        <article class="card flat">
          <div class="section-head"><div class="card-title">น้ำดื่ม</div><span>${formatNumber(water)} / ${formatNumber(waterTarget)} ml</span></div>
          <div class="progress"><span style="width:${Math.min(100,water/Math.max(1,waterTarget)*100)}%;background:var(--blue)"></span></div>
          <div class="button-row" style="margin-top:12px"><button class="button secondary" data-dashboard-water="250">+250 ml</button><button class="button secondary" data-dashboard-water="500">+500 ml</button></div>
        </article>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>ข้อมูลที่ใช้คำนวณ</h2><a href="#/data">Apple Health / Import</a></div>
      <div class="grid two">
        <article class="card flat">
          <div class="card-title">Behavior load วันนี้</div>
          <div class="metric">${today.strain.behaviorLoad?.score ?? '—'}${today.strain.behaviorLoad?.score != null ? '<small>/100</small>' : ''}</div>
          <div class="submetric">${behaviorText(today.strain.behaviorLoad)}</div>
          <div class="progress" style="margin-top:12px"><span style="width:${today.strain.behaviorLoad?.score ?? 0}%;background:var(--amber)"></span></div>
        </article>
        <article class="card flat">
          <div class="card-title">Baseline</div>
          <div class="metric">${today.recovery?.baseline?.hrvDays ?? 0}<small>วัน HRV</small></div>
          <div class="submetric">RHR ${today.recovery?.baseline?.restingHrDays ?? 0} วัน · Sleep ${today.recovery?.baseline?.sleepDays ?? 0} วัน</div>
          <div class="progress" style="margin-top:12px"><span style="width:${Math.min(100, ((today.recovery?.baseline?.hrvDays || 0) / 21) * 100)}%;background:var(--blue)"></span></div>
        </article>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>สรุปสัปดาห์</h2><a href="#/plan">เปิดแผน</a></div>
      <article class="card flat">
        <div class="grid three">
          <div><div class="card-title">ระยะจริง/แผน</div><div class="metric" style="font-size:23px">${formatNumber(week.actualDistanceKm,1)}<small>/ ${formatNumber(week.distanceKm,1)} km</small></div></div>
          <div><div class="card-title">Vertical จริง/แผน</div><div class="metric" style="font-size:23px">${formatNumber(week.actualElevationGainM)}<small>/ ${formatNumber(week.elevationGainM)} m</small></div></div>
          <div><div class="card-title">Phase</div><div class="metric" style="font-size:20px">${escapeHtml(today.plan.week?.phase || '—')}</div></div>
        </div>
        <div class="button-row" style="margin-top:14px"><a class="button secondary" href="#/progress">เปิด Progress Dashboard</a></div>
      </article>
    </section>

    ${renderPainAlert(today)}
    ${renderRecentActivities(selectRecentActivities(state))}
  `;

  container.querySelector('[data-action="checkin"]')?.addEventListener('click', () => app.navigate('checkin'));
  container.querySelector('[data-action="record-workout"]')?.addEventListener('click', () => app.openWorkoutModal(session));
  container.querySelectorAll('[data-dashboard-water]').forEach(button => button.addEventListener('click', async () => {
    const current = app.store.getState().waterLogs.find(item => item.date === today.dateKey)?.amountMl || 0;
    await app.store.upsertRecord(STORES.WATER_LOGS, { date: today.dateKey, amountMl: current + Number(button.dataset.dashboardWater), source: 'manual', updatedAt: nowIso() });
    app.toast('เพิ่มน้ำดื่มแล้ว'); app.render();
  }));
}

function scoreRing({ label, value, max, normalized, color, sub }) {
  const display = value == null ? '—' : formatNumber(value, max === 21 ? 1 : 0);
  return `<article class="score-ring-card card flat"><div class="ring small" style="--value:${Math.max(0, normalized || 0)};--ring-color:${color}"><div class="ring-content"><strong>${display}</strong><small>/${max}</small></div></div><div class="score-ring-text"><strong>${label}</strong><span>${escapeHtml(sub)}</span></div></article>`;
}

function renderPainAlert(today) {
  const pain = today.readiness?.pain;
  if (!pain || (!pain.caution && !pain.hardStop)) return '';
  const areas = Object.entries(pain.currentPain).filter(([, value]) => value >= 3).map(([key, value]) => `${key} ${value}/10`);
  return `<section class="section"><div class="callout danger"><strong>เฝ้าระวังอาการเจ็บ</strong><br>${escapeHtml(areas.join(' · ') || pain.flags.join(' · '))}</div></section>`;
}

function renderRecentActivities(activities) {
  return `<section class="section"><div class="section-head"><h2>กิจกรรมล่าสุด</h2><a href="#/data">นำเข้าข้อมูล</a></div><div class="list">${activities.length ? activities.map(activity => `
    <div class="list-item"><div style="font-size:22px">${activity.terrain === 'trail' ? '⛰' : '🏃'}</div><div class="grow"><strong>${escapeHtml(activity.name || activity.type)}</strong><small>${escapeHtml(activity.date)} · ${formatNumber(activity.distanceKm,1)} km · ${formatNumber(activity.durationMin)} นาที · ${escapeHtml(activity.source)}</small></div></div>
  `).join('') : '<div class="card flat empty">ยังไม่มีกิจกรรมจริง — บันทึกเองหรือนำเข้า GPX/TCX/CSV</div>'}</div></section>`;
}

function ringColor(status) {
  return status === 'green' ? 'var(--green)' : status === 'yellow' ? 'var(--amber)' : status === 'red' ? 'var(--red)' : 'var(--blue)';
}
function strainColor(score) {
  return score >= 17 ? 'var(--red)' : score >= 13 ? 'var(--amber)' : score >= 8 ? 'var(--blue)' : 'var(--mint)';
}
function recoveryColor(score) {
  return score == null ? 'var(--blue)' : score >= 75 ? 'var(--green)' : score >= 50 ? 'var(--amber)' : 'var(--red)';
}
function recoveryLabel(score) {
  return score >= 75 ? 'ฟื้นตัวดี' : score >= 50 ? 'ฟื้นตัวปานกลาง' : 'ฟื้นตัวยังไม่พอ';
}
function formatWeekChange(value) {
  if (value == null) return 'ยังไม่มีประวัติเทียบ';
  return `${value > 0 ? '+' : ''}${value}%`;
}
function behaviorText(load) {
  if (!load || load.score == null) return 'รอ Steps, Active Energy และ Exercise จาก Apple Health';
  if (load.score >= 85) return `สูงกว่าปกติ · เพิ่ม Strain ${load.strainContribution21 || 0}`;
  if (load.score >= 65) return `ปานกลาง · เพิ่ม Strain ${load.strainContribution21 || 0}`;
  return `ค่อนข้างเบา · เพิ่ม Strain ${load.strainContribution21 || 0}`;
}
