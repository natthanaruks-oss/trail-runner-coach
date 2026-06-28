import { selectToday, selectScoreHistory } from '../core/selectors.js';
import { selectAppleHealthInsights } from '../core/health-insights.js';
import { buildUnifiedInsights } from '../core/unified-insights.js';
import { buildPersonalTrends, PERSONAL_TREND_RANGES } from '../core/personal-trends.js';
import { energyBalanceForDate, nutritionTarget } from '../core/nutrition.js';
import { pageHeader, escapeHtml, formatNumber } from './components.js';
import { formatThaiDate } from '../core/date.js';

export function renderHealth(container, state, app) {
  const en = app.language === 'en';
  const range = PERSONAL_TREND_RANGES.includes(Number(app.ui.healthRange)) ? Number(app.ui.healthRange) : 28;
  const today = selectToday(state);
  const health = selectAppleHealthInsights(state, today.dateKey, range);
  const scoreHistory = selectScoreHistory(state, range, today.dateKey);
  const nutritionBalance = energyBalanceForDate(state, today.dateKey);
  const target = nutritionTarget(state, today.dateKey);
  const unified = buildUnifiedInsights({ today, health, scoreHistory, nutritionBalance, nutritionTarget: target });
  const trends = buildPersonalTrends({
    healthRows: health.rows,
    activities: state.activities,
    endDateKey: today.dateKey,
    rangeDays: range,
    sleepTargetHours: state.settings?.athlete?.sleepTargetHours
  });
  const recovery = unified.pillars.recovery;
  const selectedMetricKey = ['sleepHours','restingHr','hrvMs'].includes(app.ui.healthMetric) ? app.ui.healthMetric : null;
  const confidence = Math.round((unified.coverage.confidence + trends.confidence) / 2);

  container.innerHTML = `
    ${pageHeader(en ? 'Health & recovery' : 'สุขภาพและการฟื้นตัว', formatThaiDate(today.dateKey), en ? 'Personal baselines, trends and training context' : 'Baseline ส่วนตัว แนวโน้ม และบริบทการฝึก')}

    <section class="card health-detail-hero tone-${tone(recovery.score)}">
      <div class="health-detail-score"><span>Recovery</span><strong>${recovery.score == null ? '—' : formatNumber(recovery.score)}</strong><small>/100</small></div>
      <div class="health-detail-summary"><h2>${escapeHtml(recoveryHeadline(recovery.score, en))}</h2><p>${escapeHtml(recoverySummary(unified, en))}</p><div class="health-detail-meta"><span>${en ? 'Confidence' : 'ความมั่นใจ'} ${confidence}%</span><span>${trends.coverage.healthDays}/${trends.coverage.rangeDays} ${en ? 'health days' : 'วันที่มีข้อมูลสุขภาพ'}</span><span>${trends.load.activeDays} ${en ? 'active load days' : 'วันที่มีโหลดฝึก'}</span></div></div>
    </section>

    <section class="section">
      <div class="health-range-control" role="group" aria-label="${en ? 'Trend range' : 'ช่วงเวลาของแนวโน้ม'}">
        ${PERSONAL_TREND_RANGES.map(days => `<button class="button ${range === days ? 'primary' : 'secondary'} compact" data-health-range="${days}">${days} ${en ? 'days' : 'วัน'}</button>`).join('')}
      </div>
    </section>

    ${selectedMetricKey ? renderMetricFocus(findMetric(unified, selectedMetricKey), trends.baselines[selectedMetricKey], range, en) : ''}

    <section class="section">
      <div class="section-head"><div><h2>${en ? 'Personal trend summary' : 'สรุปแนวโน้มส่วนตัว'}</h2><small>${en ? 'Latest values compared with your own rolling range' : 'เทียบค่าล่าสุดกับช่วงปกติของคุณเอง'}</small></div></div>
      <div class="personal-trend-summary-grid">
        ${sleepDebtCard(trends.sleepDebt, en)}
        ${deviationCard(trends.baselines.restingHr, 'restingHr', en)}
        ${deviationCard(trends.baselines.hrvMs, 'hrvMs', en)}
        ${sleepConsistencyCard(trends.sleepConsistency, en)}
      </div>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>${en ? 'Recovery signals' : 'สัญญาณการฟื้นตัว'}</h2><small>${en ? 'The shaded band is your recent personal range, not a medical reference range' : 'แถบเงาคือช่วงปกติส่วนตัวล่าสุด ไม่ใช่เกณฑ์ทางการแพทย์'}</small></div><a href="#/scores">${en ? 'Score method' : 'หลักการให้คะแนน'}</a></div>
      <div class="health-detail-grid">
        ${metricDetailCard(findMetric(unified, 'sleepHours'), trends.baselines.sleepHours, range, en, true)}
        ${metricDetailCard(findMetric(unified, 'restingHr'), trends.baselines.restingHr, range, en, true)}
        ${metricDetailCard(findMetric(unified, 'hrvMs'), trends.baselines.hrvMs, range, en, true)}
      </div>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>${en ? 'Fitness, fatigue & form' : 'Fitness, Fatigue และ Form'}</h2><small>${en ? 'Long-term load, short-term fatigue and the balance between them' : 'โหลดระยะยาว ความล้าระยะสั้น และสมดุลระหว่างสองส่วน'}</small></div><a href="#/progress">${en ? 'Open progress' : 'เปิด Progress'}</a></div>
      ${loadStateSection(trends.load, range, en)}
    </section>

    <section class="section">
      <div class="section-head"><div><h2>${en ? 'Observed relationships' : 'ความสัมพันธ์ที่พบในข้อมูล'}</h2><small>${en ? 'Association only — this does not prove cause and effect' : 'เป็นเพียงความสัมพันธ์ ไม่ได้ยืนยันเหตุและผล'}</small></div></div>
      <div class="association-grid">
        ${associationCard(trends.associations.sleepVsRhr, 'sleep_rhr', en)}
        ${associationCard(trends.associations.sleepVsHrv, 'sleep_hrv', en)}
      </div>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>${en ? 'Daily movement' : 'การเคลื่อนไหวในชีวิตประจำวัน'}</h2><small>${en ? 'Context for strain and energy, not a duplicate workout total' : 'ใช้เป็นบริบทของ Strain และ Energy โดยไม่บวก Workout ซ้ำ'}</small></div></div>
      <div class="health-detail-grid">
        ${metricDetailCard(findMetric(unified, 'steps'), null, range, en)}
        ${metricDetailCard(findMetric(unified, 'activeEnergyKcal'), null, range, en)}
        ${metricDetailCard(findMetric(unified, 'walkingRunningDistanceKm'), null, range, en)}
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
        <div><div class="eyebrow">${en ? 'DATA CONFIDENCE' : 'ความมั่นใจของข้อมูล'}</div><h2>${qualityHeadline(confidence, en)}</h2><p>${qualityCopy(unified, trends, en)}</p></div>
        <div class="data-quality-score"><strong>${confidence}%</strong><span>${en ? 'confidence' : 'ความมั่นใจ'}</span></div>
        <div class="button-row"><a class="button secondary" href="#/connections-home">${en ? 'Data & sync settings' : 'ตั้งค่าข้อมูลและการเชื่อมต่อ'}</a><a class="button ghost" href="#/today">${en ? 'Back to today' : 'กลับหน้าวันนี้'}</a></div>
      </article>
    </section>
  `;

  container.querySelectorAll('[data-health-metric-detail]').forEach(button => button.addEventListener('click', () => {
    app.ui.healthMetric = button.dataset.healthMetricDetail;
    app.render({ scrollTop: true });
  }));
  container.querySelector('[data-health-metric-close]')?.addEventListener('click', () => {
    app.ui.healthMetric = null;
    app.render({ scrollTop: true });
  });
  container.querySelectorAll('[data-health-range]').forEach(button => button.addEventListener('click', () => {
    app.ui.healthRange = Number(button.dataset.healthRange);
    app.render({ scrollTop: true });
  }));
}

