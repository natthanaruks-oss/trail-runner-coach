import { selectRaceCountdown, selectToday, selectWeekSummary, selectRecentActivities, selectScoreHistory } from '../core/selectors.js';
import { selectAppleHealthInsights } from '../core/health-insights.js';
import { buildUnifiedInsights } from '../core/unified-insights.js';
import { buildPersonalTrends } from '../core/personal-trends.js';
import { buildTrailCoachIntelligence } from '../core/trail-coach.js';
import { buildMorningCoach } from '../core/morning-coach.js';
import { formatNumber, metricCard, pageHeader, escapeHtml } from './components.js';
import { formatThaiDate } from '../core/date.js';
import { raceSummary } from '../core/races.js';
import { foodTotals, nutritionTarget, dailyWaterTargetMl, energyBalanceForDate } from '../core/nutrition.js';
import { STORES } from '../core/constants.js';
import { nowIso } from '../core/date.js';
import { syncProviderNow } from '../adapters/sync-manager.js';
import { autoPullAppleHealth, latestAppleHealthProviderState, shouldAutoPullAppleHealth } from '../core/apple-health-auto-pull.js';

export function renderDashboard(container, state, app) {
  const today = selectToday(state);
  const countdown = selectRaceCountdown(state);
  const week = selectWeekSummary(state, today.plan.weekSessions);
  const session = today.plan.todaySession;
  const todayWorkout = session ? state.workouts.find(item => item.planSessionId === session.id) || null : null;
  const nutrition = foodTotals(state, today.dateKey);
  const nutritionPlan = nutritionTarget(state, today.dateKey);
  const nutritionBalance = energyBalanceForDate(state, today.dateKey);
  const water = state.waterLogs.find(item => item.date === today.dateKey)?.amountMl || 0;
  const waterTarget = dailyWaterTargetMl(state, today.dateKey);
  const health = selectAppleHealthInsights(state, today.dateKey, 7);
  const scoreHistory = selectScoreHistory(state, 7, today.dateKey);
  const unified = buildUnifiedInsights({ today, health, scoreHistory, nutritionBalance, nutritionTarget: nutritionPlan });
  const personalTrends = buildPersonalTrends({ healthRows: health.rows, activities: state.activities, endDateKey: today.dateKey, rangeDays: 90, sleepTargetHours: 7.5 });
  const trailCoach = buildTrailCoachIntelligence({ state, today, unified, personalTrends, week, countdown, endDateKey: today.dateKey });
  const morningCoach = buildMorningCoach({ today, unified, trailCoach, personalTrends, nutritionBalance }); const en = app.language === 'en';

  container.innerHTML = `
    ${pageHeader(en ? 'Today' : 'วันนี้', formatThaiDate(today.dateKey), today.race ? `${escapeHtml(today.race.name)} · ${escapeHtml(raceSummary(today.race))}` : (en ? 'Choose a target race to start planning' : 'เลือกสนามเป้าหมายเพื่อเริ่มวางแผน'))}

    ${renderReadinessHero({ today, session, todayWorkout, unified, trailCoach, en, app })} ${renderMorningCoach({ morningCoach, trailCoach, today, en })}

    <section class="section unified-pillars-section">
      <div class="section-head"><div><h2>${en ? 'Your training state' : 'สถานะการฝึกวันนี้'}</h2><small>${en ? 'One view of recovery, load and energy' : 'รวม Recovery, Training Load และ Energy ไว้ในภาพเดียว'}</small></div><a href="#/health">${en ? 'View analysis' : 'ดูการวิเคราะห์'}</a></div>
      <div class="unified-pillar-grid">
        ${pillarCard({
          href: '#/health',
          title: en ? 'Recovery' : 'การฟื้นตัว',
          value: unified.pillars.recovery.score,
          label: recoveryLabel(unified.pillars.recovery, en),
          detail: recoveryDetail(unified.pillars.recovery, health, en),
          trend: unified.pillars.recovery.trend,
          tone: scoreTone(unified.pillars.recovery.score)
        })}
        ${pillarCard({
          href: '#/progress',
          title: en ? 'Training load' : 'สมดุลโหลดฝึก',
          value: unified.pillars.load.score,
          label: loadLabel(unified.pillars.load, en),
          detail: loadDetail(unified.pillars.load, en),
          trend: unified.pillars.load.trend,
          tone: loadTone(unified.pillars.load)
        })}
        ${pillarCard({
          href: '#/fuel',
          title: en ? 'Energy & fuel' : 'พลังงานและการเติมพลัง',
          value: unified.pillars.energy.score,
          label: energyLabel(unified.pillars.energy, en),
          detail: energyDetail(unified.pillars.energy, nutritionBalance, en),
          trend: unified.pillars.energy.trend,
          tone: scoreTone(unified.pillars.energy.score)
        })}
      </div>
    </section>

    ${renderHealthSnapshot({ health, unified, today, en })}

    ${renderCoachInsight({ unified, today, trailCoach, en })}

    ${renderTrailCoachSummary({ trailCoach, en })}

    <section class="grid three section compact-kpi-row">
      ${metricCard(countdown.race ? (en ? `To ${escapeHtml(countdown.race.name)}` : `ถึง ${escapeHtml(countdown.race.name)}`) : (en ? 'Race day' : 'วันแข่งขัน'), countdown.race ? countdown.days : '—', countdown.race ? (en ? 'days' : 'วัน') : '', countdown.race ? `${countdown.weeks} ${en ? 'weeks' : 'สัปดาห์'} ${countdown.remainderDays} ${en ? 'days' : 'วัน'}` : (en ? 'No race selected' : 'ยังไม่มีสนามที่เลือก'))}
      ${metricCard(en ? 'This week' : 'สัปดาห์นี้', `${week.completionPct}%`, '', `${week.completedSessions}/${week.trainableSessions} sessions`)}
      ${metricCard(en ? '7-day load' : 'โหลด 7 วัน', formatNumber(today.loadTrend.last7.totalLoad), '', `${en ? 'vs previous week' : 'เทียบสัปดาห์ก่อน'} ${formatWeekChange(today.loadTrend.weekChangePct, en)}`)}
    </section>

    <section class="section">
      <div class="section-head"><h2>${en ? 'Fuel and hydration' : 'อาหารและน้ำวันนี้'}</h2><a href="#/fuel">${en ? 'Open food log' : 'เปิดบันทึกอาหาร'}</a></div>
      <div class="grid two">
        <a class="card flat tap-card" href="#/fuel">
          <div class="card-title">Calories / Protein</div>
          <div class="metric">${formatNumber(nutrition.kcal)}<small>/ ${formatNumber(nutritionPlan.kcal)} kcal</small></div>
          <div class="submetric">Protein ${formatNumber(nutrition.proteinG,1)} / ${nutritionPlan.proteinG} g · Carb ${formatNumber(nutrition.carbG,1)} g</div>
          <div class="progress" style="margin-top:12px"><span style="width:${Math.min(100,nutrition.kcal/Math.max(1,nutritionPlan.kcal)*100)}%;background:var(--mint)"></span></div>
        </a>
        <article class="card flat">
          <div class="section-head"><div class="card-title">${en ? 'Water' : 'น้ำดื่ม'}</div><span>${formatNumber(water)} / ${formatNumber(waterTarget)} ml</span></div>
          <div class="progress"><span style="width:${Math.min(100,water/Math.max(1,waterTarget)*100)}%;background:var(--blue)"></span></div>
          <div class="button-row" style="margin-top:12px"><button class="button secondary" data-dashboard-water="250">+250 ml</button><button class="button secondary" data-dashboard-water="500">+500 ml</button></div>
        </article>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>${en ? 'Weekly progress' : 'ความก้าวหน้าสัปดาห์นี้'}</h2><a href="#/progress">${en ? 'Open progress' : 'เปิด Progress'}</a></div>
      <article class="card flat weekly-progress-card">
        <div class="grid three">
          <div><div class="card-title">${en ? 'Distance actual / plan' : 'ระยะจริง / แผน'}</div><div class="metric compact">${formatNumber(week.actualDistanceKm,1)}<small>/ ${formatNumber(week.distanceKm,1)} km</small></div></div>
          <div><div class="card-title">${en ? 'Vertical actual / plan' : 'Vertical จริง / แผน'}</div><div class="metric compact">${formatNumber(week.actualElevationGainM)}<small>/ ${formatNumber(week.elevationGainM)} m</small></div></div>
          <div><div class="card-title">Phase</div><div class="metric compact">${escapeHtml(today.plan.week?.phase || '—')}</div></div>
        </div>
      </article>
    </section>

    ${renderPainAlert(today, en)}
    ${renderRecentActivities(selectRecentActivities(state), en)}
  `;

  container.querySelector('[data-action="checkin"]')?.addEventListener('click', () => app.navigate('checkin'));
  container.querySelector('[data-action="record-workout"]')?.addEventListener('click', () => app.openWorkoutModal(session));
  container.querySelectorAll('[data-dashboard-water]').forEach(button => button.addEventListener('click', async () => {
    const current = app.store.getState().waterLogs.find(item => item.date === today.dateKey)?.amountMl || 0;
    await app.store.upsertRecord(STORES.WATER_LOGS, { date: today.dateKey, amountMl: current + Number(button.dataset.dashboardWater), source: 'manual', updatedAt: nowIso() });
    app.toast(en ? 'Water added' : 'เพิ่มน้ำดื่มแล้ว'); app.render();
  }));
  container.querySelector('[data-dashboard-health-sync]')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = en ? 'Updating…' : 'กำลังอัปเดต…';
    setDashboardSyncStatus(container, en ? 'Updating health data…' : 'กำลังอัปเดตข้อมูลสุขภาพ…');
    try {
      const result = await syncProviderNow(app.store, 'apple_health', { days: 90, trigger: 'dashboard_manual', resetRetry: true });
      const count = Number(result?.result?.checkins || 0);
      app.toast(en ? `Health data updated: ${count} day(s)` : `อัปเดตข้อมูลสุขภาพแล้ว ${count} วัน`);
      app.render();
    } catch (error) {
      const message = error.message || (en ? 'Health data update failed' : 'อัปเดตข้อมูลสุขภาพไม่สำเร็จ');
      setDashboardSyncStatus(container, message, true);
      app.toast(message);
      button.disabled = false;
      button.textContent = en ? 'Update' : 'อัปเดต';
    }
  });

  scheduleDashboardAutoPull(container, state, app, health, en);
}

