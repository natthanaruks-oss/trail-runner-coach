import { selectScoreHistory, selectToday } from '../core/selectors.js';
import { STORES } from '../core/constants.js';
import { buildCalibrationProfile, calibrationFeedbackId, createCalibrationFeedback, isCalibrationFeedback, readinessAnswerToScore } from '../engines/calibration.js';
import { pageHeader, escapeHtml, formatNumber } from './components.js';
import { formatThaiDate, localDateKey } from '../core/date.js';

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

const FEEDBACK_LABELS = {
  1: 'แย่มาก',
  2: 'ไม่พร้อม',
  3: 'พอไหว',
  4: 'พร้อม',
  5: 'พร้อมมาก'
};

export function renderScores(container, state, app) {
  const today = selectToday(state);
  const history = selectScoreHistory(state, 14, today.dateKey);
  const readiness = today.readiness;
  const recovery = today.recovery;
  const strain = today.strain;
  const learningProfile = buildCalibrationProfile(state, today.dateKey, { includeEndDate: true });
  const selectedFeedbackDate = app.ui.calibrationDate || today.dateKey;
  const selectedSnapshot = selectToday(state, selectedFeedbackDate);
  const existingFeedback = state.metadata.find(item => item.id === calibrationFeedbackId(selectedFeedbackDate)) || null;
  const allFeedback = state.metadata.filter(isCalibrationFeedback).sort((a, b) => String(b.date).localeCompare(String(a.date)));

  container.innerHTML = `
    ${pageHeader('Strain & Recovery', 'คะแนนช่วยตัดสินใจ ไม่ใช่การวินิจฉัย และ Pain Safety Gate มีสิทธิ์เหนือคะแนนเสมอ', 'Adaptive load intelligence')}

    <section class="score-ring-grid large">
      ${scoreCard('STRAIN', strain.score, 21, strain.normalizedScore, strainColor(strain.score), `${strain.classification.label} · ${strain.totalLoad} load units${strain.calibrationAdjustment ? ` · calibrated ${signed(strain.calibrationAdjustment)}` : ''}`, strain.confidence)}
      ${scoreCard('RECOVERY', recovery?.score, 100, recovery?.score || 0, recoveryColor(recovery?.score), recovery ? recoverySummary(recovery) : 'ต้องมี Daily Check-in', recovery?.confidence || 0)}
      ${scoreCard('READINESS', readiness?.score, 100, readiness?.score || 0, readinessColor(readiness?.status), readiness ? `${readinessSummary(readiness)}${readiness.calibrationAdjustment ? ` · calibrated ${signed(readiness.calibrationAdjustment)}` : ''}` : 'กรอก Pain / Fatigue ก่อนซ้อม', readiness?.confidence || 0)}
    </section>

    <section class="section" id="score-calibration">
      <div class="section-head"><h2>Personal Score Calibration</h2><span>เรียนรู้จากความรู้สึกจริงของคุณ</span></div>
      <article class="card calibration-hero">
        <div class="calibration-status">
          <div><span class="status ${phaseStatusClass(learningProfile.phase)}">${phaseLabel(learningProfile.phase)}</span><h3>${calibrationHeadline(learningProfile)}</h3><p>${calibrationDescription(learningProfile)}</p></div>
          <label class="switch-row"><input type="checkbox" data-calibration-enabled ${state.settings.scoring?.calibrationEnabled !== false ? 'checked' : ''}><span>เปิดการปรับคะแนนอัตโนมัติ</span></label>
        </div>
        <div class="grid four calibration-metrics">
          ${calibrationMetric('Feedback', learningProfile.readinessFeedbackCount, `/ ${learningProfile.personalizedDays} วัน`)}
          ${calibrationMetric('Readiness offset', signed(learningProfile.readinessBias), 'คะแนน')}
          ${calibrationMetric('Strain offset', signed(learningProfile.strainBias), '/21')}
          ${calibrationMetric('Confidence', `${learningProfile.confidence}%`, learningProfile.phase === 'personalized' ? 'Personalized' : 'กำลังเรียนรู้')}
        </div>
        <div class="progress" style="margin-top:14px"><span style="width:${Math.min(100, learningProfile.readinessFeedbackCount / learningProfile.personalizedDays * 100)}%;background:var(--mint)"></span></div>
        <small class="muted-line">เริ่มปรับแบบระมัดระวังเมื่อครบ 7 วัน และเป็น Personalized เต็มรูปแบบเมื่อมีอย่างน้อย 21 วัน · Feedback วันนี้จะเริ่มมีผลกับคะแนนวันถัดไป</small>
      </article>

      <article class="card" style="margin-top:12px">
        <div class="section-head compact"><h3>Calibration Check — ใช้เวลาไม่ถึง 30 วินาที</h3><span>บอกระบบว่าร่างกายจริงต่างจากคะแนนอย่างไร</span></div>
        <form id="calibration-feedback-form">
          <div class="form-grid">
            <div class="field"><label>วันที่ประเมิน</label><input type="date" name="date" max="${localDateKey()}" value="${escapeHtml(selectedFeedbackDate)}"></div>
            <div class="field"><label>Session outcome</label><select name="sessionOutcome">
              ${outcomeOption('none', 'ยังไม่ได้ซ้อม / Rest day', existingFeedback)}
              ${outcomeOption('easier', 'ง่ายกว่าที่คาด', existingFeedback)}
              ${outcomeOption('as_expected', 'ใกล้เคียงที่คาด', existingFeedback)}
              ${outcomeOption('harder', 'หนักกว่าที่คาด', existingFeedback)}
              ${outcomeOption('stopped', 'ต้องหยุดเพราะร่างกาย', existingFeedback)}
            </select></div>
            <div class="field full"><label>วันนี้ร่างกายพร้อมจริงแค่ไหน</label><div class="feedback-scale">${[1,2,3,4,5].map(value => feedbackChoice(value, existingFeedback?.actualReadiness || 3)).join('')}</div></div>
            <div class="field"><label>โหลดรวมที่รู้สึกจริง 0–21 (ไม่บังคับ)</label><input type="number" name="perceivedStrain" min="0" max="21" step="0.1" value="${existingFeedback?.perceivedStrain ?? ''}" placeholder="เช่น 12.5"></div>
            <div class="field"><label>คะแนนที่แอปคาดไว้</label><div class="readonly-metric">Readiness ${selectedSnapshot.readiness?.score ?? '—'} · Strain ${formatNumber(selectedSnapshot.strain?.score ?? 0,1)}</div></div>
            <div class="field full"><label>หมายเหตุ (ไม่บังคับ)</label><textarea name="note" rows="2" placeholder="เช่น นอนพอแต่เดินทางทั้งวัน / ขาล้าจากลงเขา">${escapeHtml(existingFeedback?.note || '')}</textarea></div>
          </div>
          <div class="button-row" style="margin-top:14px"><button class="button primary" ${!selectedSnapshot.readiness ? 'title="ควรมี Daily Check-in เพื่อ calibrate Readiness"' : ''}>${existingFeedback ? 'อัปเดต Feedback' : 'บันทึก Feedback'}</button>${existingFeedback ? '<button type="button" class="button secondary" data-delete-calibration-feedback>ลบรายการนี้</button>' : ''}</div>
        </form>
        ${!selectedSnapshot.readiness ? '<div class="callout" style="margin-top:12px">วันนี้ยังไม่มี Daily Check-in: ระบบเก็บ Perceived Strain ได้ แต่ Readiness feedback จะเริ่มใช้ได้หลังมีคะแนน Readiness ของวันนั้น</div>' : ''}
      </article>

      <div class="grid two" style="margin-top:12px">
        <article class="card flat"><div class="card-title">Baseline ส่วนตัว</div><div class="list compact-list">
          ${baselineRangeRow('Resting HR', recovery?.baseline?.restingHr, recovery?.baseline?.restingHrSpread, 'bpm')}
          ${baselineRangeRow('HRV', recovery?.baseline?.hrvMs, recovery?.baseline?.hrvSpread, 'ms')}
          ${baselineRangeRow('Sleep target', state.settings.athlete?.sleepTargetHours || 7.5, null, 'ชม.')}
        </div><small>เมื่อมีข้อมูลอย่างน้อย 7 วัน ระบบใช้ median และความแปรปรวนของคุณเอง แทน threshold ตายตัวเพียงอย่างเดียว</small></article>
        <article class="card flat"><div class="card-title">การเรียนรู้ของโมเดล</div><div class="list compact-list">
          ${modifierRows(learningProfile.componentModifiers)}
        </div><small>น้ำหนักแต่ละปัจจัยปรับได้ในกรอบจำกัด ±15% เท่านั้น และ Pain/Illness Safety Gate จะไม่ถูกลดทอนโดย Calibration</small></article>
      </div>

      <article class="card flat" style="margin-top:12px">
        <div class="section-head compact"><h3>Feedback ล่าสุด</h3>${allFeedback.length ? '<button class="button ghost small" data-reset-calibration>ล้าง Calibration</button>' : ''}</div>
        <div class="list">${allFeedback.length ? allFeedback.slice(0,7).map(feedbackRow).join('') : '<div class="empty">ยังไม่มี Feedback — บันทึกวันละ 1 ครั้งเพื่อให้คะแนนเรียนรู้ร่างกายคุณ</div>'}</div>
      </article>
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
        <article class="card flat"><div class="card-title">Readiness 0–100</div><strong>พร้อมกับงานวันนี้หรือไม่</strong><div class="submetric">Recovery + Personal Calibration + Pain Safety Gate + แนวโน้มโหลด หาก Pain ≥6 ระบบบังคับ Red</div></article>
      </div>
    </section>

    ${readiness ? `<section class="section"><div class="callout ${readiness.status === 'red' ? 'danger' : readiness.status === 'green' ? 'good' : ''}"><strong>${escapeHtml(readinessSummary(readiness))}</strong><br>ข้อมูลวันนี้: ${readiness.confidence}% confidence · ${escapeHtml(readiness.flags.length ? readiness.flags.map(flagLabel).join(' · ') : 'ไม่มีสัญญาณเตือนเพิ่มเติม')}</div></section>` : ''}
  `;

  bindCalibrationEvents(container, state, app);
}