function renderMetricFocus(metric, personalMetric, range, en) {
  if (!metric || !personalMetric) return '';
  const formatted = formatMetric(metric, en);
  return `<section class="section metric-focus-section">
    <article class="card metric-focus-card tone-${toneFromStatus(personalMetric.status)}">
      <div class="metric-focus-head"><div><div class="eyebrow">${en ? 'DETAILED TREND' : 'แนวโน้มแบบละเอียด'}</div><h2>${escapeHtml(metricName(metric.key,en))}</h2><p>${escapeHtml(deviationText(personalMetric,metric.key,en))}</p></div><button type="button" class="icon-button" data-health-metric-close aria-label="${en?'Close':'ปิด'}">×</button></div>
      <div class="metric-focus-value">${formatted.value}<small>${formatted.unit}</small></div>
      ${baselineBandChart(personalMetric,range)}
      <div class="metric-focus-stats">
        <div><span>${en?'Baseline':'Baseline'}</span><strong>${formatTrendValue({...personalMetric,latestValue:personalMetric.baseline},metric.key,en).value}${formatTrendValue({...personalMetric,latestValue:personalMetric.baseline},metric.key,en).unit}</strong></div>
        <div><span>${en?'Personal range':'ช่วงส่วนตัว'}</span><strong>${escapeHtml(baselineRangeText(personalMetric,metric.key,en))}</strong></div>
        <div><span>${en?'Samples':'จำนวนข้อมูล'}</span><strong>${personalMetric.sampleCount}</strong></div>
        <div><span>${en?'Standard score':'Deviation score'}</span><strong>${personalMetric.zScore == null?'—':formatNumber(personalMetric.zScore,2)}</strong></div>
      </div>
      <small class="health-disclaimer">${en?'This is a descriptive personal trend, not a clinical threshold.':'เป็นแนวโน้มส่วนตัวเชิงพรรณนา ไม่ใช่เกณฑ์วินิจฉัยทางการแพทย์'}</small>
    </article>
  </section>`;
}