function renderReadinessHero({ today, session, todayWorkout, unified, trailCoach, en, app }) {
  const score = unified.readiness.score;
  const status = unified.readiness.status;
  const label = readinessLabel(unified.readiness, en);
  const coachAction = trailPrescriptionText(trailCoach.prescription, en);
  const plannedTitle = session ? (app.field(session, 'title') || session.t) : (en ? 'No planned session' : 'ยังไม่มีแผนซ้อมวันนี้');
  const workoutMeta = session ? `${escapeHtml(session.t || 'Rest')}${session.km ? ` · ${session.km} km · +${session.vert || 0} m` : ''}` : '';
  const actualMeta = todayWorkout && ['completed','partial','exceeded','modified'].includes(todayWorkout.status)
    ? `${en ? 'Actual' : 'จริง'} ${todayWorkout.actualDistanceKm != null ? `${formatNumber(todayWorkout.actualDistanceKm,1)} km` : '—'}${todayWorkout.durationMin != null ? ` · ${formatNumber(todayWorkout.durationMin)} ${en ? 'min' : 'นาที'}` : ''}${todayWorkout.isSplitSession ? ` · ${todayWorkout.activityCount || todayWorkout.actualActivityIds?.length || 2} ${en ? 'sessions' : 'รอบ'}` : ''}`
    : todayWorkout?.status === 'needs_review' ? (todayWorkout.isSplitSession ? (en ? 'Split-session match needs review' : 'พบหลายกิจกรรมรอยืนยันกับแผน') : (en ? 'Workout match needs review' : 'มีกิจกรรมรอยืนยันกับแผน')) : '';
  const workoutActionLabel = todayWorkout && ['completed','partial','exceeded','modified'].includes(todayWorkout.status) ? (en ? 'View actual result' : 'ดูผลซ้อมจริง') : (en ? 'Record workout' : 'บันทึกผลจริง');
  return `<section class="card unified-readiness-hero tone-${escapeHtml(status || 'unknown')}">
    <div class="unified-hero-top">
      <div>
        <div class="eyebrow">${en ? 'DAILY READINESS' : 'ความพร้อมวันนี้'}</div>
        <div class="readiness-score-line"><strong>${score == null ? '—' : formatNumber(score)}</strong><span>/100</span><i class="status-dot ${toneClass(status)}"></i></div>
        <h2>${escapeHtml(label)}</h2>
      </div>
      ${sparkline(unified.readiness.trend, toneColor(status), 'hero-sparkline')}
    </div>
    <div class="readiness-context-row">
      <span>${en ? 'Confidence' : 'ความมั่นใจ'} ${unified.readiness.confidence}%</span>
      <span>${escapeHtml(plannedTitle)}</span>
      ${workoutMeta ? `<span>${workoutMeta}</span>` : ''}
      ${actualMeta ? `<span class="${todayWorkout?.status === 'needs_review' ? 'warning-text' : ''}">${escapeHtml(actualMeta)}</span>` : ''}
    </div>
    <div class="coach-hero-message">
      <strong>${escapeHtml(coachAction.title)}</strong>
      <p>${escapeHtml(coachAction.detail)}</p>
    </div>
    <div class="button-row unified-hero-actions">
      <button class="button primary" data-action="checkin">${today.checkin ? (en ? 'Edit check-in' : 'แก้ไข Check-in') : (en ? 'Check in' : 'Check-in ก่อนซ้อม')}</button>
      ${session ? `<button class="button secondary" data-action="record-workout">${workoutActionLabel}</button>` : ''}
      <a class="button ghost" href="#/coach">${en ? 'Open Trail Coach' : 'เปิด Trail Coach'}</a>
    </div>
  </section>`;
}

