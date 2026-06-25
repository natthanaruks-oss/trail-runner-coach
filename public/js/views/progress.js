import { buildProgressDashboard, normalizeProgressRange } from '../core/progress.js';
import { localDateKey, formatThaiDate } from '../core/date.js';
import { PAIN_AREAS } from '../core/constants.js';
import { escapeHtml, formatNumber, pageHeader } from './components.js';

const SVG_WIDTH = 720;
const SVG_HEIGHT = 230;
const CHART_LEFT = 45;
const CHART_RIGHT = 16;
const CHART_TOP = 18;
const CHART_BOTTOM = 38;

export function renderProgress(container, state, app) {
  const initial = app.ui.progressFilter || { preset: 28, endDate: localDateKey() };
  const range = normalizeProgressRange(initial);
  app.ui.progressFilter = range;
  const model = buildProgressDashboard(state, range);
  const en = app.language === 'en';
  const c = (th, english) => en ? english : th;

  container.innerHTML = `
    ${pageHeader(c('แดชบอร์ดความก้าวหน้า', 'Progress Dashboard'), c('ดูแนวโน้มเพื่อปรับแผน ไม่ใช่ใช้ตัวเลขตัดสินคุณค่าของตัวเอง', 'Use trends to adapt the plan—not to judge yourself.'), c('Train · Recover · Adapt', 'Train · Recover · Adapt'))}

    <section class="card progress-filter-card">
      <div class="progress-filter-presets" role="group" aria-label="${c('ช่วงเวลา', 'Date range')}">
        ${[7, 28, 90].map(days => `<button class="segmented-button ${range.preset === days ? 'active' : ''}" type="button" data-progress-preset="${days}">${days} ${c('วัน', 'days')}</button>`).join('')}
        <button class="segmented-button ${range.preset === 'custom' ? 'active' : ''}" type="button" data-progress-preset="custom">${c('กำหนดเอง', 'Custom')}</button>
      </div>
      <form id="progress-range-form" class="progress-date-filter">
        <label class="field"><span>${c('ตั้งแต่', 'From')}</span><input type="date" name="startDate" value="${escapeHtml(range.startDate)}"></label>
        <label class="field"><span>${c('ถึง', 'To')}</span><input type="date" name="endDate" value="${escapeHtml(range.endDate)}" max="${localDateKey()}"></label>
        <button class="button secondary" type="submit">${c('ใช้ช่วงนี้', 'Apply range')}</button>
      </form>
      <div class="progress-period-caption">${escapeHtml(formatRange(range.startDate, range.endDate, en))} · ${range.days} ${c('วัน', 'days')} · ${c('เทียบกับช่วงก่อนหน้าที่มีจำนวนวันเท่ากัน', 'compared with the previous equal-length period')}</div>
    </section>

    <section class="progress-kpi-grid section">
      ${metricTile({ label:c('ระยะวิ่ง/เดิน', 'Run / hike distance'), value:formatNumber(model.current.activity.distanceKm, 1), unit:'km', comparison:model.comparisons.distanceKm, c, tone:'blue' })}
      ${metricTile({ label:c('Vertical gain', 'Vertical gain'), value:formatNumber(model.current.activity.elevationGainM), unit:'m', comparison:model.comparisons.elevationGainM, c, tone:'mint' })}
      ${metricTile({ label:c('เวลาซ้อม', 'Training time'), value:formatDuration(model.current.activity.durationMin, en), unit:'', comparison:model.comparisons.durationMin, c, tone:'amber', compact:true })}
      ${metricTile({ label:c('ทำตามแผน', 'Plan adherence'), value:model.current.plan.adherencePct == null ? '—' : formatNumber(model.current.plan.adherencePct), unit:model.current.plan.adherencePct == null ? '' : '%', comparison:model.comparisons.adherencePct, c, tone:adherenceTone(model.current.plan.adherencePct), absolute:true })}
      ${metricTile({ label:c('Recovery เฉลี่ย', 'Average recovery'), value:model.current.scores.averageRecovery ?? '—', unit:model.current.scores.averageRecovery == null ? '' : '/100', comparison:model.comparisons.averageRecovery, c, tone:scoreTone(model.current.scores.averageRecovery), absolute:true })}
      ${metricTile({ label:c('Calories balance', 'Calorie balance'), value:model.current.energy.completeDays ? signedNumber(model.current.energy.netKcal) : '—', unit:model.current.energy.completeDays ? 'kcal' : '', comparison:model.comparisons.netEnergyKcal, c, tone:energyTone(model.current.energy.averageNetKcal), absolute:true })}
    </section>

    <section class="section">
      <div class="section-head"><h2>${c('สิ่งที่ข้อมูลกำลังบอก', 'What the data is saying')}</h2><span>${c(`ความมั่นใจ ${model.coverage.confidence}%`, `Confidence ${model.coverage.confidence}%`)}</span></div>
      <div class="progress-insight-grid">${model.insights.map(insight => insightCard(insight, c)).join('')}</div>
    </section>

    <section class="grid two section progress-chart-grid">
      <article class="card progress-chart-card">
        <div class="section-head compact"><div><h2>${c('ระยะจริงเทียบแผน', 'Actual vs planned distance')}</h2><small>${c('ใช้กิจกรรมวิ่ง เดิน และ Hike ที่ผ่าน Deduplication', 'Uses deduplicated run, walk, and hike activities')}</small></div><span>${formatNumber(model.current.plan.distanceAchievementPct ?? 0)}%</span></div>
        ${barChart(model.current.buckets, { actualKey:'distanceKm', planKey:'plannedDistanceKm', unit:'km', c, en })}
      </article>
      <article class="card progress-chart-card">
        <div class="section-head compact"><div><h2>${c('Vertical จริงเทียบแผน', 'Actual vs planned vertical')}</h2><small>${c('Elevation gain จากกิจกรรมจริง', 'Elevation gain from recorded activities')}</small></div><span>${formatNumber(model.current.plan.verticalAchievementPct ?? 0)}%</span></div>
        ${barChart(model.current.buckets, { actualKey:'elevationGainM', planKey:'plannedElevationGainM', unit:'m', c, en })}
      </article>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>${c('Strain · Recovery · Readiness', 'Strain · Recovery · Readiness')}</h2><small>${c('Strain ถูกแปลงเป็นสเกล 0–100 ในกราฟเพื่อเทียบแนวโน้ม', 'Strain is normalized to 0–100 in the chart for trend comparison')}</small></div><a href="#/scores">${c('ดูเหตุผลคะแนน', 'View score reasons')}</a></div>
      <article class="card progress-chart-card">
        ${scoreLineChart(model.current.scores.series, { c, en })}
        <div class="chart-legend"><span><i class="legend-dot strain"></i>Strain</span><span><i class="legend-dot recovery"></i>Recovery</span><span><i class="legend-dot readiness"></i>Readiness</span></div>
        <div class="progress-score-summary">
          ${miniSummary(c('Strain เฉลี่ย', 'Average strain'), model.current.scores.averageStrain == null ? '—' : `${formatNumber(model.current.scores.averageStrain,1)}/21`)}
          ${miniSummary(c('Recovery เฉลี่ย', 'Average recovery'), model.current.scores.averageRecovery == null ? '—' : `${model.current.scores.averageRecovery}/100`)}
          ${miniSummary(c('Readiness เฉลี่ย', 'Average readiness'), model.current.scores.averageReadiness == null ? '—' : `${model.current.scores.averageReadiness}/100`)}
          ${miniSummary(c('Green / Yellow / Red', 'Green / Yellow / Red'), `${model.current.scores.statusDays.green} / ${model.current.scores.statusDays.yellow} / ${model.current.scores.statusDays.red}`)}
        </div>
      </article>
    </section>

    <section class="grid two section">
      <article class="card flat">
        <div class="section-head compact"><h2>${c('Pain / Niggle', 'Pain / Niggle')}</h2><a href="#/pain">${c('เปิด Pain Log', 'Open Pain Log')}</a></div>
        <div class="progress-dual-metric">
          <div><small>${c('สูงสุด', 'Maximum')}</small><strong class="${model.current.pain.maxSeverity >= 6 ? 'danger-text' : model.current.pain.maxSeverity >= 3 ? 'warning-text' : ''}">${model.current.pain.maxSeverity}/10</strong></div>
          <div><small>${c('วันที่มีอาการ', 'Pain days')}</small><strong>${model.current.pain.painDays}</strong></div>
        </div>
        <div class="progress-spark-bars">${painBars(model.current.buckets, en)}</div>
        <div class="submetric">${painSummaryText(model.current.pain, c)}</div>
      </article>
      <article class="card flat">
        <div class="section-head compact"><h2>${c('Energy balance', 'Energy balance')}</h2><a href="#/fuel">${c('เปิดบันทึกอาหาร', 'Open food log')}</a></div>
        <div class="progress-dual-metric">
          <div><small>${c('สุทธิ', 'Net')}</small><strong class="${model.current.energy.netKcal < -350 ? 'warning-text' : ''}">${model.current.energy.completeDays ? signedNumber(model.current.energy.netKcal) : '—'}${model.current.energy.completeDays ? '<em> kcal</em>' : ''}</strong></div>
          <div><small>${c('วันที่บันทึกครบ', 'Complete days')}</small><strong>${model.current.energy.completeDays}/${model.current.energy.selectedDays}</strong></div>
        </div>
        <div class="progress-spark-bars energy">${energyBars(model.current.buckets, en)}</div>
        <div class="submetric">${energySummaryText(model.current.energy, c)}</div>
      </article>
    </section>

    <section class="section">
      <div class="section-head"><h2>${c('ความสม่ำเสมอและคุณภาพข้อมูล', 'Consistency and data quality')}</h2><span>${c('ข้อมูลอยู่ในเครื่องนี้', 'Data stays on this device')}</span></div>
      <article class="card flat">
        <div class="coverage-grid">
          ${coverageItem(c('วันที่มีกิจกรรม', 'Activity days'), model.coverage.activityDays, range.days, model.coverage.activityPct, 'var(--blue)')}
          ${coverageItem(c('วันที่มี Recovery', 'Recovery days'), model.coverage.healthDays, range.days, model.coverage.healthPct, 'var(--mint)')}
          ${coverageItem(c('วันที่กรอกอาหารครบ', 'Complete food days'), model.coverage.foodDays, range.days, model.coverage.foodPct, 'var(--amber)')}
          ${coverageItem(c('Pain entries', 'Pain entries'), model.coverage.painEntries, null, null, 'var(--red)')}
        </div>
        <div class="callout ${model.coverage.confidence < 45 ? '' : 'good'}" style="margin-top:14px">${coverageMessage(model.coverage, c)}</div>
      </article>
    </section>

    <div class="callout progress-philosophy">${c('เป้าหมายคือจบอย่างสุขภาพดีและมีความสุข ความสม่ำเสมอ 80% ที่ไม่เจ็บ มีค่ากว่า 100% ที่ฝืนจนหยุดยาว', 'The goal is to finish healthy and happy. Sustainable 80% consistency is more valuable than forcing 100% and losing weeks to injury.')}</div>
  `;

  bindProgressEvents(container, app, range);
}

