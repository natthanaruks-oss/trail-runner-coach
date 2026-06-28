import { selectRaceCountdown, selectToday, selectWeekSummary, selectRecentActivities } from '../core/selectors.js';
import { selectAppleHealthInsights } from '../core/health-insights.js';
import { recommendSession } from '../engines/recommendation.js';
import { formatNumber, metricCard, pageHeader, statusBadge, escapeHtml } from './components.js';
import { formatThaiDate } from '../core/date.js';
import { raceSummary } from '../core/races.js';
import { foodTotals, nutritionTarget, dailyWaterTargetMl } from '../core/nutrition.js';
import { STORES } from '../core/constants.js';
import { nowIso } from '../core/date.js';
import { syncProviderNow } from '../adapters/sync-manager.js';
import { autoPullAppleHealth, latestAppleHealthProviderState, shouldAutoPullAppleHealth } from '../core/apple-health-auto-pull.js';

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
  const health = selectAppleHealthInsights(state, today.dateKey, 7);
  const en = app.language === 'en';
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

    ${renderAppleHealthSummary(health, today, en)}

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
  container.querySelector('[data-dashboard-apple-sync]')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = en ? 'Pulling…' : 'กำลังดึง…';
    setDashboardAppleStatus(container, en ? 'Pulling the latest Apple Health data…' : 'กำลังดึงข้อมูล Apple Health ล่าสุด…');
    try {
      const result = await syncProviderNow(app.store, 'apple_health', { days: 90, trigger: 'dashboard_manual', resetRetry: true });
      const count = Number(result?.result?.checkins || 0);
      app.toast(en ? `Apple Health updated: ${count} day(s)` : `อัปเดต Apple Health แล้ว ${count} วัน`);
      app.render();
    } catch (error) {
      const message = error.message || (en ? 'Apple Health sync failed' : 'ดึง Apple Health ไม่สำเร็จ');
      setDashboardAppleStatus(container, message, true);
      app.toast(message);
      button.disabled = false;
      button.textContent = en ? 'Pull latest' : 'ดึงข้อมูลล่าสุด';
    }
  });

  scheduleDashboardAppleAutoPull(container, state, app, health, en);
}