function renderHealthSnapshot({ health, unified, today, en }) {
  const metricOrder = ['sleepHours', 'restingHr', 'hrvMs', 'steps', 'activeEnergyKcal', 'walkingRunningDistanceKm'];
  const metrics = metricOrder.map(key => unified.metrics.find(item => item.key === key)).filter(Boolean);
  const syncText = unified.lastUpdatedAt ? `${en ? 'Updated' : 'อัปเดต'} ${formatTimestamp(unified.lastUpdatedAt, en)}` : (en ? 'No health data yet' : 'ยังไม่มีข้อมูลสุขภาพ');
  return `<section class="section health-snapshot-section">
    <div class="section-head"><div><h2>${en ? 'Health snapshot' : 'ภาพรวมสุขภาพ'}</h2><small>${en ? 'Latest useful value for each metric' : 'แสดงค่าล่าสุดที่ใช้วิเคราะห์ได้ของแต่ละ Metric'}</small></div><a href="#/health">${en ? 'View details' : 'ดูรายละเอียด'}</a></div>
    <article class="card flat unified-health-card">
      <div class="health-snapshot-toolbar">
        <div><strong>${escapeHtml(syncText)}</strong><small>${health.trend.coverageDays}/${health.trend.days} ${en ? 'days available' : 'วันที่มีข้อมูล'} · ${en ? 'confidence' : 'ความมั่นใจ'} ${unified.coverage.confidence}%</small></div>
        <div class="button-row"><button type="button" class="button secondary compact" data-dashboard-health-sync>${en ? 'Update' : 'อัปเดต'}</button><a class="button ghost compact" href="#/connections-home">${en ? 'Data & sync' : 'ข้อมูลและการเชื่อมต่อ'}</a></div>
      </div>
      <div class="wizard-status submetric ${health.hasData ? 'success' : ''}" data-dashboard-health-status>${dashboardSyncStatusText(health, en)}</div>
      <div class="unified-health-grid">
        ${metrics.map(metric => healthSnapshotMetric(metric, today.dateKey, en)).join('')}
      </div>
    </article>
  </section>`;
}

function renderCoachInsight({ unified, today, trailCoach, en }) {
  const action = trailPrescriptionText(trailCoach.prescription, en);
  const contributorItems = unified.contributors.length
    ? unified.contributors.map(item => `<li class="insight-contributor ${escapeHtml(item.tone)}"><span>${contributorIcon(item.tone)}</span><div><strong>${escapeHtml(contributorText(item, en))}</strong><small>${escapeHtml(contributorDetail(item, en))}</small></div></li>`).join('')
    : `<li class="insight-contributor neutral"><span>•</span><div><strong>${en ? 'Keep collecting daily data' : 'เก็บข้อมูลต่อเนื่อง'}</strong><small>${en ? 'A longer baseline will make the recommendation more personal.' : 'Baseline ที่ยาวขึ้นจะทำให้คำแนะนำเฉพาะตัวมากขึ้น'}</small></div></li>`;
  return `<section class="section coach-insight-section">
    <div class="section-head"><div><h2>${en ? 'Coach insight' : 'บทวิเคราะห์จาก Coach'}</h2><small>${en ? 'Action first, data second' : 'สรุปสิ่งที่ควรทำก่อน แล้วจึงอธิบายด้วยข้อมูล'}</small></div><a href="#/coach">${en ? 'Full coaching analysis' : 'ดูการวิเคราะห์เต็ม'}</a></div>
    <article class="card flat coach-insight-card">
      <div class="coach-insight-head">
        <div><span class="status ${toneClass(unified.readiness.status)}">${escapeHtml(action.badge)}</span><h3>${escapeHtml(action.title)}</h3><p>${escapeHtml(action.detail)}</p></div>
        <div class="coach-confidence"><strong>${unified.readiness.confidence}%</strong><span>${en ? 'confidence' : 'ความมั่นใจ'}</span></div>
      </div>
      <ul class="insight-contributor-list">${contributorItems}</ul>
      <div class="coach-next-action"><strong>${en ? 'Today’s practical action' : 'สิ่งที่ควรทำวันนี้'}</strong><span>${escapeHtml(trailPrescriptionDetail(trailCoach.prescription, en))}</span></div>
      <small class="health-disclaimer">${en ? 'Training guidance only, not a medical diagnosis.' : 'ใช้ประกอบการวางแผนฝึก ไม่ใช่การวินิจฉัยทางการแพทย์'}</small>
    </article>
  </section>`;
}


function renderTrailCoachSummary({ trailCoach, en }) {
  const race = trailCoach.race;
  const longRun = trailCoach.longRun;
  const elevation = trailCoach.elevationLoad;
  return `<section class="section trail-coach-summary-section">
    <div class="section-head"><div><h2>${en ? 'Trail-specific readiness' : 'ความพร้อมเฉพาะ Trail'}</h2><small>${en ? 'Race preparation, long-run endurance and vertical load' : 'รวมความพร้อมสนาม Endurance จาก Long Run และโหลดทางชัน'}</small></div><a href="#/coach">${en ? 'Open Trail Coach' : 'ดูรายละเอียด'}</a></div>
    <div class="trail-summary-grid">
      ${trailSummaryCard(en ? 'Race readiness' : 'ความพร้อมสนาม', race.score, dashboardRaceStatus(race.status, en), race.countdownDays == null ? (en ? 'Choose a target race' : 'เลือกสนามเป้าหมาย') : `${race.countdownDays} ${en ? 'days to race' : 'วันถึงสนาม'}`, scoreTone(race.score))}
      ${trailSummaryCard(en ? 'Long-run readiness' : 'ความพร้อม Long Run', longRun.score, dashboardLongRunStatus(longRun.status, en), `${formatNumber(longRun.longestDistanceKm,1)} km · ${formatMinutes(longRun.longestDurationMin,en)}`, scoreTone(longRun.score))}
      ${trailSummaryCard(en ? '7-day vertical load' : 'Vertical load 7 วัน', elevation.sessions ? dashboardElevationScore(elevation) : null, dashboardElevationStatus(elevation.status,en), `${formatNumber(elevation.distanceKm,1)} km · +${formatNumber(elevation.elevationGainM)} m`, elevation.status === 'spike' ? 'risk' : elevation.status === 'watch' ? 'watch' : elevation.sessions ? 'good' : 'neutral')}
    </div>
  </section>`;
}
function trailSummaryCard(title, score, status, detail, tone) { return `<a class="card flat trail-summary-card tone-${escapeHtml(tone)}" href="#/coach"><div class="pillar-card-head"><span>${escapeHtml(title)}</span><i>›</i></div><div class="pillar-value-row"><strong>${score == null ? '—' : formatNumber(score)}</strong>${score == null ? '' : '<small>/100</small>'}</div><div class="pillar-label">${escapeHtml(status)}</div><div class="pillar-detail">${escapeHtml(detail)}</div></a>`; }

function pillarCard({ href, title, value, label, detail, trend, tone }) {
  return `<a class="card flat unified-pillar-card tone-${escapeHtml(tone)}" href="${escapeHtml(href)}">
    <div class="pillar-card-head"><span>${escapeHtml(title)}</span><i>›</i></div>
    <div class="pillar-value-row"><strong>${value == null ? '—' : formatNumber(value)}</strong><small>/100</small></div>
    <div class="pillar-label">${escapeHtml(label)}</div>
    ${sparkline(trend, toneColor(tone), 'pillar-sparkline')}
    <div class="pillar-detail">${escapeHtml(detail)}</div>
  </a>`;
}

