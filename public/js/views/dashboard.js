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
  const readinessScore = today.readiness?.score ?? 0;
  const readinessStatus = today.readiness?.status || 'neutral';
  const nutrition = foodTotals(state, today.dateKey);
  const nutritionPlan = nutritionTarget(state, today.dateKey);
  const water = state.waterLogs.find(item => item.date === today.dateKey)?.amountMl || 0;
  const waterTarget = dailyWaterTargetMl(state, today.dateKey);
  const readinessLabel = today.readiness
    ? `${readinessStatus === 'green' ? 'พร้อมซ้อม' : readinessStatus === 'yellow' ? 'ลดโหลด' : 'พัก/ประเมินอาการ'}`
    : 'ยังไม่ได้ Check-in';

  container.innerHTML = `
    ${pageHeader('วันนี้', formatThaiDate(today.dateKey), today.race ? `${escapeHtml(today.race.name)} · ${escapeHtml(raceSummary(today.race))}` : 'เลือกสนามเป้าหมายเพื่อเริ่มวางแผน')}
    <section class="card hero">
      <div class="hero-grid">
        <div>
          ${statusBadge(readinessStatus, readinessLabel)}
          <h2 style="font-size:24px;margin:12px 0 6px">${escapeHtml(session?.title?.th || 'อยู่นอกช่วงแผน')}</h2>
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
        <div class="ring" style="--value:${readinessScore};--ring-color:${ringColor(readinessStatus)}">
          <div class="ring-content"><strong>${today.readiness ? readinessScore : '—'}</strong><small>READINESS</small></div>
        </div>
      </div>
    </section>

    <section class="grid three section">
      ${metricCard(countdown.race ? `ถึง ${escapeHtml(countdown.race.name)}` : 'วันแข่งขัน', countdown.race ? countdown.days : '—', countdown.race ? 'วัน' : '', countdown.race ? `${countdown.weeks} สัปดาห์ ${countdown.remainderDays} วัน` : 'ยังไม่มีสนามที่เลือก')}
      ${metricCard('สัปดาห์นี้', `${week.completionPct}%`, '', `${week.completedSessions}/${week.trainableSessions} sessions`)}
      ${metricCard('Strain วันนี้', today.load.strainScore, '/100', `${today.load.totalLoad} load units`)}
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
      <div class="section-head"><h2>โหลดและการฟื้นตัว</h2><a href="#/data">ดูข้อมูล</a></div>
      <div class="grid two">
        <article class="card flat">
          <div class="card-title">7-day Load</div>
          <div class="metric">${formatNumber(today.loadTrend.last7.totalLoad)}</div>
          <div class="submetric">เทียบ 7 วันก่อน ${formatWeekChange(today.loadTrend.weekChangePct)}</div>
          <div class="progress" style="margin-top:12px"><span style="width:${Math.min(100, today.loadTrend.last7.totalLoad / 25)}%;background:${loadColor(today.loadTrend.warning.level)}"></span></div>
        </article>
        <article class="card flat">
          <div class="card-title">Behavior load เมื่อวาน</div>
          <div class="metric">${today.readiness?.behaviorLoad?.score ?? '—'}${today.readiness?.behaviorLoad?.score != null ? '<small>/100</small>' : ''}</div>
          <div class="submetric">${behaviorText(today.readiness?.behaviorLoad)}</div>
          <div class="progress" style="margin-top:12px"><span style="width:${today.readiness?.behaviorLoad?.score ?? 0}%;background:var(--amber)"></span></div>
        </article>
        <article class="card flat">
          <div class="card-title">Data confidence</div>
          <div class="metric">${today.readiness?.confidence ?? 0}<small>%</small></div>
          <div class="submetric">${confidenceText(today.readiness?.confidence ?? 0)}</div>
          <div class="progress" style="margin-top:12px"><span style="width:${today.readiness?.confidence ?? 0}%;background:var(--blue)"></span></div>
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
function loadColor(level) {
  return level === 'high' ? 'var(--red)' : level === 'moderate' ? 'var(--amber)' : 'var(--mint)';
}
function formatWeekChange(value) {
  if (value == null) return 'ยังไม่มีประวัติเทียบ';
  return `${value > 0 ? '+' : ''}${value}%`;
}
function behaviorText(load) {
  if (!load || load.score == null) return 'รอ Steps, Active Energy และ Exercise จาก Apple Health';
  if (load.score >= 85) return 'ภาระการเคลื่อนไหวสูงกว่าปกติ';
  if (load.score >= 65) return 'ภาระการเคลื่อนไหวปานกลาง';
  return 'ภาระกิจกรรมประจำวันค่อนข้างเบา';
}
function confidenceText(value) {
  if (value >= 80) return 'ข้อมูลค่อนข้างครบ';
  if (value >= 55) return 'ใช้ตัดสินใจได้บางส่วน';
  return 'ควรเพิ่ม Sleep, RHR/HRV และกิจกรรมจริง';
}