function sleepConsistencyCard(consistency,en){
  const toneName=consistency.status==='consistent'?'good':consistency.status==='irregular'?'risk':consistency.status==='variable'?'watch':'neutral';
  const value=consistency.score==null?'—':formatNumber(consistency.score);
  const copy=consistency.observedDays<3?(en?'Need at least three nights':'ต้องมีข้อมูลอย่างน้อย 3 คืน'):`${en?'Variation':'ความผันผวน'} ${formatNumber(consistency.standardDeviationHours,1)} ${en?'h':'ชม.'} · n=${consistency.observedDays}`;
  return `<article class="card flat personal-trend-summary tone-${toneName}"><div class="card-title">${en?'Sleep consistency':'ความสม่ำเสมอของเวลานอน'}</div><div class="personal-trend-value">${value}<small>${consistency.score==null?'':'/100'}</small></div><div class="submetric">${escapeHtml(copy)}</div><div class="baseline-range-note">${en?'Based on sleep duration variability':'อิงจากความผันผวนของระยะเวลานอน'}</div></article>`;
}

function associationCard(association,type,en){
  const title=type==='sleep_rhr'?(en?'Sleep vs Resting HR':'การนอนเทียบ Resting HR'):(en?'Sleep vs HRV':'การนอนเทียบ HRV');
  const value=association.coefficient==null?'—':`${association.coefficient>0?'+':''}${formatNumber(association.coefficient,2)}`;
  return `<article class="card flat association-card"><div class="card-title">${escapeHtml(title)}</div><div class="association-value">r ${value}</div><strong>${escapeHtml(associationText(association,type,en))}</strong><small>${association.sampleCount} ${en?'paired days':'วันที่มีข้อมูลคู่กัน'} · ${en?'association, not causation':'เป็นความสัมพันธ์ ไม่ใช่เหตุและผล'}</small></article>`;
}

function associationText(item,type,en){
  if(item.coefficient==null)return en?'Not enough paired data yet':'ข้อมูลคู่กันยังไม่เพียงพอ';
  const strength={strong:en?'strong':'ค่อนข้างชัด',moderate:en?'moderate':'ปานกลาง',weak:en?'weak':'อ่อน'}[item.strength]||'';
  if(item.direction==='none')return en?`A ${strength} relationship is not visible`:`ยังไม่เห็นความสัมพันธ์ที่ชัดเจน`;
  if(type==='sleep_rhr'){const meaning=item.direction==='negative'?(en?'More sleep tends to align with lower Resting HR':'วันที่นอนมากขึ้นมีแนวโน้มสัมพันธ์กับ Resting HR ที่ต่ำลง'):(en?'More sleep tends to align with higher Resting HR':'วันที่นอนมากขึ้นมีแนวโน้มสัมพันธ์กับ Resting HR ที่สูงขึ้น');return `${meaning} · ${strength}`;}
  const meaning=item.direction==='positive'?(en?'More sleep tends to align with higher HRV':'วันที่นอนมากขึ้นมีแนวโน้มสัมพันธ์กับ HRV ที่สูงขึ้น'):(en?'More sleep tends to align with lower HRV':'วันที่นอนมากขึ้นมีแนวโน้มสัมพันธ์กับ HRV ที่ต่ำลง');return `${meaning} · ${strength}`;
}

