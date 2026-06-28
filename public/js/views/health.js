import { selectToday, selectScoreHistory } from '../core/selectors.js';
import { selectAppleHealthInsights } from '../core/health-insights.js';
import { buildUnifiedInsights } from '../core/unified-insights.js';
import { energyBalanceForDate, nutritionTarget } from '../core/nutrition.js';
import { pageHeader, escapeHtml, formatNumber } from './components.js';
import { formatThaiDate } from '../core/date.js';

export function renderHealth(container, state, app) {
  const en = app.language === 'en';
  const range = [7, 28].includes(Number(app.ui.healthRange)) ? Number(app.ui.healthRange) : 7;
  const today = selectToday(state);
  const health = selectAppleHealthInsights(state, today.dateKey, range);
  const scoreHistory = selectScoreHistory(state, range, today.dateKey);
  const nutritionBalance = energyBalanceForDate(state, today.dateKey);
  const target = nutritionTarget(state, today.dateKey);
  const unified = buildUnifiedInsights({ today, health, scoreHistory, nutritionBalance, nutritionTarget: target });
  const recovery = unified.pillars.recovery;

  container.innerHTML = `
    ${pageHeader(en ? 'Health & recovery' : 'สุขภาพและการฟื้นตัว', formatThaiDate(today.dateKey), en ? 'Unified trends and explainable coaching' : 'แนวโน้มรวมและเหตุผลที่ตรวจสอบได้')}

    <section class="card health-detail-hero tone-${tone(recovery.score)}">
      <div class="health-detail-score"><span>${en ? 'Recovery' : 'Recovery'}</span><strong>${recovery.score == null ? '—' : formatNumber(recovery.score)}</strong><small>/100</small></div>
      <div class="health-detail-summary"><h2>${escapeHtml(recoveryHeadline(recovery.score, en))}</h2><p>${escapeHtml(recoverySummary(unified, en))}</p><div class="health-detail-meta"><span>${en ? 'Confidence' : 'ความมั่นใจ'} ${unified.readiness.confidence}%</span><span>${unified.coverage.healthDays}/${unified.coverage.totalDays} ${en ? 'days available' : 'วันที่มีข้อมูล'}</span><span>${unified.coverage.availableMetrics}/${unified.coverage.totalMetrics} metrics</span></div></div>
    </section>

    <section class="section">
      <div class="health-range-control" role="group" aria-label="${en ? 'Trend range' : 'ช่วงเวลาของแนวโน้ม'}">
        ${[7,28].map(days => `<button class="button ${range === days ? 'primary' : 'secondary'} compact" data-health-range="${days}">${days} ${en ? 'days' : 'วัน'}</button>`).join('')}
      </div>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>${en ? 'Recovery signals' : 'สัญญาณการฟื้นตัว'}</h2><small>${en ? 'Compared with your recent personal average' : 'เทียบกับค่าเฉลี่ยส่วนตัวล่าสุด'}</small></div><a href="#/scores">${en ? 'Score method' : 'หลักการให้คะแนน'}</a></div>
      <div class="health-detail-grid">
        ${metricDetailCard(findMetric(unified, 'sleepHours'), health.rows, range, en)}
        ${metricDetailCard(findMetric(unified, 'restingHr'), health.rows, range, en)}
        ${metricDetailCard(findMetric(unified, 'hrvMs'), health.rows, range, en)}
      </div>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>${en ? 'Daily movement' : 'การเคลื่อนไหวในชีวิตประจำวัน'}</h2><small>${en ? 'Context for strain and energy, not a duplicate workout total' : 'ใช้เป็นบริบทของ Strain และ Energy โดยไม่บวก Workout ซ้ำ'}</small></div></div>
      <div class="health-detail-grid">
        ${metricDetailCard(findMetric(unified, 'steps'), health.rows, range, en)}
        ${metricDetailCard(findMetric(unified, 'activeEnergyKcal'), health.rows, range, en)}
        ${metricDetailCard(findMetric(unified, 'walkingRunningDistanceKm'), health.rows, range, en)}
      </div>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>${en ? 'What changed today' : 'อะไรเป็นตัวขับผลวันนี้'}</h2><small>${en ? 'Contributors are descriptive, not a medical diagnosis' : 'เป็นการอธิบายแนวโน้ม ไม่ใช่การวินิจฉัยทางการแพทย์'}</small></div></div>
      <article class="card flat health-contributor-card">
        ${unified.contributors.length ? unified.contributors.map(item => contributorRow(item, en)).join('') : `<div class="empty">${en ? 'Not enough history to identify contributors.' : 'ประวัติยังไม่พอสำหรับระบุ Contributors'}</div>`}
      </article>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>${en ? 'Training context' : 'บริบทการฝึก'}</h2><small>${en ? 'Recovery only makes sense together with recent load and fueling' : 'Recovery ต้องอ่านร่วมกับโหลดฝึกและการเติมพลัง'}</small></div><a href="#/progress">${en ? 'Open progress' : 'เปิด Progress'}</a></div>
      <div class="grid three health-context-grid">
        ${contextCard(en ? 'Load balance' : 'สมดุลโหลด', unified.pillars.load.score, loadText(unified.pillars.load, en), unified.pillars.load.trend)}
        ${contextCard(en ? 'Energy & fuel' : 'พลังงานและการเติมพลัง', unified.pillars.energy.score, energyText(unified.pillars.energy, nutritionBalance, en), unified.pillars.energy.trend)}
        ${contextCard(en ? 'Readiness' : 'ความพร้อม', unified.readiness.score, readinessText(unified, en), unified.readiness.trend)}
      </div>
    </section>

    <section class="section">
      <article class="card flat data-quality-card">
        <div><div class="eyebrow">${en ? 'DATA QUALITY' : 'คุณภาพข้อมูล'}</div><h2>${qualityHeadline(unified.coverage.confidence, en)}</h2><p>${qualityCopy(unified, en)}</p></div>
        <div class="data-quality-score"><strong>${unified.coverage.confidence}%</strong><span>${en ? 'confidence' : 'ความมั่นใจ'}</span></div>
        <div class="button-row"><a class="button secondary" href="#/connections-home">${en ? 'Data & sync settings' : 'ตั้งค่าข้อมูลและการเชื่อมต่อ'}</a><a class="button ghost" href="#/today">${en ? 'Back to today' : 'กลับหน้าวันนี้'}</a></div>
      </article>
    </section>
  `;

  container.querySelectorAll('[data-health-range]').forEach(button => button.addEventListener('click', () => {
    app.ui.healthRange = Number(button.dataset.healthRange);
    app.render({ scrollTop: true });
  }));
}

