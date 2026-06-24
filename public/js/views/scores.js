import { selectScoreHistory, selectToday } from '../core/selectors.js';
import { pageHeader, escapeHtml, formatNumber, statusBadge } from './components.js';
import { formatThaiDate } from '../core/date.js';

const DRIVER_LABELS = {
  sleepHours: 'ชั่วโมงนอน',
  sleepQuality: 'คุณภาพการนอน',
  restingHr: 'Resting HR',
  hrv: 'HRV',
  fatigue: 'ความล้า',
  stress: 'ความเครียด',
  muscleSoreness: 'กล้ามเนื้อล้า',
  recentStrain: 'โหลดสะสม 1–3 วัน',
  painSafety: 'Pain Safety Gate',
  loadTrend: 'แนวโน้มโหลด 7 วัน'
};

export function renderScores(container, state) {
  const today = selectToday(state);
  const history = selectScoreHistory(state, 14, today.dateKey);
  const readiness = today.readiness;
  const recovery = today.recovery;
  const strain = today.strain;

  container.innerHTML = `
    ${pageHeader('Strain & Recovery', 'คะแนนช่วยตัดสินใจ ไม่ใช่การวินิจฉัย และ Pain Safety Gate มีสิทธิ์เหนือคะแนนเสมอ', 'Adaptive load intelligence')}

    <section class="score-ring-grid large">
      ${scoreCard('STRAIN', strain.score, 21, strain.normalizedScore, strainColor(strain.score), `${strain.classification.label} · ${strain.totalLoad} load units`, strain.confidence)}
      ${scoreCard('RECOVERY', recovery?.score, 100, recovery?.score || 0, recoveryColor(recovery?.score), recovery ? recoverySummary(recovery) : 'ต้องมี Daily Check-in', recovery?.confidence || 0)}
      ${scoreCard('READINESS', readiness?.score, 100, readiness?.score || 0, readinessColor(readiness?.status), readiness ? readinessSummary(readiness) : 'กรอก Pain / Fatigue ก่อนซ้อม', readiness?.confidence || 0)}
    </section>

    <section class="section">
      <div class="section-head"><h2>แนวโน้ม 14 วัน</h2><span>Strain 0–21 · Recovery/Readiness 0–100</span></div>
      <article class="card flat score-history">
        <div class="score-legend"><span><i class="strain"></i>Strain</span><span><i class="recovery"></i>Recovery</span><span><i class="readiness"></i>Readiness</span></div>
        <div class="score-chart">${history.map(day => historyColumn(day)).join('')}</div>
      </article>
    </section>

    <section class="section">
      <div class="section-head"><h2>เหตุผลของ Recovery วันนี้</h2><span>${recovery ? `Baseline RHR ${recovery.baseline.restingHr ?? '—'} · HRV ${recovery.baseline.hrvMs ?? '—'}` : 'ยังไม่มีข้อมูล'}</span></div>
      <div class="list">${recovery?.drivers?.length ? recovery.drivers.slice(0, 7).map(driverRow).join('') : '<div class="card flat empty">Sync Apple Health หรือกรอก Sleep, RHR, HRV และความล้าเพื่อสร้างคะแนน</div>'}</div>
    </section>

    <section class="section">
      <div class="section-head"><h2>ความพร้อมของ Baseline</h2><span>ระบบจะเสถียรขึ้นเมื่อมีข้อมูลต่อเนื่อง</span></div>
      <article class="card flat">
        <div class="baseline-grid">
          ${baselineMetric('Sleep', recovery?.baseline?.sleepDays || 0, 14)}
          ${baselineMetric('Resting HR', recovery?.baseline?.restingHrDays || 0, 14)}
          ${baselineMetric('HRV', recovery?.baseline?.hrvDays || 0, 21)}
        </div>
        <div class="callout" style="margin-top:14px">ช่วง 14–21 วันแรก คะแนนจะมี Data Confidence ต่ำกว่าปกติ ระบบจะแสดงเหตุผลและไม่ตีความค่าจากวันเดียวเกินจริง</div>
      </article>
    </section>

    <section class="section">
      <div class="section-head"><h2>คะแนนคิดจากอะไร</h2></div>
      <div class="grid three">
        <article class="card flat"><div class="card-title">Strain 0–21</div><strong>Workout + Behavior</strong><div class="submetric">Duration × RPE หรือ HR, ระยะ, Gain/Loss, Trail, Night, Steps, Active Energy และ Exercise Minutes</div></article>
        <article class="card flat"><div class="card-title">Recovery 0–100</div><strong>ฟื้นตัวเทียบ Baseline</strong><div class="submetric">Sleep, RHR, HRV, Fatigue, Stress, Soreness และ Strain 1–3 วันก่อน</div></article>
        <article class="card flat"><div class="card-title">Readiness 0–100</div><strong>พร้อมกับงานวันนี้หรือไม่</strong><div class="submetric">Recovery + Pain Safety Gate + แนวโน้มโหลด หาก Pain ≥6 ระบบบังคับ Red</div></article>
      </div>
    </section>

    ${readiness ? `<section class="section"><div class="callout ${readiness.status === 'red' ? 'danger' : readiness.status === 'green' ? 'good' : ''}"><strong>${escapeHtml(readinessSummary(readiness))}</strong><br>ข้อมูลวันนี้: ${readiness.confidence}% confidence · ${escapeHtml(readiness.flags.length ? readiness.flags.map(flagLabel).join(' · ') : 'ไม่มีสัญญาณเตือนเพิ่มเติม')}</div></section>` : ''}
  `;
}