function sleepDebtCard(debt, en) {
  const toneName = debt.status === 'high' ? 'risk' : debt.status === 'watch' ? 'watch' : debt.status === 'low' ? 'good' : 'neutral';
  const value = debt.observedDays ? formatNumber(debt.netDebtHours, 1) : '—';
  const copy = debt.observedDays < 3
    ? (en ? 'Need at least three recorded nights' : 'ต้องมีข้อมูลอย่างน้อย 3 คืน')
    : `${en ? 'Average' : 'เฉลี่ย'} ${formatNumber(debt.averageSleepHours, 1)} ${en ? 'h/night' : 'ชม./คืน'} · ${debt.observedDays}/7 ${en ? 'nights' : 'คืน'}`;
  return `<article class="card flat personal-trend-summary tone-${toneName}"><div class="card-title">${en ? 'Estimated sleep debt' : 'Sleep Debt โดยประมาณ'}</div><div class="personal-trend-value">${value}<small>${debt.observedDays ? (en ? ' h' : ' ชม.') : ''}</small></div><div class="submetric">${escapeHtml(copy)}</div><div class="baseline-range-note">${en ? 'Target' : 'เป้าหมาย'} ${formatNumber(debt.targetHours,1)} ${en ? 'h/night' : 'ชม./คืน'}</div></article>`;
}

function deviationCard(metric, key, en) {
  const title = metricName(key, en);
  const formatted = formatTrendValue(metric, key, en);
  const deviation = metric.deviation == null ? (en ? 'Building baseline' : 'กำลังสร้าง Baseline') : deviationText(metric, key, en);
  return `<article class="card flat personal-trend-summary tone-${toneFromStatus(metric.status)}"><div class="card-title">${escapeHtml(title)} ${en ? 'deviation' : 'เทียบ Baseline'}</div><div class="personal-trend-value">${formatted.value}<small>${formatted.unit}</small></div><div class="submetric">${escapeHtml(deviation)}</div><div class="baseline-range-note">${baselineRangeText(metric, key, en)}</div></article>`;
}

function metricDetailCard(metric, personalMetric, range, en, drilldown = false) {
  if (!metric) return '';
  const formatted = formatMetric(metric, en);
  const delta = personalMetric ? deviationText(personalMetric, metric.key, en) : deltaText(metric, en);
  const chart = personalMetric ? baselineBandChart(personalMetric, range) : simpleLineChart(metric.series, range, metric.tone);
  const baseline = personalMetric ? baselineRangeText(personalMetric, metric.key, en) : `${en ? 'Recent average' : 'ค่าเฉลี่ยล่าสุด'} ${formatBaseline(metric, en)}`;
  return `<article class="card flat health-detail-metric tone-${escapeHtml(personalMetric ? toneFromStatus(personalMetric.status) : metric.tone)}">
    <div class="health-detail-metric-head"><div><span>${escapeHtml(metricName(metric.key, en))}</span><small>${freshness(metric.date, en)}</small></div><i class="metric-tone-dot ${escapeHtml(personalMetric ? toneFromStatus(personalMetric.status) : metric.tone)}"></i></div>
    <div class="health-detail-value">${formatted.value}<small>${formatted.unit}</small></div>
    <div class="health-detail-delta ${escapeHtml(personalMetric ? toneFromStatus(personalMetric.status) : metric.tone)}">${escapeHtml(delta)}</div>
    ${chart}
    <div class="health-detail-baseline"><span>${en ? 'Personal range' : 'ช่วงส่วนตัว'}</span><strong>${escapeHtml(baseline)}</strong></div>
    ${drilldown ? `<button type="button" class="metric-detail-button" data-health-metric-detail="${escapeHtml(metric.key)}">${en ? 'Open detailed trend' : 'เปิดดูแนวโน้มแบบละเอียด'} ›</button>` : ''}
  </article>`;
}