function healthSnapshotMetric(metric, currentDate, en) {
  const formatted = formatHealthValue(metric, en);
  const delta = metricDeltaText(metric, en);
  return `<a class="health-snapshot-metric tone-${escapeHtml(metric.tone)}" href="#/health">
    <div class="health-snapshot-head"><span>${escapeHtml(metricLabel(metric.key, en))}</span><i>${freshnessLabel(metric, currentDate, en)}</i></div>
    <div class="health-snapshot-value">${formatted.value}<small>${formatted.unit}</small></div>
    <div class="health-snapshot-delta ${escapeHtml(metric.tone)}">${escapeHtml(delta)}</div>
    ${sparkline(metric.series, toneColor(metric.tone), 'metric-sparkline')}
  </a>`;
}

function sparkline(values = [], color = 'var(--blue)', className = '') {
  const finiteValues = values.map(value => Number.isFinite(Number(value)) ? Number(value) : null);
  const actual = finiteValues.filter(value => value != null);
  if (!actual.length) return `<div class="sparkline-empty ${escapeHtml(className)}"></div>`;
  const min = Math.min(...actual);
  const max = Math.max(...actual);
  const range = max - min || 1;
  const width = 120;
  const height = 38;
  const step = finiteValues.length > 1 ? width / (finiteValues.length - 1) : width;
  const points = finiteValues.map((value, index) => value == null ? null : `${(index * step).toFixed(1)},${(height - 4 - ((value - min) / range) * (height - 8)).toFixed(1)}`).filter(Boolean).join(' ');
  return `<svg class="sparkline ${escapeHtml(className)}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true" style="--spark-color:${color}"><polyline points="${points}"/></svg>`;
}