function metricDetailCard(metric, rows, range, en) {
  if (!metric) return '';
  const values = rows.map(row => row[metric.key]);
  const formatted = formatMetric(metric, en);
  const delta = deltaText(metric, en);
  return `<article class="card flat health-detail-metric tone-${escapeHtml(metric.tone)}">
    <div class="health-detail-metric-head"><div><span>${escapeHtml(metricName(metric.key, en))}</span><small>${freshness(metric.date, en)}</small></div><i class="metric-tone-dot ${escapeHtml(metric.tone)}"></i></div>
    <div class="health-detail-value">${formatted.value}<small>${formatted.unit}</small></div>
    <div class="health-detail-delta ${escapeHtml(metric.tone)}">${escapeHtml(delta)}</div>
    ${lineChart(values, range, metric.tone)}
    <div class="health-detail-baseline"><span>${en ? 'Recent average' : 'ค่าเฉลี่ยล่าสุด'}</span><strong>${formatBaseline(metric, en)}</strong></div>
  </article>`;
}

function lineChart(values, range, toneName) {
  const normalized = values.map(value => Number.isFinite(Number(value)) ? Number(value) : null);
  const actual = normalized.filter(value => value != null);
  if (!actual.length) return '<div class="health-chart-empty">—</div>';
  const width = 320;
  const height = 120;
  const padX = 8;
  const padY = 12;
  const min = Math.min(...actual);
  const max = Math.max(...actual);
  const spread = max - min || Math.max(1, Math.abs(max) * 0.1);
  const step = normalized.length > 1 ? (width - padX * 2) / (normalized.length - 1) : width - padX * 2;
  const points = normalized.map((value, index) => value == null ? null : `${(padX + index * step).toFixed(1)},${(height - padY - ((value - min) / spread) * (height - padY * 2)).toFixed(1)}`).filter(Boolean).join(' ');
  const dots = normalized.map((value, index) => value == null ? '' : `<circle cx="${(padX + index * step).toFixed(1)}" cy="${(height - padY - ((value - min) / spread) * (height - padY * 2)).toFixed(1)}" r="2.4"/>`).join('');
  return `<svg class="health-line-chart tone-${escapeHtml(toneName)}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${range}-day trend"><line x1="0" y1="${height-1}" x2="${width}" y2="${height-1}"/><polyline points="${points}"/>${dots}</svg>`;
}