function baselineBandChart(metric, range) {
  const points = metric.series.slice(-range);
  const numeric = points.flatMap(item => [item.value, item.lower, item.upper]).filter(value => Number.isFinite(Number(value))).map(Number);
  if (!numeric.length) return '<div class="health-chart-empty">—</div>';
  const width = 340; const height = 130; const padX = 10; const padY = 13;
  const minValue = Math.min(...numeric); const maxValue = Math.max(...numeric); const spread = maxValue - minValue || Math.max(1, Math.abs(maxValue) * .1);
  const x = index => padX + (points.length > 1 ? index * ((width - padX * 2) / (points.length - 1)) : (width - padX * 2) / 2);
  const y = value => height - padY - ((Number(value) - minValue) / spread) * (height - padY * 2);
  const upper = points.map((item,index) => Number.isFinite(Number(item.upper)) ? `${x(index).toFixed(1)},${y(item.upper).toFixed(1)}` : null).filter(Boolean);
  const lower = points.map((item,index) => Number.isFinite(Number(item.lower)) ? `${x(index).toFixed(1)},${y(item.lower).toFixed(1)}` : null).filter(Boolean).reverse();
  const band = upper.length && lower.length ? `<polygon class="baseline-band" points="${[...upper,...lower].join(' ')}"/>` : '';
  const linePoints = points.map((item,index) => Number.isFinite(Number(item.value)) ? `${x(index).toFixed(1)},${y(item.value).toFixed(1)}` : null).filter(Boolean).join(' ');
  const baselinePoints = points.map((item,index) => Number.isFinite(Number(item.baseline)) ? `${x(index).toFixed(1)},${y(item.baseline).toFixed(1)}` : null).filter(Boolean).join(' ');
  const dots = points.map((item,index) => Number.isFinite(Number(item.value)) ? `<circle cx="${x(index).toFixed(1)}" cy="${y(item.value).toFixed(1)}" r="2.3"/>` : '').join('');
  return `<div class="baseline-chart-wrap"><svg class="health-line-chart baseline-line-chart tone-${toneFromStatus(metric.status)}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${range}-day personal baseline trend">${band}<polyline class="baseline-center" points="${baselinePoints}"/><polyline class="metric-line" points="${linePoints}"/>${dots}</svg><div class="baseline-chart-legend"><span><i class="band"></i>Baseline range</span><span><i class="actual"></i>Actual</span></div></div>`;
}

function simpleLineChart(values, range, toneName) {
  const normalized = values.slice(-range).map(value => Number.isFinite(Number(value)) ? Number(value) : null);
  const actual = normalized.filter(value => value != null);
  if (!actual.length) return '<div class="health-chart-empty">—</div>';
  const width = 320; const height = 120; const padX = 8; const padY = 12;
  const min = Math.min(...actual); const max = Math.max(...actual); const spread = max - min || Math.max(1, Math.abs(max) * .1);
  const step = normalized.length > 1 ? (width - padX * 2) / (normalized.length - 1) : width - padX * 2;
  const points = normalized.map((value,index) => value == null ? null : `${(padX+index*step).toFixed(1)},${(height-padY-((value-min)/spread)*(height-padY*2)).toFixed(1)}`).filter(Boolean).join(' ');
  const dots = normalized.map((value,index) => value == null ? '' : `<circle cx="${(padX+index*step).toFixed(1)}" cy="${(height-padY-((value-min)/spread)*(height-padY*2)).toFixed(1)}" r="2.4"/>`).join('');
  return `<svg class="health-line-chart tone-${escapeHtml(toneName)}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${range}-day trend"><line x1="0" y1="${height-1}" x2="${width}" y2="${height-1}"/><polyline points="${points}"/>${dots}</svg>`;
}

function loadStateSection(load, range, en) {
  return `<article class="card flat load-state-card">
    <div class="load-state-kpis">
      ${loadKpi(en ? 'Fitness' : 'Fitness', load.fitness, en ? '42-day load' : 'โหลดระยะยาว 42 วัน', 'fitness')}
      ${loadKpi(en ? 'Fatigue' : 'Fatigue', load.fatigue, en ? '7-day load' : 'ความล้าระยะสั้น 7 วัน', 'fatigue')}
      ${loadKpi(en ? 'Form' : 'Form', load.form, formText(load, en), `form ${load.status}`)}
    </div>
    ${loadTrendChart(load, range)}
    <div class="load-state-footer"><span>${en ? 'Method: exponential load averages (42/7 days)' : 'วิธีคำนวณ: ค่าเฉลี่ยโหลดแบบถ่วงน้ำหนัก 42/7 วัน'}</span><strong>${escapeHtml(formStatus(load.status, en))}</strong></div>
  </article>`;
}