function bindCalibrationEvents(container, state, app) {
  container.querySelector('[data-calibration-enabled]')?.addEventListener('change', async event => {
    await app.store.saveSettings({ scoring: { calibrationEnabled: event.currentTarget.checked } });
    app.toast(event.currentTarget.checked ? 'เปิด Personal Calibration แล้ว' : 'ปิด Personal Calibration แล้ว');
    app.render();
  });

  container.querySelector('#calibration-feedback-form [name="date"]')?.addEventListener('change', event => {
    app.ui.calibrationDate = event.currentTarget.value || localDateKey();
    app.render();
  });

  container.querySelector('#calibration-feedback-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const date = data.get('date') || localDateKey();
    const snapshot = selectToday(app.store.getState(), date);
    const existing = state.metadata.find(item => item.id === calibrationFeedbackId(date));
    const record = createCalibrationFeedback({
      date,
      actualReadiness: data.get('actualReadiness'),
      perceivedStrain: data.get('perceivedStrain'),
      sessionOutcome: data.get('sessionOutcome'),
      note: data.get('note'),
      predicted: {
        readiness: snapshot.readiness?.score,
        recovery: snapshot.recovery?.score,
        strain: snapshot.strain?.score,
        recoveryComponents: snapshot.recovery?.components || [],
        createdAt: existing?.createdAt
      }
    });
    await app.store.upsertRecord(STORES.META, record);
    app.toast('บันทึก Calibration Feedback แล้ว');
    app.render();
  });

  container.querySelector('[data-delete-calibration-feedback]')?.addEventListener('click', async () => {
    const date = app.ui.calibrationDate || localDateKey();
    if (!confirm('ลบ Calibration Feedback ของวันนี้?')) return;
    await app.store.deleteRecord(STORES.META, calibrationFeedbackId(date));
    app.toast('ลบ Feedback แล้ว');
    app.render();
  });

  container.querySelectorAll('[data-edit-calibration-date]').forEach(button => button.addEventListener('click', () => {
    app.ui.calibrationDate = button.dataset.editCalibrationDate;
    app.render();
    requestAnimationFrame(() => document.querySelector('#score-calibration')?.scrollIntoView({ block: 'start' }));
  }));

  container.querySelector('[data-reset-calibration]')?.addEventListener('click', async () => {
    if (!confirm('ล้าง Feedback และเริ่มเรียนรู้ Calibration ใหม่ทั้งหมด? ข้อมูลสุขภาพและกิจกรรมจะไม่ถูกลบ')) return;
    const rows = app.store.getState().metadata.filter(isCalibrationFeedback);
    for (const row of rows) await app.store.deleteRecord(STORES.META, row.id);
    app.toast('ล้าง Calibration แล้ว');
    app.render();
  });
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
function calibrationMetric(label, value, suffix) { return `<div><div class="card-title">${escapeHtml(label)}</div><div class="metric calibration-number">${escapeHtml(String(value))}</div><small>${escapeHtml(suffix)}</small></div>`; }
function baselineRangeRow(label, center, spread, unit) { return `<div class="list-item"><div class="grow"><strong>${escapeHtml(label)}</strong><small>${center == null ? 'กำลังสร้าง Baseline' : spread ? `ค่ากลาง ${formatNumber(center,1)} · ช่วงปกติโดยประมาณ ±${formatNumber(spread,1)} ${unit}` : `ค่ากลาง ${formatNumber(center,1)} ${unit}`}</small></div></div>`; }
function modifierRows(modifiers) {
  const entries = Object.entries(modifiers || {});
  if (!entries.length) return '<div class="empty">รอ Feedback อย่างน้อย 7 วันก่อนปรับน้ำหนักปัจจัย</div>';
  return entries.sort((a,b)=>Math.abs(b[1]-1)-Math.abs(a[1]-1)).slice(0,6).map(([key,value]) => `<div class="list-item"><div class="grow"><strong>${escapeHtml(DRIVER_LABELS[key] || key)}</strong></div><span class="status neutral">×${formatNumber(value,2)}</span></div>`).join('');
}
function feedbackChoice(value, selected) { return `<label class="feedback-choice"><input type="radio" name="actualReadiness" value="${value}" ${Number(selected) === value ? 'checked' : ''}><span><strong>${value}</strong><small>${FEEDBACK_LABELS[value]}</small></span></label>`; }
function outcomeOption(value, label, feedback) { return `<option value="${value}" ${feedback?.sessionOutcome === value ? 'selected' : ''}>${escapeHtml(label)}</option>`; }
function feedbackRow(item) {
  const actual = readinessAnswerToScore(item.actualReadiness);
  return `<article class="list-item"><div class="grow"><strong>${escapeHtml(formatThaiDate(item.date))}</strong><small>Readiness คาด ${item.predicted?.readiness ?? '—'} → รู้สึกจริง ${actual}/100 · Strain คาด ${item.predicted?.strain ?? '—'}${item.perceivedStrain == null ? '' : ` → รู้สึก ${item.perceivedStrain}`}</small></div><button class="button ghost small" data-edit-calibration-date="${escapeHtml(item.date)}">แก้ไข</button></article>`;
}
function phaseLabel(phase) { return phase === 'personalized' ? 'PERSONALIZED' : phase === 'learning' ? 'LEARNING' : 'BOOTSTRAP'; }
function phaseStatusClass(phase) { return phase === 'personalized' ? 'green' : phase === 'learning' ? 'yellow' : 'neutral'; }
function calibrationHeadline(profile) { return profile.phase === 'personalized' ? 'โมเดลปรับตามการตอบสนองของคุณแล้ว' : profile.phase === 'learning' ? 'โมเดลกำลังเรียนรู้รูปแบบการฟื้นตัวของคุณ' : 'เริ่มเก็บ Feedback เพื่อสร้างโมเดลส่วนตัว'; }
function calibrationDescription(profile) { const left = Math.max(0, profile.personalizedDays - profile.readinessFeedbackCount); return profile.phase === 'personalized' ? `ใช้ Feedback ${profile.readinessFeedbackCount} วัน และยังปรับต่อแบบค่อยเป็นค่อยไป` : `เหลืออีก ${left} วันถึงระดับ Personalized เต็มรูปแบบ`; }
function recoverySummary(recovery) { return recovery.score >= 75 ? 'ฟื้นตัวดี' : recovery.score >= 50 ? 'ฟื้นตัวปานกลาง' : 'ฟื้นตัวยังไม่พอ'; }
function readinessSummary(readiness) { return readiness.status === 'green' ? 'พร้อมซ้อมตามแผน' : readiness.status === 'yellow' ? 'ลดระยะหรือความหนัก' : 'พักและประเมินอาการ'; }
function strainColor(score) { return score >= 17 ? 'var(--red)' : score >= 13 ? 'var(--amber)' : score >= 8 ? 'var(--blue)' : 'var(--mint)'; }
function recoveryColor(score) { return score == null ? 'var(--blue)' : score >= 75 ? 'var(--green)' : score >= 50 ? 'var(--amber)' : 'var(--red)'; }
function readinessColor(status) { return status === 'green' ? 'var(--green)' : status === 'yellow' ? 'var(--amber)' : status === 'red' ? 'var(--red)' : 'var(--blue)'; }
function formatDelta(value) { return value == null ? '—' : `${value > 0 ? '+' : ''}${formatNumber(value,1)}`; }
function flagLabel(flag) { return String(flag).replaceAll('_', ' '); }
function signed(value) { const number = Number(value) || 0; return `${number > 0 ? '+' : ''}${formatNumber(number,1)}`; }