function bindProgressEvents(container, app, range) {
  container.querySelectorAll('[data-progress-preset]').forEach(button => button.addEventListener('click', () => {
    const value = button.dataset.progressPreset;
    if (value === 'custom') {
      app.ui.progressFilter = { preset:'custom', startDate:range.startDate, endDate:range.endDate };
      app.render();
      return;
    }
    app.ui.progressFilter = { preset:Number(value), endDate:localDateKey() };
    app.render({ scrollTop:false });
  }));
  container.querySelector('#progress-range-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    app.ui.progressFilter = { preset:'custom', startDate:data.get('startDate'), endDate:data.get('endDate') };
    app.render({ scrollTop:false });
  });
}

function metricTile({ label, value, unit, comparison, c, tone, compact = false, absolute = false }) {
  const change = comparisonText(comparison, c, absolute);
  return `<article class="card progress-kpi ${tone || ''}"><div class="card-title">${escapeHtml(label)}</div><div class="metric ${compact ? 'compact-value' : ''}">${escapeHtml(String(value))}${unit ? `<small>${escapeHtml(unit)}</small>` : ''}</div><div class="progress-comparison ${change.direction}">${escapeHtml(change.text)}</div></article>`;
}

function comparisonText(comparison, c, absolute = false) {
  if (!comparison || comparison.delta == null) return { direction:'neutral', text:c('ยังไม่มีช่วงก่อนหน้าให้เทียบ', 'No previous-period comparison yet') };
  const delta = Number(comparison.delta);
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral';
  if (absolute || comparison.pct == null) return { direction, text:c(`${delta > 0 ? '+' : ''}${formatNumber(delta,1)} จากช่วงก่อน`, `${delta > 0 ? '+' : ''}${formatNumber(delta,1)} vs previous`) };
  return { direction, text:c(`${comparison.pct > 0 ? '+' : ''}${comparison.pct}% จากช่วงก่อน`, `${comparison.pct > 0 ? '+' : ''}${comparison.pct}% vs previous`) };
}