function loadKpi(title, value, detail, className) {
  return `<div class="load-state-kpi ${escapeHtml(className)}"><span>${escapeHtml(title)}</span><strong>${formatNumber(value,1)}</strong><small>${escapeHtml(detail)}</small></div>`;
}

function loadTrendChart(load, range) {
  const rows = load.series.slice(-range);
  const all = rows.flatMap(row => [row.fitness,row.fatigue,row.form]).filter(value => Number.isFinite(Number(value))).map(Number);
  if (!all.length) return '<div class="health-chart-empty">—</div>';
  const width=700; const height=190; const padX=12; const padY=18;
  const min=Math.min(0,...all); const max=Math.max(1,...all); const spread=max-min||1;
  const x=index=>padX+(rows.length>1?index*((width-padX*2)/(rows.length-1)):(width-padX*2)/2);
  const y=value=>height-padY-((Number(value)-min)/spread)*(height-padY*2);
  const points=key=>rows.map((row,index)=>`${x(index).toFixed(1)},${y(row[key]).toFixed(1)}`).join(' ');
  const zeroY=y(0).toFixed(1);
  return `<div class="load-chart-wrap"><svg class="load-state-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Fitness fatigue form trend"><line class="zero-line" x1="0" y1="${zeroY}" x2="${width}" y2="${zeroY}"/><polyline class="fitness-line" points="${points('fitness')}"/><polyline class="fatigue-line" points="${points('fatigue')}"/><polyline class="form-line" points="${points('form')}"/></svg><div class="load-chart-legend"><span class="fitness">Fitness</span><span class="fatigue">Fatigue</span><span class="form">Form</span></div></div>`;
}