function contextCard(title, score, text, trend) {
  return `<article class="card flat health-context-card"><div class="card-title">${escapeHtml(title)}</div><div class="metric">${score == null ? '—' : formatNumber(score)}${score == null ? '' : '<small>/100</small>'}</div><div class="submetric">${escapeHtml(text)}</div>${smallSpark(trend)}</article>`;
}
function smallSpark(values = []) {
  const actual = values.map(value => Number.isFinite(Number(value)) ? Number(value) : null);
  const finiteValues = actual.filter(value => value != null);
  if (!finiteValues.length) return '<div class="context-spark-empty"></div>';
  const min = Math.min(...finiteValues); const max = Math.max(...finiteValues); const spread = max - min || 1;
  const width = 120; const height = 32; const step = actual.length > 1 ? width / (actual.length - 1) : width;
  const points = actual.map((value,index) => value == null ? null : `${index*step},${height-3-((value-min)/spread)*(height-6)}`).filter(Boolean).join(' ');
  return `<svg class="context-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}"/></svg>`;
}

function contributorRow(item, en) {
  return `<div class="health-contributor-row ${escapeHtml(item.tone)}"><span>${item.tone === 'good' ? '✓' : item.tone === 'risk' ? '!' : '↗'}</span><div><strong>${escapeHtml(contributorName(item.code, en))}</strong><small>${escapeHtml(contributorValue(item, en))}</small></div></div>`;
}
function contributorName(code, en) {
  const map = {
    short_sleep:[en ? 'Sleep below six hours' : 'การนอนต่ำกว่า 6 ชั่วโมง'],
    sleep_below_baseline:[en ? 'Sleep below recent average' : 'การนอนต่ำกว่าค่าเฉลี่ยล่าสุด'],
    sleep_supportive:[en ? 'Sleep supports recovery' : 'การนอนสนับสนุน Recovery'],
    rhr_elevated:[en ? 'Resting HR is elevated' : 'Resting HR สูงกว่าค่าเฉลี่ย'],
    rhr_below_baseline:[en ? 'Resting HR is below baseline' : 'Resting HR ต่ำกว่า Baseline'],
    hrv_suppressed:[en ? 'HRV is suppressed' : 'HRV ต่ำกว่า Baseline'],
    hrv_supportive:[en ? 'HRV supports recovery' : 'HRV สนับสนุน Recovery'],
    load_outside_range:[en ? 'Load is outside your usual range' : 'โหลดฝึกนอกช่วงปกติ'],
    load_changing:[en ? 'Load is changing' : 'โหลดฝึกกำลังเปลี่ยน'],
    load_balanced:[en ? 'Load is balanced' : 'โหลดฝึกสมดุล'],
    pain_hard_stop:[en ? 'Pain safety gate' : 'Pain Safety Gate'],
    pain_caution:[en ? 'Pain caution' : 'เฝ้าระวังอาการเจ็บ'],
    large_energy_deficit:[en ? 'Large energy deficit' : 'Calories Deficit ค่อนข้างสูง']
  };
  return map[code]?.[0] || code;
}
function contributorValue(item, en) {
  if (item.delta != null) return `${item.delta > 0 ? '+' : ''}${formatNumber(item.delta,1)} ${en ? 'vs recent average' : 'เทียบค่าเฉลี่ยล่าสุด'}`;
  if (item.value != null) return `${item.value > 0 ? '+' : ''}${formatNumber(item.value)}${item.code.includes('load') ? '%' : ''}`;
  return en ? 'Included in the current recommendation' : 'ใช้ประกอบคำแนะนำปัจจุบัน';
}
function findMetric(unified, key) { return unified.metrics.find(item => item.key === key); }
function metricName(key, en) { return ({sleepHours:en?'Sleep':'การนอน',restingHr:'Resting HR',hrvMs:'HRV',steps:en?'Steps':'ก้าว',activeEnergyKcal:en?'Active energy':'พลังงานกิจกรรม',walkingRunningDistanceKm:en?'Walk + run':'เดิน + วิ่ง'})[key] || key; }
function formatMetric(metric, en) {
  if (metric.value == null) return { value:'—', unit:'' };
  if (metric.key === 'sleepHours') { const total = Math.round(metric.value*60); return { value:`${Math.floor(total/60)}${en?'h':'ชม.'} ${total%60}${en?'m':'น.'}`, unit:'' }; }
  if (metric.key === 'restingHr') return { value:formatNumber(metric.value), unit:' bpm' };
  if (metric.key === 'hrvMs') return { value:formatNumber(metric.value), unit:' ms' };
  if (metric.key === 'activeEnergyKcal') return { value:formatNumber(metric.value), unit:' kcal' };
  if (metric.key === 'walkingRunningDistanceKm') return { value:formatNumber(metric.value,2), unit:' km' };
  return { value:formatNumber(metric.value), unit:'' };
}
function formatBaseline(metric, en) {
  if (metric.baseline == null) return '—';
  const clone = { ...metric, value: metric.baseline };
  return `${formatMetric(clone,en).value}${formatMetric(clone,en).unit}`;
}
function deltaText(metric, en) {
  if (metric.value == null) return en ? 'No data yet' : 'ยังไม่มีข้อมูล';
  if (metric.delta == null) return en ? 'Building your personal baseline' : 'กำลังสร้าง Baseline ส่วนตัว';
  const sign = metric.delta > 0 ? '+' : '';
  const unit = metric.key === 'sleepHours' ? (en?'h':'ชม.') : metric.key === 'restingHr' ? 'bpm' : metric.key === 'hrvMs' ? 'ms' : metric.key === 'activeEnergyKcal' ? 'kcal' : metric.key === 'walkingRunningDistanceKm' ? 'km' : '';
  return `${sign}${formatNumber(metric.delta, metric.key === 'walkingRunningDistanceKm' || metric.key === 'sleepHours' ? 1 : 0)} ${unit} ${en ? 'vs recent average' : 'เทียบค่าเฉลี่ยล่าสุด'}`;
}
function freshness(date, en) { if (!date) return en?'No data':'ไม่มีข้อมูล'; const parsed = new Date(`${date}T00:00:00`); return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString(en?'en-GB':'th-TH',{day:'numeric',month:'short'}); }
function recoveryHeadline(score, en) { if (score == null) return en?'Building your baseline':'กำลังสร้าง Baseline'; if (score>=75) return en?'Recovery is supportive':'การฟื้นตัวอยู่ในระดับดี'; if (score>=50) return en?'Recovery is moderate':'การฟื้นตัวอยู่ในระดับปานกลาง'; return en?'Recovery needs attention':'การฟื้นตัวยังต้องดูแล'; }
function recoverySummary(unified, en) { const risks=unified.contributors.filter(item=>item.tone==='risk').length; const watches=unified.contributors.filter(item=>item.tone==='watch').length; if(risks) return en?'One or more recovery signals are outside your recent range. Keep today easy and review symptoms.':'มีสัญญาณ Recovery บางรายการนอกช่วงล่าสุด ควรลดความหนักและประเมินอาการ'; if(watches) return en?'Recovery is usable, but one or more signals need monitoring.':'Recovery ยังใช้ประกอบการฝึกได้ แต่มีบางสัญญาณที่ควรติดตาม'; return en?'Current signals are broadly aligned with your recent baseline.':'สัญญาณปัจจุบันโดยรวมสอดคล้องกับ Baseline ล่าสุด'; }
function loadText(load,en){ if(load.weekChangePct==null)return en?'Building load history':'กำลังสร้างประวัติโหลด'; return `${load.weekChangePct>0?'+':''}${formatNumber(load.weekChangePct)}% ${en?'vs last week':'เทียบสัปดาห์ก่อน'}`; }
function energyText(energy,balance,en){ if(balance?.foodComplete)return `${en?'Balance':'สมดุล'} ${balance.netKcal>0?'+':''}${formatNumber(balance.netKcal)} kcal`; return energy.score==null?(en?'Not enough data':'ข้อมูลยังไม่พอ'):(en?'Estimated from recovery and movement':'ประเมินจาก Recovery และการเคลื่อนไหว'); }
function readinessText(unified,en){ return `${en?'Confidence':'ความมั่นใจ'} ${unified.readiness.confidence}% · ${unified.readiness.score==null?(en?'check-in needed':'ควรทำ Check-in'):(en?'current estimate':'ค่าประเมินปัจจุบัน')}`; }
function qualityHeadline(score,en){ if(score>=75)return en?'Strong coverage':'ข้อมูลครอบคลุมดี'; if(score>=45)return en?'Usable with some gaps':'ใช้วิเคราะห์ได้แต่ยังมีช่องว่าง'; return en?'Keep collecting data':'ควรเก็บข้อมูลเพิ่ม'; }
function qualityCopy(unified,en){ const missing=unified.metrics.filter(item=>item.value==null).map(item=>metricName(item.key,en)); if(!missing.length)return en?'All core health metrics are available. Continue daily sync to strengthen trends.':'Core Metrics ครบแล้ว ควร Sync ต่อเนื่องเพื่อให้แนวโน้มแม่นขึ้น'; return `${en?'Missing or stale':'ยังขาดหรือไม่สดใหม่'}: ${missing.join(', ')}`; }
function tone(score){return score==null?'neutral':score>=75?'good':score>=50?'watch':'risk';}