function insightCard(insight, c) {
  const copy = insightCopy(insight, c);
  return `<article class="progress-insight ${insight.tone}"><span class="insight-icon">${insightIcon(insight.tone)}</span><div><strong>${escapeHtml(copy.title)}</strong><small>${escapeHtml(copy.detail)}</small></div></article>`;
}

function insightCopy(item, c) {
  const area = painAreaLabel(item.area, c);
  const map = {
    adherence_on_track: [c('ความสม่ำเสมอดี', 'Consistency is on track'), c(`ทำแล้ว ${item.completed}/${item.planned} sessions (${item.value}%)`, `Completed ${item.completed}/${item.planned} sessions (${item.value}%)`)],
    adherence_watch: [c('แผนต้องยืดหยุ่น', 'The plan needs flexibility'), c(`ทำตามแผน ${item.value}% ให้ดูภาระงานและ Recovery ก่อนชดเชย Session`, `${item.value}% adherence. Check workload and recovery before making up sessions.`)],
    adherence_low: [c('อย่าเร่งชดเชยย้อนหลัง', 'Do not rush to catch up'), c(`ทำตามแผน ${item.value}% ให้เริ่มจากสัปดาห์ปัจจุบันและรักษาความสม่ำเสมอ`, `${item.value}% adherence. Restart from the current week and rebuild consistency.`)],
    distance_up: [c('ระยะเพิ่มจากช่วงก่อน', 'Distance increased'), c(`ระยะรวมเพิ่ม ${item.value}% ตรวจ Recovery และ Pain ควบคู่กัน`, `Total distance increased ${item.value}%. Review recovery and pain alongside it.`)],
    distance_down: [c('ระยะลดจากช่วงก่อน', 'Distance decreased'), c(`ระยะรวมลด ${Math.abs(item.value)}% อาจเป็น Deload, งานยุ่ง หรือการปรับเพื่ออาการเจ็บ`, `Total distance decreased ${Math.abs(item.value)}%. This may reflect a deload, life demands, or pain management.`)],
    recovery_good: [c('Recovery สนับสนุนการซ้อม', 'Recovery supports training'), c(`Recovery เฉลี่ย ${item.value}/100`, `Average recovery ${item.value}/100`)],
    recovery_mixed: [c('Recovery แกว่ง', 'Recovery is mixed'), c(`Recovery เฉลี่ย ${item.value}/100 ให้รักษาวัน Easy และ Rest`, `Average recovery ${item.value}/100. Protect easy and rest days.`)],
    recovery_low: [c('Recovery ยังไม่พอ', 'Recovery is insufficient'), c(`Recovery เฉลี่ย ${item.value}/100 ไม่ควรเร่ง Load`, `Average recovery ${item.value}/100. Avoid increasing load.`)],
    pain_hard_stop: [c('Pain Safety Gate ทำงาน', 'Pain Safety Gate is active'), c(`อาการสูงสุด ${item.value}/10${area ? ` · ${area}` : ''} หลีกเลี่ยง Downhill/Speed และประเมินอาการ`, `Maximum pain ${item.value}/10${area ? ` · ${area}` : ''}. Avoid downhill/speed and assess symptoms.`)],
    pain_worsening: [c('อาการเจ็บมีแนวโน้มสูงขึ้น', 'Pain is trending upward'), c(`ความรุนแรงเฉลี่ยช่วงหลังเพิ่ม ${formatNumber(item.value,1)} จุด${area ? ` · ${area}` : ''}`, `Average severity increased ${formatNumber(item.value,1)} points${area ? ` · ${area}` : ''}.`)],
    pain_improving: [c('อาการเจ็บมีแนวโน้มดีขึ้น', 'Pain is trending down'), c(`ความรุนแรงเฉลี่ยลด ${formatNumber(Math.abs(item.value),1)} จุด${area ? ` · ${area}` : ''}`, `Average severity decreased ${formatNumber(Math.abs(item.value),1)} points${area ? ` · ${area}` : ''}.`)],
    energy_deficit_high: [c('Energy deficit สูงเกินไป', 'Energy deficit is too high'), c(`เฉลี่ย ${signedNumber(item.value)} kcal/วันที่บันทึกครบ อาจกระทบ Recovery`, `${signedNumber(item.value)} kcal per complete day on average, which may impair recovery.`)],
    energy_deficit_watch: [c('ติดตาม Energy availability', 'Watch energy availability'), c(`เฉลี่ย ${signedNumber(item.value)} kcal/วันที่บันทึกครบ`, `${signedNumber(item.value)} kcal per complete day on average.`)],
    energy_balanced: [c('พลังงานอยู่ในช่วงจัดการได้', 'Energy balance is manageable'), c(`เฉลี่ย ${signedNumber(item.value)} kcal จาก ${item.days} วันที่บันทึกครบ`, `${signedNumber(item.value)} kcal average across ${item.days} complete days.`)],
    insufficient_data: [c('เริ่มเก็บข้อมูลต่อเนื่อง', 'Keep building consistent data'), c('เมื่อมี Activity, Recovery และอาหารครบมากขึ้น ระบบจะให้ Insight ที่แม่นขึ้น', 'Insights improve as activity, recovery, and complete food data accumulate.')]
  };
  const [title, detail] = map[item.code] || [item.code, ''];
  return { title, detail };
}