function readinessLabel(readiness, en) {
  const map = {
    readiness_good: en ? 'Ready to train' : 'พร้อมฝึกตามแผน',
    readiness_moderate: en ? 'Moderate readiness' : 'ความพร้อมปานกลาง',
    readiness_low: en ? 'Recovery is limited' : 'การฟื้นตัวยังไม่พอ',
    readiness_reduce: en ? 'Reduce today’s load' : 'ควรลดโหลดวันนี้',
    readiness_stop: en ? 'Rest and reassess' : 'พักและประเมินอาการ',
    readiness_unknown: en ? 'Check in to complete the picture' : 'Check-in เพื่อประเมินให้ครบ'
  };
  return map[readiness.labelCode] || map.readiness_unknown;
}
function recoveryLabel(pillar, en) {
  if (pillar.score == null) return en ? 'Building baseline' : 'กำลังสร้าง Baseline';
  if (pillar.score >= 75) return en ? 'Recovered well' : 'ฟื้นตัวดี';
  if (pillar.score >= 50) return en ? 'Moderate recovery' : 'ฟื้นตัวปานกลาง';
  return en ? 'Recovery is low' : 'ฟื้นตัวยังไม่พอ';
}
function loadLabel(pillar, en) {
  if (pillar.score == null) return en ? 'No load history' : 'ยังไม่มีประวัติโหลด';
  if (pillar.status === 'balanced') return en ? 'Within your range' : 'อยู่ในช่วงเหมาะสม';
  if (pillar.status === 'watch') return en ? 'Load is changing' : 'โหลดกำลังเปลี่ยน';
  if (pillar.status === 'risk') return en ? 'Outside your usual range' : 'โหลดนอกช่วงปกติ';
  return en ? 'Building history' : 'กำลังสร้างประวัติ';
}
function energyLabel(pillar, en) {
  if (pillar.score == null) return en ? 'Not enough data' : 'ข้อมูลยังไม่พอ';
  if (pillar.score >= 75) return en ? 'Energy looks good' : 'พลังงานพร้อม';
  if (pillar.score >= 55) return en ? 'Moderate energy' : 'พลังงานปานกลาง';
  return en ? 'Refuel or recover' : 'ควรเติมพลังหรือพัก';
}
function recoveryDetail(pillar, health, en) {
  if (pillar.score == null) return `${health.recoveryAvailable}/3 ${en ? 'recovery signals' : 'สัญญาณ Recovery'}`;
  return `${en ? 'Confidence' : 'ความมั่นใจ'} ${pillar.confidence}% · ${health.recoveryAvailable}/3 signals`;
}
function loadDetail(pillar, en) {
  const change = pillar.weekChangePct == null ? (en ? 'No weekly comparison' : 'ยังไม่มีข้อมูลเทียบสัปดาห์') : `${pillar.weekChangePct > 0 ? '+' : ''}${pillar.weekChangePct}% ${en ? 'vs last week' : 'เทียบสัปดาห์ก่อน'}`;
  return `${en ? 'Today strain' : 'Strain วันนี้'} ${pillar.todayStrain == null ? '—' : formatNumber(pillar.todayStrain,1)}/21 · ${change}`;
}
function energyDetail(pillar, balance, en) {
  if (pillar.score == null) return en ? 'Add sleep, movement and food data' : 'เพิ่มข้อมูลการนอน การเคลื่อนไหว และอาหาร';
  if (balance?.foodComplete) return `${en ? 'Energy balance' : 'สมดุลพลังงาน'} ${signedKcal(balance.netKcal)}`;
  return en ? 'Estimated from recovery and daily movement' : 'ประเมินจาก Recovery และการเคลื่อนไหววันนี้';
}
function metricLabel(key, en) {
  const labels = {
    sleepHours: en ? 'Sleep' : 'การนอน',
    restingHr: 'Resting HR',
    hrvMs: 'HRV',
    steps: en ? 'Steps' : 'ก้าว',
    activeEnergyKcal: en ? 'Active energy' : 'พลังงานกิจกรรม',
    walkingRunningDistanceKm: en ? 'Walk + run' : 'เดิน + วิ่ง'
  };
  return labels[key] || key;
}
function formatHealthValue(metric, en) {
  if (metric.value == null) return { value: '—', unit: '' };
  if (metric.key === 'sleepHours') return { value: formatSleep(metric.value, en), unit: '' };
  if (metric.key === 'walkingRunningDistanceKm') return { value: formatNumber(metric.value, 2), unit: ' km' };
  if (metric.key === 'restingHr') return { value: formatNumber(metric.value), unit: ' bpm' };
  if (metric.key === 'hrvMs') return { value: formatNumber(metric.value), unit: ' ms' };
  if (metric.key === 'activeEnergyKcal') return { value: formatNumber(metric.value), unit: ' kcal' };
  return { value: formatNumber(metric.value), unit: '' };
}
function metricDeltaText(metric, en) {
  if (metric.value == null) return en ? 'No data yet' : 'ยังไม่มีข้อมูล';
  if (metric.delta == null || metric.baseline == null) return en ? 'Building personal baseline' : 'กำลังสร้างค่าเฉลี่ยส่วนตัว';
  const sign = metric.delta > 0 ? '+' : '';
  if (metric.key === 'sleepHours') return `${sign}${formatNumber(metric.delta,1)} ${en ? 'h vs 7-day avg' : 'ชม. เทียบค่าเฉลี่ย'}`;
  if (metric.key === 'restingHr') return `${sign}${formatNumber(metric.delta)} bpm ${en ? 'vs avg' : 'เทียบค่าเฉลี่ย'}`;
  if (metric.key === 'hrvMs') return `${sign}${formatNumber(metric.delta)} ms ${en ? 'vs avg' : 'เทียบค่าเฉลี่ย'}`;
  if (metric.key === 'steps') return `${sign}${formatNumber(metric.delta)} ${en ? 'vs avg' : 'เทียบค่าเฉลี่ย'}`;
  if (metric.key === 'activeEnergyKcal') return `${sign}${formatNumber(metric.delta)} kcal ${en ? 'vs avg' : 'เทียบค่าเฉลี่ย'}`;
  return `${sign}${formatNumber(metric.delta,2)} km ${en ? 'vs avg' : 'เทียบค่าเฉลี่ย'}`;
}
function freshnessLabel(metric, currentDate, en) {
  const metricDate = metric?.date || null;
  if (!metricDate) return en ? 'No data' : 'ไม่มีข้อมูล';
  if (metric?.alignment === 'overnight_to_wake_day' && metricDate === currentDate) return en ? 'Last night' : 'เมื่อคืน';
  if (metric?.alignment === 'same_day_recovery' && metricDate === currentDate) return en ? 'This morning' : 'เช้านี้';
  if (metricDate === currentDate) return en ? 'Today' : 'วันนี้';
  const date = new Date(`${metricDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return metricDate;
  return date.toLocaleDateString(en ? 'en-GB' : 'th-TH', { day: 'numeric', month: 'short' });
}
function coachActionText(code, en) {
  const map = {
    follow_plan: {
      badge: en ? 'ON TRACK' : 'เป็นไปตามแผน',
      title: en ? 'Follow the planned session' : 'ทำตามแผนได้',
      detail: en ? 'Recovery and training load are within an acceptable range. Keep the planned intensity and avoid adding extra work.' : 'Recovery และโหลดฝึกอยู่ในช่วงที่รับได้ ทำตามแผนและไม่เพิ่มงานนอกแผน'
    },
    quality_session_ok: {
      badge: en ? 'READY' : 'พร้อมฝึก',
      title: en ? 'A quality session is reasonable' : 'ทำ Quality Session ได้',
      detail: en ? 'Readiness is supportive and the recent load is balanced. Keep the planned volume and monitor effort.' : 'ความพร้อมสนับสนุนการซ้อมและโหลดล่าสุดสมดุล รักษาปริมาณตามแผนและคุมความหนัก'
    },
    reduce_load: {
      badge: en ? 'ADJUST' : 'ควรปรับแผน',
      title: en ? 'Reduce today’s load by about 15–25%' : 'ลดโหลดวันนี้ประมาณ 15–25%',
      detail: en ? 'Choose easy aerobic work, shorten the session or reduce elevation. Stop if pain or fatigue worsens.' : 'เลือก Easy aerobic ลดระยะหรือลด Vertical และหยุดหากอาการเจ็บหรือความล้าแย่ลง'
    },
    rest_or_recovery: {
      badge: en ? 'RECOVER' : 'เน้นฟื้นตัว',
      title: en ? 'Rest or use very light active recovery' : 'พักหรือทำ Active Recovery เบามาก',
      detail: en ? 'Current recovery or pain signals do not support a hard session. Prioritize sleep, food and symptom review.' : 'สัญญาณ Recovery หรืออาการเจ็บไม่สนับสนุนการซ้อมหนัก ให้เน้นการนอน อาหาร และประเมินอาการ'
    },
    check_in_first: {
      badge: en ? 'CHECK IN' : 'ข้อมูลยังไม่ครบ',
      title: en ? 'Complete a short check-in before training' : 'ทำ Check-in สั้น ๆ ก่อนซ้อม',
      detail: en ? 'Objective data is available, but pain and perceived fatigue are needed for a safer recommendation.' : 'มีข้อมูลอัตโนมัติแล้ว แต่ยังต้องรู้ Pain และความล้าที่รู้สึกจริงเพื่อคำแนะนำที่ปลอดภัยขึ้น'
    }
  };
  return map[code] || map.follow_plan;
}
function contributorText(item, en) {
  const map = {
    short_sleep: en ? 'Sleep is below six hours' : 'นอนต่ำกว่า 6 ชั่วโมง',
    sleep_below_baseline: en ? 'Sleep is below your recent average' : 'การนอนต่ำกว่าค่าเฉลี่ยล่าสุด',
    sleep_supportive: en ? 'Sleep supports recovery' : 'การนอนช่วยสนับสนุน Recovery',
    rhr_elevated: en ? 'Resting HR is elevated' : 'Resting HR สูงกว่าค่าเฉลี่ย',
    rhr_below_baseline: en ? 'Resting HR is below baseline' : 'Resting HR ต่ำกว่า Baseline',
    hrv_suppressed: en ? 'HRV is below baseline' : 'HRV ต่ำกว่า Baseline',
    hrv_supportive: en ? 'HRV is above baseline' : 'HRV สูงกว่า Baseline',
    load_outside_range: en ? 'Training load is outside your usual range' : 'โหลดฝึกอยู่นอกช่วงปกติ',
    load_changing: en ? 'Training load is changing' : 'โหลดฝึกกำลังเปลี่ยน',
    load_balanced: en ? 'Recent training load is balanced' : 'โหลดฝึกล่าสุดสมดุล',
    pain_hard_stop: en ? 'Pain safety gate is active' : 'Pain Safety Gate ทำงาน',
    pain_caution: en ? 'Pain needs caution' : 'อาการเจ็บต้องเฝ้าระวัง',
    large_energy_deficit: en ? 'Energy deficit is large' : 'Calories Deficit ค่อนข้างสูง'
  };
  return map[item.code] || item.code;
}
function contributorDetail(item, en) {
  if (item.code.includes('sleep') && item.delta != null) return `${item.delta > 0 ? '+' : ''}${formatNumber(item.delta,1)} ${en ? 'hours versus recent average' : 'ชม. เทียบค่าเฉลี่ยล่าสุด'}`;
  if (item.code.startsWith('rhr') && item.delta != null) return `${item.delta > 0 ? '+' : ''}${formatNumber(item.delta)} bpm ${en ? 'versus recent average' : 'เทียบค่าเฉลี่ยล่าสุด'}`;
  if (item.code.startsWith('hrv') && item.delta != null) return `${item.delta > 0 ? '+' : ''}${formatNumber(item.delta)} ms ${en ? 'versus recent average' : 'เทียบค่าเฉลี่ยล่าสุด'}`;
  if (item.code.includes('load') && item.value != null) return `${item.value > 0 ? '+' : ''}${formatNumber(item.value)}% ${en ? 'versus previous week' : 'เทียบสัปดาห์ก่อน'}`;
  if (item.code === 'large_energy_deficit' && item.value != null) return `${formatNumber(item.value)} kcal`;
  return en ? 'Included in today’s recommendation' : 'ถูกใช้ประกอบคำแนะนำวันนี้';
}
function contributorIcon(tone) { return tone === 'good' ? '✓' : tone === 'risk' ? '!' : tone === 'watch' ? '↗' : '•'; }
function dashboardSyncStatusText(health, en) {
  if (health.hasData) return en ? `${health.trend.coverageDays} day(s) available locally. Each metric uses its latest useful value.` : `มีข้อมูลในแอป ${health.trend.coverageDays} วัน · แต่ละ Metric ใช้ค่าล่าสุดที่มีประโยชน์`;
  return en ? 'Connect a health source in Data & Sync, then update this page.' : 'เชื่อมต่อข้อมูลในเมนูข้อมูลและการเชื่อมต่อ แล้วกดอัปเดตหน้านี้';
}
function setDashboardSyncStatus(container, message, error = false) {
  const element = container.querySelector('[data-dashboard-health-status]');
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('error', error);
  element.classList.toggle('success', !error);
}
function scheduleDashboardAutoPull(container, state, app, health, en) {
  if (!shouldAutoPullAppleHealth(state, health)) return;
  const provider = latestAppleHealthProviderState(state);
  const button = container.querySelector('[data-dashboard-health-sync]');
  if (button) { button.disabled = true; button.textContent = en ? 'Updating…' : 'กำลังอัปเดต…'; }
  setDashboardSyncStatus(container, en ? 'Checking for updated health data…' : 'กำลังตรวจข้อมูลสุขภาพล่าสุด…');
  queueMicrotask(async () => {
    try {
      const result = await autoPullAppleHealth(app, { days: 90, trigger: 'dashboard_auto' });
      const count = Number(result?.result?.checkins || 0);
      if (count > 0) { app.toast(en ? `Health data imported: ${count} day(s)` : `นำเข้าข้อมูลสุขภาพแล้ว ${count} วัน`); app.render(); return; }
      setDashboardSyncStatus(container, en ? 'The sync service responded, but no supported daily data was found.' : 'ระบบ Sync ตอบกลับแล้ว แต่ยังไม่มี Daily Metric ที่รองรับ', true);
    } catch (error) {
      setDashboardSyncStatus(container, error?.message || provider?.lastError || (en ? 'Automatic update failed' : 'อัปเดตอัตโนมัติไม่สำเร็จ'), true);
    } finally {
      if (button?.isConnected) { button.disabled = false; button.textContent = en ? 'Update' : 'อัปเดต'; }
    }
  });
}
function renderPainAlert(today, en) {
  const pain = today.readiness?.pain;
  if (!pain || (!pain.caution && !pain.hardStop)) return '';
  const areas = Object.entries(pain.currentPain).filter(([, value]) => value >= 3).map(([key, value]) => `${key} ${value}/10`);
  return `<section class="section"><div class="callout danger"><strong>${en ? 'Pain alert' : 'เฝ้าระวังอาการเจ็บ'}</strong><br>${escapeHtml(areas.join(' · ') || pain.flags.join(' · '))}</div></section>`;
}
function renderRecentActivities(activities, en) {
  return `<section class="section"><div class="section-head"><h2>${en ? 'Recent activities' : 'กิจกรรมล่าสุด'}</h2><a href="#/data">${en ? 'Import data' : 'นำเข้าข้อมูล'}</a></div><div class="list">${activities.length ? activities.map(activity => `
    <div class="list-item"><div style="font-size:22px">${activity.terrain === 'trail' ? '⛰' : '🏃'}</div><div class="grow"><strong>${escapeHtml(activity.name || activity.type)}</strong><small>${escapeHtml(activity.date)} · ${formatNumber(activity.distanceKm,1)} km · ${formatNumber(activity.durationMin)} ${en ? 'min' : 'นาที'}</small></div></div>
  `).join('') : `<div class="card flat empty">${en ? 'No activity yet — record one or import GPX/TCX/CSV.' : 'ยังไม่มีกิจกรรมจริง — บันทึกเองหรือนำเข้า GPX/TCX/CSV'}</div>`}</div></section>`;
}
function scoreTone(score) { return score == null ? 'neutral' : score >= 75 ? 'good' : score >= 50 ? 'watch' : 'risk'; }
function loadTone(load) { return load.status === 'balanced' ? 'good' : load.status === 'watch' || load.status === 'building' ? 'watch' : load.status === 'risk' ? 'risk' : 'neutral'; }
function toneClass(status) { return ['green','good','balanced'].includes(status) ? 'green' : ['yellow','moderate','watch','building'].includes(status) ? 'yellow' : ['red','low','risk'].includes(status) ? 'red' : 'neutral'; }
function toneColor(tone) { return ['green','good','balanced'].includes(tone) ? 'var(--green)' : ['yellow','watch','moderate','building'].includes(tone) ? 'var(--amber)' : ['red','risk','low'].includes(tone) ? 'var(--red)' : 'var(--blue)'; }
function formatWeekChange(value, en) { return value == null ? (en ? 'not enough history' : 'ยังไม่มีประวัติเทียบ') : `${value > 0 ? '+' : ''}${value}%`; }
function signedKcal(value) { const number = Number(value) || 0; return `${number > 0 ? '+' : ''}${formatNumber(number)} kcal`; }
function formatSleep(hours, en) { const totalMinutes = Math.round(Number(hours) * 60); const h = Math.floor(totalMinutes / 60); const m = totalMinutes % 60; return `${h}${en ? 'h' : 'ชม.'} ${m}${en ? 'm' : 'น.'}`; }
function formatTimestamp(value, en) { const date = new Date(value); if (Number.isNaN(date.getTime())) return String(value || '—'); return date.toLocaleString(en ? 'en-GB' : 'th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }


function trailPrescriptionText(item, en) {
  const map = {
    follow_plan: { badge: en ? 'ON TRACK' : 'เป็นไปตามแผน', title: en ? 'Follow the planned session' : 'ทำตามแผนได้', detail: en ? 'Keep the planned volume and avoid adding unplanned intensity.' : 'รักษาปริมาณตามแผนและไม่เพิ่มความหนักนอกแผน' },
    reduce_15: { badge: en ? 'ADJUST' : 'ปรับเล็กน้อย', title: en ? 'Reduce today’s load by about 15%' : 'ลดโหลดวันนี้ประมาณ 15%', detail: en ? 'Keep the effort controlled and reduce climbing if fatigue rises.' : 'คุมความหนักและลดทางชันหากความล้าเพิ่มขึ้น' },
    reduce_25: { badge: en ? 'ADJUST' : 'ควรปรับแผน', title: en ? 'Reduce today’s load by about 25%' : 'ลดโหลดวันนี้ประมาณ 25%', detail: en ? 'Use easy aerobic effort and shorten distance or vertical gain.' : 'ใช้ Easy aerobic และลดระยะหรือ Vertical gain' },
    replace_with_easy: { badge: en ? 'EASY' : 'เปลี่ยนเป็น Easy', title: en ? 'Replace the hard session with easy work' : 'เปลี่ยน Session หนักเป็น Easy', detail: en ? 'Choose easy aerobic running, walking or gentle mobility.' : 'เลือก Easy aerobic เดิน หรือ Mobility เบา ๆ' },
    replace_easy_or_rest: { badge: en ? 'RECOVER' : 'เน้นฟื้นตัว', title: en ? 'Use recovery work or rest' : 'ทำ Recovery เบามากหรือพัก', detail: en ? 'Current recovery does not support a demanding session.' : 'Recovery ปัจจุบันไม่สนับสนุนการฝึกที่หนัก' },
    rest_assess: { badge: en ? 'STOP' : 'พักก่อน', title: en ? 'Rest and assess symptoms' : 'พักและประเมินอาการ', detail: en ? 'Pain or symptom safety signals override the training plan.' : 'Pain หรือสัญญาณอาการมีอำนาจเหนือแผนซ้อม' },
    check_in_first: { badge: en ? 'CHECK IN' : 'Check-in ก่อน', title: en ? 'Check in before hard training' : 'ทำ Check-in ก่อน Session หนัก', detail: en ? 'Keep effort easy until pain, fatigue and soreness are confirmed.' : 'คุมความหนักไว้ระดับ Easy จนกว่าจะประเมิน Pain ความล้า และอาการล้ากล้ามเนื้อ' },
    cap_long_run: { badge: en ? 'CAP LONG RUN' : 'ลด Long Run', title: en ? 'Shorten the long run' : 'ลด Long Run', detail: en ? 'Endurance history is not yet strong enough for the full planned dose.' : 'ประวัติ Endurance ยังไม่รองรับปริมาณเต็มตามแผน' },
    taper_quality: { badge: 'TAPER', title: en ? 'Keep quality short during taper' : 'รักษา Quality ให้สั้นในช่วง Taper', detail: en ? 'Preserve intensity without adding volume or vertical work.' : 'รักษาความคมโดยไม่เพิ่ม Volume หรือ Vertical' }
  };
  return map[item?.actionCode] || map.follow_plan;
}
function trailPrescriptionDetail(item, en) {
  const distance = item?.suggestedDistanceKm == null ? '' : `${formatNumber(item.suggestedDistanceKm,1)} km`;
  const vertical = item?.suggestedVerticalM == null ? '' : `+${formatNumber(item.suggestedVerticalM)} m`;
  const intensity = trailIntensityLabel(item?.intensityCode,en);
  return [intensity,distance,vertical].filter(Boolean).join(' · ');
}
function trailIntensityLabel(code,en) { const map={planned_quality:en?'Planned quality':'Quality ตามแผน',easy_controlled:en?'Easy / controlled':'Easy / คุมความหนัก',rest_only:en?'Rest only':'พัก',easy_until_checkin:en?'Easy until check-in':'Easy จนกว่า Check-in',recovery_only:en?'Very light recovery':'Recovery เบามาก',easy_aerobic:'Easy aerobic',controlled_quality:en?'Controlled quality':'Quality แบบคุม',easy_endurance:'Easy endurance',short_quality_no_extra:en?'Short quality, no extras':'Quality สั้น ไม่เพิ่มงาน'}; return map[code] || code || '—'; }
function dashboardRaceStatus(status,en){const map={no_race:en?'No race selected':'ยังไม่ได้เลือกสนาม',insufficient:en?'Building evidence':'กำลังสร้างหลักฐาน',building:en?'Building for this phase':'กำลังสร้างตาม Phase',on_track:en?'On track':'อยู่ในแนวทาง',watch:en?'Key gaps need attention':'มี Gap ที่ควรแก้'};return map[status]||status;}
function dashboardLongRunStatus(status,en){const map={ready:en?'Ready':'พร้อม',moderate:en?'Controlled':'ทำได้โดยต้องคุม',limited:en?'Limited':'ควรลด',not_ready:en?'Not ready':'ยังไม่พร้อม',stop:en?'Stop':'หยุด'};return map[status]||status;}
function dashboardElevationStatus(status,en){const map={no_data:en?'No recent load':'ยังไม่มีข้อมูล',spike:en?'Vertical spike':'Vertical เพิ่มเร็ว',watch:en?'Vertical rising':'Vertical กำลังเพิ่ม',mountain_specific:en?'Mountain-specific':'เฉพาะทางภูเขา',general:en?'General trail load':'โหลด Trail ทั่วไป'};return map[status]||status;}
function dashboardElevationScore(item){return Math.round(Math.max(0,Math.min(100,45+Math.min(35,item.climbDensityMPerKm/4)+(item.activeDays*5)-(item.status==='spike'?25:0))));}
function formatMinutes(minutes,en){const total=Math.max(0,Number(minutes)||0);const h=Math.floor(total/60);const m=total%60;return h?`${h}${en?'h':'ชม.'} ${m?`${m}${en?'m':'น.'}`:''}`.trim():`${m}${en?'m':'น.'}`;}


function renderMorningCoach({ morningCoach, trailCoach, today, en }) {
  const copy = morningCoachCopy(morningCoach.actionCode, en);
  const status = morningCoachStatus(morningCoach.status, en);
  const recommendation = morningCoachSession(morningCoach, en);
  const reasons = (morningCoach.reasons || [])
    .map(item => `<li>${escapeHtml(morningCoachReason(item, en))}</li>`)
    .join('');
  const missing = morningCoach.missing?.length
    ? `<div class="submetric">${en ? 'Data limits' : 'ข้อจำกัดของข้อมูล'}: ${escapeHtml(morningCoachMissing(morningCoach.missing, en))}</div>`
    : '';
  const primaryLabel = morningCoach.requiresCheckin
    ? (en ? 'Complete check-in' : 'ทำ Check-in')
    : morningCoach.primaryRoute === 'plan'
      ? (en ? 'Open today’s plan' : 'เปิดแผนวันนี้')
      : (en ? 'Open full coach' : 'เปิดคำแนะนำเต็ม');
  const primaryHref = `#/${morningCoach.primaryRoute || 'coach'}`;
  const planned = morningCoach.planned?.title || today?.plan?.todaySession?.t || (en ? 'Rest' : 'พัก');

  return `
  <section class="section morning-coach-section" data-morning-coach="v1">
    <div class="section-head">
      <div>
        <h2>${en ? 'Morning Coach' : 'โค้ชเช้านี้'}</h2>
        <small>${en ? 'Local decision engine · no cloud AI' : 'ประมวลผลในเครื่อง · ยังไม่ส่งข้อมูลไป AI ภายนอก'}</small>
      </div>
      <a href="#/coach">${en ? 'Evidence' : 'ดูเหตุผลเต็ม'}</a>
    </div>
    <article class="card">
      <div class="section-head">
        <div>
          <div class="card-title">${escapeHtml(status)}</div>
          <h3 style="margin:6px 0 4px">${escapeHtml(copy.title)}</h3>
          <div class="submetric">${escapeHtml(copy.detail)}</div>
        </div>
        <div class="metric compact">${morningCoach.confidence}<small>% ${en ? 'confidence' : 'ความมั่นใจ'}</small></div>
      </div>

      <div class="grid two" style="margin-top:14px">
        <div class="card flat">
          <div class="card-title">${en ? 'Planned' : 'แผนเดิม'}</div>
          <strong>${escapeHtml(String(planned))}</strong>
        </div>
        <div class="card flat">
          <div class="card-title">${en ? 'Coach recommendation' : 'คำแนะนำของโค้ช'}</div>
          <strong>${escapeHtml(recommendation)}</strong>
        </div>
      </div>

      ${reasons ? `
        <div style="margin-top:14px">
          <div class="card-title">${en ? 'Why' : 'เหตุผล'}</div>
          <ul class="clean-list" style="margin-top:8px">${reasons}</ul>
        </div>
      ` : ''}

      ${missing}
      ${morningCoach.hardStop ? `
        <div class="alert risk" style="margin-top:14px">
          ${en
            ? 'Pain or symptom safety signals override the training plan.'
            : 'สัญญาณ Pain หรืออาการผิดปกติมีอำนาจเหนือแผนซ้อมเสมอ'}
        </div>
      ` : ''}

      <div class="button-row" style="margin-top:16px">
        <a class="button primary" href="${primaryHref}">${escapeHtml(primaryLabel)}</a>
        <a class="button secondary" href="#/coach">${en ? 'Full coach analysis' : 'วิเคราะห์กับ Trail Coach'}</a>
      </div>
    </article>
  </section>
  `;
}

function morningCoachCopy(actionCode, en) {
  const map = {
    rest_assess: [
      en ? 'Rest and assess symptoms' : 'พักและประเมินอาการ',
      en ? 'Do not proceed with the planned workout until the safety check is clear.' : 'ยังไม่ควรทำตามแผน จนกว่าจะประเมินอาการด้านความปลอดภัยครบ'
    ],
    replace_easy_or_rest: [
      en ? 'Use recovery work or rest' : 'ทำ Recovery เบามากหรือพัก',
      en ? 'Current recovery does not support a demanding session.' : 'Recovery ปัจจุบันยังไม่รองรับการฝึกที่หนัก'
    ],
    check_in_first: [
      en ? 'Check in before hard training' : 'ทำ Check-in ก่อน Session หนัก',
      en ? 'Keep effort easy until pain, fatigue and soreness are confirmed.' : 'คุมความหนักไว้ระดับ Easy จนกว่าจะประเมิน Pain ความล้า และอาการล้า'
    ],
    replace_with_easy: [
      en ? 'Replace the hard session with easy work' : 'เปลี่ยน Session หนักเป็น Easy',
      en ? 'Choose easy aerobic running, walking or gentle mobility.' : 'เลือก Easy aerobic เดิน หรือ Mobility เบา ๆ'
    ],
    reduce_25: [
      en ? 'Reduce today’s load by about 25%' : 'ลดโหลดวันนี้ประมาณ 25%',
      en ? 'Shorten distance and vertical while keeping the effort easy.' : 'ลดระยะและ Vertical พร้อมคุมความหนักให้อยู่ระดับ Easy'
    ],
    cap_long_run: [
      en ? 'Shorten the long run' : 'ลด Long Run',
      en ? 'Endurance evidence does not yet support the full planned dose.' : 'หลักฐาน Endurance ยังไม่รองรับปริมาณเต็มตามแผน'
    ],
    reduce_15: [
      en ? 'Reduce today’s load by about 15%' : 'ลดโหลดวันนี้ประมาณ 15%',
      en ? 'Keep the session controlled and avoid adding extra intensity.' : 'คุม Session และไม่เพิ่มความหนักนอกแผน'
    ],
    taper_quality: [
      en ? 'Keep quality short during taper' : 'รักษา Quality ให้สั้นในช่วง Taper',
      en ? 'Preserve sharpness without adding volume or vertical work.' : 'รักษาความคมโดยไม่เพิ่ม Volume หรือ Vertical'
    ],
    follow_plan: [
      en ? 'Follow the planned session' : 'ทำตามแผนได้',
      en ? 'Current signals support the plan. Do not add unplanned intensity.' : 'สัญญาณปัจจุบันสนับสนุนแผน แต่ไม่ควรเพิ่มความหนักนอกแผน'
    ]
  };
  const [title, detail] = map[actionCode] || map.follow_plan;
  return { title, detail };
}

function morningCoachStatus(status, en) {
  const map = {
    red: en ? 'Protect recovery' : 'เน้นความปลอดภัยและการฟื้นตัว',
    yellow: en ? 'Train with control' : 'ซ้อมได้แบบควบคุม',
    green: en ? 'Ready within the plan' : 'พร้อมภายใต้กรอบแผน'
  };
  return map[status] || (en ? 'Building confidence' : 'กำลังประเมินข้อมูล');
}

function morningCoachSession(item, en) {
  const rec = item.recommendation || {};
  const parts = [rec.type || (en ? 'Rest' : 'พัก')];
  if (rec.distanceKm != null) parts.push(`${formatNumber(rec.distanceKm, 1)} km`);
  if (rec.verticalM != null) parts.push(`+${formatNumber(rec.verticalM)} m`);
  return parts.join(' · ');
}

function morningCoachReason(item, en) {
  const map = {
    pain_hard_stop: en ? 'Pain safety gate is active' : 'Pain Safety Gate ทำงาน',
    subjective_data_missing: en ? 'Subjective check-in is missing' : 'ยังไม่มี Subjective Check-in',
    recovery_low: en ? 'Recovery is low' : 'Recovery ต่ำ',
    pain_caution: en ? 'Pain requires caution' : 'ต้องเฝ้าระวัง Pain',
    load_risk: en ? 'Recent load is outside your normal range' : 'โหลดล่าสุดนอกช่วงปกติ',
    readiness_moderate: en ? 'Readiness is limited' : 'Readiness ยังจำกัด',
    recovery_not_full: en ? 'Recovery is not fully restored' : 'Recovery ยังไม่เต็ม',
    energy_low: en ? 'Energy availability looks low' : 'พลังงานที่พร้อมใช้ค่อนข้างต่ำ',
    vertical_spike: en ? 'Vertical load rose quickly' : 'Vertical loadเพิ่มเร็ว',
    signals_support_plan: en ? 'Current signals support the plan' : 'สัญญาณปัจจุบันสนับสนุนแผน',
    long_run_readiness_limited: en ? 'Long-run readiness is limited' : 'ความพร้อม Long Run ยังจำกัด',
    taper_window: en ? 'You are in the taper window' : 'อยู่ในช่วง Taper',
    insufficient_data: en ? 'More recent data is needed' : 'ต้องมีข้อมูลล่าสุดเพิ่ม'
  };
  const label = map[item.code] || item.code;
  if (item.value == null) return label;
  if (item.code === 'taper_window') return `${label}: ${formatNumber(item.value)} ${en ? 'days' : 'วัน'}`;
  if (item.code.includes('load') || item.code.includes('vertical')) {
    return `${label}: ${item.value > 0 ? '+' : ''}${formatNumber(item.value)}%`;
  }
  return `${label}: ${formatNumber(item.value)}/100`;
}

function morningCoachMissing(items, en) {
  const map = {
    subjective_checkin: en ? 'subjective check-in' : 'Subjective Check-in',
    readiness: 'Readiness',
    recovery: 'Recovery',
    fresh_recovery_metrics: en ? 'fresh sleep/RHR/HRV' : 'Sleep/RHR/HRV ที่เป็นข้อมูลล่าสุด'
  };
  return items.map(item => map[item] || item).join(' · ');
}