function renderAppleHealthSummary(health, today, en) {
  const metricDefinitions = [
    ['steps', en ? 'Steps' : 'ก้าว', '', 'Strain'],
    ['activeEnergyKcal', en ? 'Active energy' : 'พลังงานกิจกรรม', 'kcal', en ? 'Calories' : 'แคลอรี'],
    ['exerciseMinutes', en ? 'Exercise' : 'เวลาออกกำลัง', en ? 'min' : 'นาที', 'Strain'],
    ['walkingRunningDistanceKm', en ? 'Walk + run' : 'เดิน + วิ่ง', 'km', en ? 'Context' : 'บริบท'],
    ['sleepHours', en ? 'Sleep' : 'การนอน', en ? 'h' : 'ชม.', 'Recovery'],
    ['restingHr', 'Resting HR', 'bpm', 'Recovery'],
    ['hrvMs', 'HRV', 'ms', 'Recovery']
  ];
  const syncText = health.lastImportedAt
    ? `${en ? 'Updated' : 'อัปเดต'} ${formatHealthTimestamp(health.lastImportedAt, en)}`
    : (en ? 'No imported data yet' : 'ยังไม่มีข้อมูลที่นำเข้า');
  const behavior = today.strain.behaviorLoad;
  const recovery = today.recovery;
  const energy = health.nutrition;
  const balance = energy.balance;
  const sourceText = health.wearable?.transport === 'health_auto_export'
    ? 'Health Auto Export'
    : health.wearable?.transport === 'shortcuts_bridge'
      ? 'Apple Shortcuts'
      : health.wearable?.transport === 'healthkit' ? 'HealthKit' : 'Apple Health';
  const healthHeading = health.isCurrentDay
    ? (en ? 'Apple Health today' : 'Apple Health วันนี้')
    : (en ? 'Latest Apple Health' : 'Apple Health ล่าสุด');

  return `<section class="section health-summary-section">
    <div class="section-head"><h2>${healthHeading}</h2><span>${escapeHtml(syncText)}</span></div>
    <article class="card flat health-summary-card ${health.hasData ? 'has-data' : ''}">
      <div class="health-summary-toolbar">
        <div><span class="status ${health.hasData ? 'green' : 'yellow'}">${health.hasData ? (en ? 'Data received' : 'รับข้อมูลแล้ว') : (en ? 'Waiting for shortcut' : 'รอข้อมูลจาก Shortcut')}</span><small>${escapeHtml(sourceText)}</small></div>
        <div class="button-row"><button class="button secondary compact" type="button" data-dashboard-apple-sync>${en ? 'Pull latest' : 'ดึงข้อมูลล่าสุด'}</button><a class="button ghost compact" href="#/apple-health-shortcut">${en ? 'Manage' : 'จัดการ'}</a></div>
      </div>
      <div class="wizard-status submetric ${health.hasData ? 'success' : ''}" data-dashboard-apple-status>${dashboardAppleStatusText(health, en)}</div>
      <div class="health-metric-grid">
        ${metricDefinitions.map(([key, label, unit, usedBy]) => healthMetricCard(label, health.metrics[key], unit, usedBy, en)).join('')}
      </div>
      <div class="health-impact-grid">
        ${healthImpactCard(
          en ? 'Daily movement → Strain' : 'การเคลื่อนไหว → Strain',
          behavior?.score == null ? '—' : `${formatNumber(behavior.score)}/100`,
          behavior?.score == null
            ? (en ? 'Add Steps, Active Energy or Exercise Minutes.' : 'เพิ่ม Steps, Active Energy หรือ Exercise Minutes')
            : `${en ? 'Adds' : 'เพิ่ม'} ${formatNumber(today.strain.behaviorContribution21, 1)} / 21 ${en ? 'to daily strain' : 'เข้า Daily Strain'}`,
          behavior?.score == null ? 'neutral' : behavior.score >= 85 ? 'yellow' : 'green'
        )}
        ${healthImpactCard(
          en ? 'Sleep & vitals → Recovery' : 'การนอนและชีพจร → Recovery',
          `${health.recoveryAvailable}/${health.recoveryTotal}`,
          recovery?.score == null
            ? (en ? 'Build Sleep, RHR and HRV history for a recovery score.' : 'เก็บ Sleep, RHR และ HRV เพื่อสร้าง Recovery Score')
            : `${en ? 'Recovery' : 'Recovery'} ${formatNumber(recovery.score)}/100 · ${en ? 'confidence' : 'ความมั่นใจ'} ${recovery.confidence}%`,
          recovery?.score == null ? 'neutral' : recovery.score >= 75 ? 'green' : recovery.score >= 50 ? 'yellow' : 'red'
        )}
        ${healthImpactCard(
          en ? 'Active energy → Fuel target' : 'Active Energy → เป้าพลังงาน',
          energy.usesAppleActiveEnergy ? `${formatNumber(energy.target.activeEnergyKcal)} kcal` : '—',
          energy.usesAppleActiveEnergy
            ? (balance.foodComplete
              ? `${en ? 'Current balance' : 'สมดุลปัจจุบัน'} ${signedKcal(balance.netKcal)}`
              : `${en ? 'Used in today’s' : 'ใช้กำหนดเป้า'} ${formatNumber(energy.target.kcal)} kcal ${en ? 'fuel target' : 'วันนี้'}`)
            : (en ? 'Using training estimate until Active Energy arrives.' : 'ใช้ค่าประมาณจากแผนซ้อมจนกว่าจะมี Active Energy'),
          energy.usesAppleActiveEnergy ? 'green' : 'neutral'
        )}
      </div>
      ${health.hasData ? `<div class="health-trend-line"><strong>${en ? '7-day view' : 'ภาพรวม 7 วัน'}</strong><span>${health.trend.coverageDays}/${health.trend.days} ${en ? 'days with Apple Health data' : 'วันที่มีข้อมูล Apple Health'} · ${en ? 'average steps' : 'ก้าวเฉลี่ย'} ${health.trend.averages.steps == null ? '—' : formatNumber(health.trend.averages.steps)}</span></div>` : `<div class="callout section">${en ? 'Run the Shortcut, then tap Pull latest. Steps affect Strain; Sleep, RHR and HRV affect Recovery; Active Energy affects the calorie target.' : 'รัน Shortcut แล้วกดดึงข้อมูลล่าสุด: Steps ใช้กับ Strain, Sleep/RHR/HRV ใช้กับ Recovery และ Active Energy ใช้กับเป้าแคลอรี'}</div>`}
    </article>
  </section>`;
}