function barChart(buckets, { actualKey, planKey, unit, c, en }) {
  if (!buckets.length) return emptyChart(c('ยังไม่มีข้อมูลในช่วงนี้', 'No data in this range'));
  const max = Math.max(1, ...buckets.flatMap(item => [Number(item[actualKey]) || 0, Number(item[planKey]) || 0]));
  const plotWidth = SVG_WIDTH - CHART_LEFT - CHART_RIGHT;
  const plotHeight = SVG_HEIGHT - CHART_TOP - CHART_BOTTOM;
  const groupWidth = plotWidth / buckets.length;
  const barWidth = Math.max(4, Math.min(18, groupWidth * .27));
  const bars = buckets.map((item, index) => {
    const x = CHART_LEFT + groupWidth * index + groupWidth / 2;
    const actual = Number(item[actualKey]) || 0;
    const plan = Number(item[planKey]) || 0;
    const actualHeight = actual / max * plotHeight;
    const planHeight = plan / max * plotHeight;
    return `<g><rect class="chart-bar plan" x="${x - barWidth - 2}" y="${CHART_TOP + plotHeight - planHeight}" width="${barWidth}" height="${Math.max(0, planHeight)}" rx="3"><title>${c('แผน', 'Plan')} ${formatNumber(plan,1)} ${unit}</title></rect><rect class="chart-bar actual" x="${x + 2}" y="${CHART_TOP + plotHeight - actualHeight}" width="${barWidth}" height="${Math.max(0, actualHeight)}" rx="3"><title>${c('จริง', 'Actual')} ${formatNumber(actual,1)} ${unit}</title></rect><text class="chart-label" x="${x}" y="${SVG_HEIGHT - 15}" text-anchor="middle">${escapeHtml(shortBucketLabel(item, en))}</text></g>`;
  }).join('');
  return `<div class="progress-chart-scroll"><svg class="progress-svg" style="min-width:${Math.max(460,buckets.length*52)}px" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" role="img" aria-label="${c('กราฟจริงเทียบแผน', 'Actual versus planned chart')}">${gridLines(max)}${bars}</svg></div><div class="chart-legend"><span><i class="legend-bar plan"></i>${c('แผน', 'Plan')}</span><span><i class="legend-bar actual"></i>${c('จริง', 'Actual')}</span></div>`;
}