function scoreCard(label, value, max, normalized, color, subtitle, confidence) {
  return `<article class="score-ring-card card"><div class="ring" style="--value:${Math.max(0, normalized || 0)};--ring-color:${color}"><div class="ring-content"><strong>${value == null ? '—' : formatNumber(value, max === 21 ? 1 : 0)}</strong><small>/${max}</small></div></div><div class="score-ring-text"><strong>${label}</strong><span>${escapeHtml(subtitle)}</span><small>Data confidence ${confidence}%</small></div></article>`;
}

function historyColumn(day) {
  const strainHeight = Math.max(2, (Number(day.strain) || 0) / 21 * 100);
  const recoveryHeight = day.recovery == null ? 2 : Math.max(2, day.recovery);
  const readinessHeight = day.readiness == null ? 2 : Math.max(2, day.readiness);
  const label = formatThaiDate(day.date).split(' ')[0];
  return `<div class="score-day" title="${escapeHtml(day.date)} · Strain ${day.strain} · Recovery ${day.recovery ?? '—'} · Readiness ${day.readiness ?? '—'}"><div class="score-bars"><i class="strain" style="height:${strainHeight}%"></i><i class="recovery" style="height:${recoveryHeight}%"></i><i class="readiness" style="height:${readinessHeight}%"></i></div><small>${escapeHtml(label)}</small></div>`;
}

function driverRow(driver) {
  const label = DRIVER_LABELS[driver.key] || driver.key;
  const direction = driver.direction === 'positive' ? 'green' : driver.direction === 'negative' ? 'red' : 'neutral';
  const icon = driver.direction === 'positive' ? '↑' : driver.direction === 'negative' ? '↓' : '•';
  const detail = driverDetail(driver);
  return `<article class="list-item"><span class="driver-icon ${direction}">${icon}</span><div class="grow"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></div><span class="status ${direction}">${driver.impact > 0 ? '+' : ''}${formatNumber(driver.impact,1)}</span></article>`;
}

function driverDetail(driver) {
  if (driver.key === 'sleepHours') return `${driver.value} ชม. · เป้าหมาย ${driver.baseline ?? '—'} ชม.`;
  if (driver.key === 'restingHr') return `${driver.value} bpm · baseline ${formatNumber(driver.baseline,1)} · ${formatDelta(driver.deltaPct)}%`;
  if (driver.key === 'hrv') return `${driver.value} ms · baseline ${formatNumber(driver.baseline,1)} · ${formatDelta(driver.deltaPct)}%`;
  if (driver.key === 'recentStrain') return `Strain ${formatNumber(driver.value,1)}/21`;
  if (['fatigue','stress','muscleSoreness','sleepQuality'].includes(driver.key)) return `${driver.value}/5`;
  return `ค่า ${formatNumber(driver.value,1)}`;
}

function baselineMetric(label, value, target) {
  const pct = Math.min(100, value / target * 100);
  return `<div><div class="card-title">${escapeHtml(label)}</div><div class="metric" style="font-size:25px">${value}<small>/ ${target} วัน</small></div><div class="progress" style="margin-top:9px"><span style="width:${pct}%;background:${pct >= 100 ? 'var(--green)' : 'var(--blue)'}"></span></div></div>`;
}

function recoverySummary(recovery) {
  return recovery.score >= 75 ? 'ฟื้นตัวดี' : recovery.score >= 50 ? 'ฟื้นตัวปานกลาง' : 'ฟื้นตัวยังไม่พอ';
}
function readinessSummary(readiness) {
  return readiness.status === 'green' ? 'พร้อมซ้อมตามแผน' : readiness.status === 'yellow' ? 'ลดระยะหรือความหนัก' : 'พักและประเมินอาการ';
}
function strainColor(score) { return score >= 17 ? 'var(--red)' : score >= 13 ? 'var(--amber)' : score >= 8 ? 'var(--blue)' : 'var(--mint)'; }
function recoveryColor(score) { return score == null ? 'var(--blue)' : score >= 75 ? 'var(--green)' : score >= 50 ? 'var(--amber)' : 'var(--red)'; }
function readinessColor(status) { return status === 'green' ? 'var(--green)' : status === 'yellow' ? 'var(--amber)' : status === 'red' ? 'var(--red)' : 'var(--blue)'; }
function formatDelta(value) { return value == null ? '—' : `${value > 0 ? '+' : ''}${formatNumber(value,1)}`; }
function flagLabel(flag) { return String(flag).replaceAll('_', ' '); }