function healthMetricCard(label, value, unit, usedBy, en) {
  const available = value != null;
  const decimals = ['km', 'h', 'ชม.'].includes(unit) ? 1 : 0;
  return `<div class="health-metric ${available ? 'available' : 'missing'}"><div class="health-metric-head"><span>${escapeHtml(label)}</span><i>${escapeHtml(usedBy)}</i></div><strong>${available ? formatNumber(value, decimals) : '—'}${available && unit ? `<small>${escapeHtml(unit)}</small>` : ''}</strong><em>${available ? (en ? 'Apple Health' : 'จาก Apple Health') : (en ? 'Not received' : 'ยังไม่มีข้อมูล')}</em></div>`;
}

function healthImpactCard(label, value, detail, status) {
  return `<div class="health-impact"><span class="status ${status}">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></div>`;
}

function formatHealthTimestamp(value, en) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '—');
  return date.toLocaleString(en ? 'en-GB' : 'th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function signedKcal(value) {
  const number = Number(value) || 0;
  return `${number > 0 ? '+' : ''}${formatNumber(number)} kcal`;
}

function scoreRing({ label, value, max, normalized, color, sub }) {
  const display = value == null ? '—' : formatNumber(value, max === 21 ? 1 : 0);
  return `<article class="score-ring-card card flat"><div class="ring small" style="--value:${Math.max(0, normalized || 0)};--ring-color:${color}"><div class="ring-content"><strong>${display}</strong><small>/${max}</small></div></div><div class="score-ring-text"><strong>${label}</strong><span>${escapeHtml(sub)}</span></div></article>`;
}


function dashboardAppleStatusText(health, en) {
  if (health.hasData) {
    return en
      ? `Local app has ${health.trend.coverageDays} Apple Health day(s). Showing ${health.metricDate || health.dateKey}.`
      : `แอปมีข้อมูล Apple Health ${health.trend.coverageDays} วัน · แสดงข้อมูลวันที่ ${health.metricDate || health.dateKey}`;
  }
  return en
    ? 'The shortcut can store data in the Worker, but this browser must pull it into the app.'
    : 'Shortcut เก็บข้อมูลไว้ที่ Worker แล้ว แต่ Browser นี้ต้องดึงข้อมูลเข้ามาในแอป';
}

function setDashboardAppleStatus(container, message, error = false) {
  const element = container.querySelector('[data-dashboard-apple-status]');
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('error', error);
  element.classList.toggle('success', !error);
}

function scheduleDashboardAppleAutoPull(container, state, app, health, en) {
  if (!shouldAutoPullAppleHealth(state, health)) return;
  const provider = latestAppleHealthProviderState(state);
  const button = container.querySelector('[data-dashboard-apple-sync]');
  if (button) {
    button.disabled = true;
    button.textContent = en ? 'Pulling…' : 'กำลังดึง…';
  }
  setDashboardAppleStatus(container, en ? 'Automatically checking the Apple Health bridge…' : 'กำลังตรวจและดึงข้อมูล Apple Health อัตโนมัติ…');
  queueMicrotask(async () => {
    try {
      const result = await autoPullAppleHealth(app, { days: 90, trigger: 'dashboard_auto' });
      const count = Number(result?.result?.checkins || 0);
      if (count > 0) {
        app.toast(en ? `Apple Health imported: ${count} day(s)` : `นำเข้า Apple Health แล้ว ${count} วัน`);
        app.render();
        return;
      }
      setDashboardAppleStatus(container, en ? 'The bridge responded, but it contains no supported daily data.' : 'Worker ตอบกลับแล้ว แต่ยังไม่มี Daily Metric ที่รองรับ', true);
    } catch (error) {
      const message = error?.message || provider?.lastError || (en ? 'Automatic Apple Health pull failed' : 'ดึง Apple Health อัตโนมัติไม่สำเร็จ');
      setDashboardAppleStatus(container, message, true);
    } finally {
      if (button?.isConnected) {
        button.disabled = false;
        button.textContent = en ? 'Pull latest' : 'ดึงข้อมูลล่าสุด';
      }
    }
  });
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