function scoreLineChart(series, { c, en }) {
  if (!series.length) return emptyChart(c('ยังไม่มีข้อมูลคะแนน', 'No score data yet'));
  const plotWidth = SVG_WIDTH - CHART_LEFT - CHART_RIGHT;
  const plotHeight = SVG_HEIGHT - CHART_TOP - CHART_BOTTOM;
  const point = (value, index) => {
    const x = CHART_LEFT + (series.length <= 1 ? plotWidth / 2 : index / (series.length - 1) * plotWidth);
    const y = CHART_TOP + plotHeight - (Math.max(0, Math.min(100, value)) / 100 * plotHeight);
    return [x, y];
  };
  const pathFor = getter => {
    let path = '';
    let started = false;
    series.forEach((item, index) => {
      const value = getter(item);
      if (value == null) { started = false; return; }
      const [x, y] = point(value, index);
      path += `${started ? ' L' : ' M'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      started = true;
    });
    return path.trim();
  };
  const strainPath = pathFor(item => item.strain == null ? null : item.strain / 21 * 100);
  const recoveryPath = pathFor(item => item.recovery);
  const readinessPath = pathFor(item => item.readiness);
  const labels = series.map((item, index) => {
    if (series.length > 14 && index % Math.ceil(series.length / 8) !== 0 && index !== series.length - 1) return '';
    const [x] = point(0, index);
    return `<text class="chart-label" x="${x}" y="${SVG_HEIGHT - 15}" text-anchor="middle">${escapeHtml(shortDate(item.date, en))}</text>`;
  }).join('');
  return `<div class="progress-chart-scroll"><svg class="progress-svg" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" role="img" aria-label="${c('แนวโน้มคะแนน', 'Score trends')}">${gridLines(100)}<path class="chart-line strain" d="${strainPath}"/><path class="chart-line recovery" d="${recoveryPath}"/><path class="chart-line readiness" d="${readinessPath}"/>${labels}</svg></div>`;
}

function gridLines(max) {
  return [0, .25, .5, .75, 1].map(ratio => {
    const y = CHART_TOP + (1 - ratio) * (SVG_HEIGHT - CHART_TOP - CHART_BOTTOM);
    return `<line class="chart-grid-line" x1="${CHART_LEFT}" y1="${y}" x2="${SVG_WIDTH - CHART_RIGHT}" y2="${y}"/><text class="chart-axis-label" x="${CHART_LEFT - 8}" y="${y + 4}" text-anchor="end">${formatNumber(max * ratio, max <= 21 ? 1 : 0)}</text>`;
  }).join('');
}

function painBars(buckets, en) {
  const max = Math.max(10, ...buckets.map(item => Number(item.painMax) || 0));
  return buckets.map(item => `<span title="${escapeHtml(shortBucketLabel(item,en))}: ${item.painMax}/10" style="--bar:${Math.max(4, item.painMax / max * 100)}%;--bar-color:${item.painMax >= 6 ? 'var(--red)' : item.painMax >= 3 ? 'var(--amber)' : 'var(--mint)'}"></span>`).join('');
}
function energyBars(buckets, en) {
  const max = Math.max(1, ...buckets.map(item => Math.abs(Number(item.netEnergyKcal) || 0)));
  return buckets.map(item => {
    const value = item.netEnergyKcal;
    const size = value == null ? 3 : Math.max(5, Math.abs(value) / max * 100);
    const color = value == null ? 'var(--muted-2)' : value < 0 ? 'var(--amber)' : 'var(--mint)';
    return `<span title="${escapeHtml(shortBucketLabel(item,en))}: ${value == null ? '—' : signedNumber(value)} kcal" style="--bar:${size}%;--bar-color:${color}"></span>`;
  }).join('');
}

function miniSummary(label, value) { return `<div><small>${escapeHtml(label)}</small><strong>${escapeHtml(String(value))}</strong></div>`; }
function coverageItem(label, value, total, pct, color) { return `<div class="coverage-item"><div class="section-head compact"><small>${escapeHtml(label)}</small><strong>${value}${total ? `/${total}` : ''}</strong></div>${pct == null ? '' : `<div class="progress"><span style="width:${Math.min(100,pct)}%;background:${color}"></span></div>`}</div>`; }
function emptyChart(text) { return `<div class="empty progress-empty-chart">${escapeHtml(text)}</div>`; }
function insightIcon(tone) { return tone === 'good' ? '✓' : tone === 'risk' ? '!' : tone === 'watch' ? '↗' : '•'; }
function adherenceTone(value) { return value == null ? 'neutral' : value >= 80 ? 'mint' : value >= 60 ? 'amber' : 'red'; }
function scoreTone(value) { return value == null ? 'neutral' : value >= 75 ? 'mint' : value >= 50 ? 'amber' : 'red'; }
function energyTone(value) { return value == null ? 'neutral' : value < -500 ? 'red' : value < -250 ? 'amber' : 'mint'; }
function signedNumber(value) { const numeric = Math.round(Number(value) || 0); return `${numeric > 0 ? '+' : ''}${formatNumber(numeric)}`; }
function formatDuration(minutes, en) { const total = Math.max(0, Number(minutes) || 0); const hours = Math.floor(total / 60); const mins = total % 60; return hours ? `${hours}${en ? 'h' : 'ชม.'} ${mins ? `${mins}${en ? 'm' : 'น.'}` : ''}`.trim() : `${mins}${en ? 'm' : 'น.'}`; }
function formatRange(start, end, en) { return `${formatDate(start,en)} – ${formatDate(end,en)}`; }
function formatDate(date, en) { return new Intl.DateTimeFormat(en ? 'en-GB' : 'th-TH', { day:'numeric', month:'short', year:'numeric' }).format(new Date(`${date}T00:00:00`)); }
function shortDate(date, en) { return new Intl.DateTimeFormat(en ? 'en-GB' : 'th-TH', { day:'numeric', month:'short' }).format(new Date(`${date}T00:00:00`)); }
function shortBucketLabel(item, en) { return item.startDate === item.endDate ? shortDate(item.startDate,en) : shortDate(item.startDate,en); }
function painAreaLabel(id, c) {
  const area = PAIN_AREAS.find(item => item.id === id);
  if (!area) return '';
  const english = { itb:'ITB / lateral knee', achilles:'Achilles tendon', plantar:'Plantar fascia / heel', knee:'Knee', calf:'Calf', ankle:'Ankle', hip:'Hip', back:'Back', other:'Other' }[id] || id;
  return c(area.label, english);
}
function painSummaryText(pain, c) { if (!pain.entries) return c('ยังไม่มี Pain Log ในช่วงนี้', 'No pain logs in this period'); const area = painAreaLabel(pain.worstArea?.area,c); return c(`บันทึก ${pain.entries} รายการ${area ? ` · จุดหลัก ${area}` : ''}${pain.worseningEntries ? ` · แย่ลง ${pain.worseningEntries} ครั้ง` : ''}`, `${pain.entries} entries${area ? ` · main area ${area}` : ''}${pain.worseningEntries ? ` · worsening ${pain.worseningEntries} times` : ''}`); }
function energySummaryText(energy, c) { if (!energy.completeDays) return c('ยังไม่มีวันที่ทำเครื่องหมายว่าบันทึกอาหารครบ', 'No days marked as fully logged'); return c(`Coverage ${energy.coveragePct}% · เฉลี่ย ${signedNumber(energy.averageNetKcal)} kcal/วัน`, `Coverage ${energy.coveragePct}% · ${signedNumber(energy.averageNetKcal)} kcal/day average`); }
function coverageMessage(coverage, c) { if (coverage.confidence >= 75) return c('ข้อมูลครอบคลุมดี เหมาะสำหรับดูแนวโน้มและใช้ประกอบการปรับแผน', 'Coverage is strong enough for trend review and plan adjustments.'); if (coverage.confidence >= 45) return c('ใช้ดูแนวโน้มได้ แต่ควรเติม Recovery และอาหารในวันที่ขาด', 'Trends are usable, but fill missing recovery and complete food days.'); return c('ข้อมูลยังไม่พอสำหรับข้อสรุปแรง ๆ ให้เก็บต่อเนื่องก่อนเพิ่มหรือลดโหลด', 'Coverage is still limited. Keep logging before making large load changes.'); }