function contextCard(title, score, text, trend) {
  return `<article class="card flat health-context-card"><div class="card-title">${escapeHtml(title)}</div><div class="metric">${score == null ? '—' : formatNumber(score)}${score == null ? '' : '<small>/100</small>'}</div><div class="submetric">${escapeHtml(text)}</div>${smallSpark(trend)}</article>`;
}
function smallSpark(values = []) { const actual=values.map(value=>Number.isFinite(Number(value))?Number(value):null); const finiteValues=actual.filter(value=>value!=null); if(!finiteValues.length)return '<div class="context-spark-empty"></div>'; const min=Math.min(...finiteValues);const max=Math.max(...finiteValues);const spread=max-min||1;const width=120;const height=32;const step=actual.length>1?width/(actual.length-1):width;const points=actual.map((value,index)=>value==null?null:`${index*step},${height-3-((value-min)/spread)*(height-6)}`).filter(Boolean).join(' ');return `<svg class="context-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}"/></svg>`; }
function contributorRow(item,en){return `<div class="health-contributor-row ${escapeHtml(item.tone)}"><span>${item.tone==='good'?'✓':item.tone==='risk'?'!':'↗'}</span><div><strong>${escapeHtml(contributorName(item.code,en))}</strong><small>${escapeHtml(contributorValue(item,en))}</small></div></div>`;}
function contributorName(code,en){const map={short_sleep:en?'Sleep below six hours':'การนอนต่ำกว่า 6 ชั่วโมง',sleep_below_baseline:en?'Sleep below recent average':'การนอนต่ำกว่าค่าเฉลี่ยล่าสุด',sleep_supportive:en?'Sleep supports recovery':'การนอนสนับสนุน Recovery',rhr_elevated:en?'Resting HR is elevated':'Resting HR สูงกว่าค่าเฉลี่ย',rhr_below_baseline:en?'Resting HR is below baseline':'Resting HR ต่ำกว่า Baseline',hrv_suppressed:en?'HRV is suppressed':'HRV ต่ำกว่า Baseline',hrv_supportive:en?'HRV supports recovery':'HRV สนับสนุน Recovery',load_outside_range:en?'Load is outside your usual range':'โหลดฝึกนอกช่วงปกติ',load_changing:en?'Load is changing':'โหลดฝึกกำลังเปลี่ยน',load_balanced:en?'Load is balanced':'โหลดฝึกสมดุล',pain_hard_stop:en?'Pain safety gate':'Pain Safety Gate',pain_caution:en?'Pain caution':'เฝ้าระวังอาการเจ็บ',large_energy_deficit:en?'Large energy deficit':'Calories Deficit ค่อนข้างสูง'};return map[code]||code;}
function contributorValue(item,en){if(item.delta!=null)return `${item.delta>0?'+':''}${formatNumber(item.delta,1)} ${en?'vs recent average':'เทียบค่าเฉลี่ยล่าสุด'}`;if(item.value!=null)return `${item.value>0?'+':''}${formatNumber(item.value)}${item.code.includes('load')?'%':''}`;return en?'Included in the current recommendation':'ใช้ประกอบคำแนะนำปัจจุบัน';}
function findMetric(unified,key){return unified.metrics.find(item=>item.key===key);}
function metricName(key,en){return ({sleepHours:en?'Sleep':'การนอน',restingHr:'Resting HR',hrvMs:'HRV',steps:en?'Steps':'ก้าว',activeEnergyKcal:en?'Active energy':'พลังงานกิจกรรม',walkingRunningDistanceKm:en?'Walk + run':'เดิน + วิ่ง'})[key]||key;}
function formatMetric(metric,en){if(metric.value==null)return {value:'—',unit:''};if(metric.key==='sleepHours'){const total=Math.round(metric.value*60);return {value:`${Math.floor(total/60)}${en?'h':'ชม.'} ${total%60}${en?'m':'น.'}`,unit:''};}if(metric.key==='restingHr')return {value:formatNumber(metric.value),unit:' bpm'};if(metric.key==='hrvMs')return {value:formatNumber(metric.value),unit:' ms'};if(metric.key==='activeEnergyKcal')return {value:formatNumber(metric.value),unit:' kcal'};if(metric.key==='walkingRunningDistanceKm')return {value:formatNumber(metric.value,2),unit:' km'};return {value:formatNumber(metric.value),unit:''};}
function formatTrendValue(metric,key,en){if(metric.latestValue==null)return {value:'—',unit:''};return formatMetric({key,value:metric.latestValue},en);}
function formatBaseline(metric,en){if(metric.baseline==null)return '—';const clone={...metric,value:metric.baseline};const formatted=formatMetric(clone,en);return `${formatted.value}${formatted.unit}`;}
function deltaText(metric,en){if(metric.value==null)return en?'No data yet':'ยังไม่มีข้อมูล';if(metric.delta==null)return en?'Building your personal baseline':'กำลังสร้าง Baseline ส่วนตัว';const sign=metric.delta>0?'+':'';const unit=metric.key==='sleepHours'?(en?'h':'ชม.'):metric.key==='restingHr'?'bpm':metric.key==='hrvMs'?'ms':metric.key==='activeEnergyKcal'?'kcal':metric.key==='walkingRunningDistanceKm'?'km':'';return `${sign}${formatNumber(metric.delta,metric.key==='walkingRunningDistanceKm'||metric.key==='sleepHours'?1:0)} ${unit} ${en?'vs recent average':'เทียบค่าเฉลี่ยล่าสุด'}`;}
function deviationText(metric,key,en){if(metric.latestValue==null)return en?'No data yet':'ยังไม่มีข้อมูล';if(metric.deviation==null)return en?'Building your personal baseline':'กำลังสร้าง Baseline ส่วนตัว';const sign=metric.deviation>0?'+':'';const unit=key==='sleepHours'?(en?'h':'ชม.'):key==='restingHr'?'bpm':'ms';return `${sign}${formatNumber(metric.deviation,key==='sleepHours'?1:0)} ${unit} (${sign}${formatNumber(metric.deviationPct,1)}%) ${en?'vs baseline':'เทียบ Baseline'}`;}
function baselineRangeText(metric,key,en){if(metric.baseline==null||metric.lower==null||metric.upper==null)return en?'Baseline not ready':'Baseline ยังไม่พร้อม';const lower=formatMetric({key,value:metric.lower},en);const upper=formatMetric({key,value:metric.upper},en);return `${lower.value}${lower.unit} – ${upper.value}${upper.unit} · n=${metric.sampleCount}`;}
function freshness(date,en){if(!date)return en?'No data':'ไม่มีข้อมูล';const parsed=new Date(`${date}T00:00:00`);return Number.isNaN(parsed.getTime())?date:parsed.toLocaleDateString(en?'en-GB':'th-TH',{day:'numeric',month:'short'});}
function recoveryHeadline(score,en){if(score==null)return en?'Building your baseline':'กำลังสร้าง Baseline';if(score>=75)return en?'Recovery is supportive':'การฟื้นตัวอยู่ในระดับดี';if(score>=50)return en?'Recovery is moderate':'การฟื้นตัวอยู่ในระดับปานกลาง';return en?'Recovery needs attention':'การฟื้นตัวยังต้องดูแล';}
function recoverySummary(unified,en){const risks=unified.contributors.filter(item=>item.tone==='risk').length;const watches=unified.contributors.filter(item=>item.tone==='watch').length;if(risks)return en?'One or more recovery signals are outside your recent range. Keep today easy and review symptoms.':'มีสัญญาณ Recovery บางรายการนอกช่วงล่าสุด ควรลดความหนักและประเมินอาการ';if(watches)return en?'Recovery is usable, but one or more signals need monitoring.':'Recovery ยังใช้ประกอบการฝึกได้ แต่มีบางสัญญาณที่ควรติดตาม';return en?'Current signals are broadly aligned with your recent baseline.':'สัญญาณปัจจุบันโดยรวมสอดคล้องกับ Baseline ล่าสุด';}
function loadText(load,en){if(load.weekChangePct==null)return en?'Building load history':'กำลังสร้างประวัติโหลด';return `${load.weekChangePct>0?'+':''}${formatNumber(load.weekChangePct)}% ${en?'vs last week':'เทียบสัปดาห์ก่อน'}`;}
function energyText(energy,balance,en){if(balance?.foodComplete)return `${en?'Balance':'สมดุล'} ${balance.netKcal>0?'+':''}${formatNumber(balance.netKcal)} kcal`;return energy.score==null?(en?'Not enough data':'ข้อมูลยังไม่พอ'):(en?'Estimated from recovery and movement':'ประเมินจาก Recovery และการเคลื่อนไหว');}
function readinessText(unified,en){return `${en?'Confidence':'ความมั่นใจ'} ${unified.readiness.confidence}% · ${unified.readiness.score==null?(en?'check-in needed':'ควรทำ Check-in'):(en?'current estimate':'ค่าประเมินปัจจุบัน')}`;}
function qualityHeadline(score,en){if(score>=75)return en?'Strong coverage':'ข้อมูลครอบคลุมดี';if(score>=45)return en?'Usable with some gaps':'ใช้วิเคราะห์ได้แต่ยังมีช่องว่าง';return en?'Keep collecting data':'ควรเก็บข้อมูลเพิ่ม';}
function qualityCopy(unified,trends,en){const missing=unified.metrics.filter(item=>item.value==null).map(item=>metricName(item.key,en));const baselineReady=trends.coverage.baselineMetrics;const parts=[en?`${baselineReady}/3 personal baselines ready`:`Baseline ส่วนตัวพร้อม ${baselineReady}/3 รายการ`,en?`${trends.load.activeDays} active days in load history`:`มีโหลดฝึก ${trends.load.activeDays} วันในประวัติ`];if(missing.length)parts.push(`${en?'Missing or stale':'ยังขาดหรือไม่สดใหม่'}: ${missing.join(', ')}`);return parts.join(' · ');}
function formText(load,en){return `${load.form>=0?'+':''}${formatNumber(load.form,1)} ${en?'load balance':'สมดุลโหลด'}`;}
function formStatus(status,en){const map={fresh:en?'Fresh relative to recent load':'สดกว่าภาระฝึกล่าสุด',balanced:en?'Balanced training state':'สมดุลสำหรับการฝึก',fatigued:en?'Short-term fatigue is elevated':'ความล้าระยะสั้นค่อนข้างสูง',building:en?'Building training-load history':'กำลังสร้างประวัติโหลดฝึก'};return map[status]||map.building;}
function toneFromStatus(status){return status==='good'||status==='fresh'?'good':status==='risk'||status==='fatigued'?'risk':status==='normal'||status==='balanced'?'neutral':'watch';}
function tone(score){return score==null?'neutral':score>=75?'good':score>=50?'watch':'risk';}
