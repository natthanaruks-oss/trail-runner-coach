import { STORES, SOURCE_TYPES } from '../core/constants.js';
import { localDateKey, nowIso, formatThaiDate } from '../core/date.js';
import { calculateReadiness } from '../engines/readiness.js';
import { buildReadinessDraft, readinessFreshnessLabel, syncReadinessAndPlan } from '../core/auto-readiness.js';
import { pageHeader, rangeField, fieldNumber, escapeHtml, statusBadge, formatNumber } from './components.js';

export function renderCheckin(container, state, app) {
  const date = app.ui.checkinDate || localDateKey();
  const existing = state.checkins.find(item => item.date === date) || null;
  const { draft, context } = buildReadinessDraft({ existing, checkins: state.checkins, dateKey: date });
  const preview = calculateReadiness({
    checkin: draft,
    checkinHistory: state.checkins,
    activities: state.activities,
    painLogs: state.painLogs,
    settings: state.settings,
    dateKey: date
  });
  const en = app.language === 'en';

  container.innerHTML = `
    ${pageHeader(en ? 'Daily Readiness Check' : 'Daily Readiness Check', en ? "Last night\'s recovery, today\'s activity and a short human check-in" : 'ใช้การนอนเมื่อคืนและค่าฟื้นตัวล่าสุดกับวันนี้ทั้งวัน แล้วตอบเฉพาะสิ่งที่อุปกรณ์วัดไม่ได้', en ? 'Wake-day recovery logic' : 'เมื่อคืน → ความพร้อมวันนี้')}

    <section class="card readiness-auto-card">
      <div class="section-head">
        <div>
          <div class="card-title">${en ? 'Automatic recovery data' : 'ข้อมูลการฟื้นตัวอัตโนมัติ'}</div>
          <div class="submetric">${context.hasObjectiveData ? `${en ? 'Coverage' : 'ความครอบคลุม'} ${context.objectiveCoveragePct}% · ${en ? 'confidence' : 'ความมั่นใจ'} ${context.confidence}%` : (en ? 'No synced recovery data yet' : 'ยังไม่มีข้อมูลจากอุปกรณ์')}</div>
        </div>
        <button type="button" class="button secondary compact" data-readiness-sync>${en ? 'Sync latest' : 'Sync ข้อมูลล่าสุด'}</button>
      </div>
      <div class="readiness-device-grid">
        ${autoMetric(context.metrics.sleepHours, date, en, value => `${formatNumber(value, 1)} h`)}
        ${autoMetric(context.metrics.restingHr, date, en, value => `${formatNumber(value)} bpm`)}
        ${autoMetric(context.metrics.hrvMs, date, en, value => `${formatNumber(value)} ms`)}
        ${autoMetric(context.metrics.steps, date, en, value => formatNumber(value))}
        ${autoMetric(context.metrics.activeEnergyKcal, date, en, value => `${formatNumber(value)} kcal`)}
        ${autoMetric(context.metrics.walkingRunningDistanceKm, date, en, value => `${formatNumber(value, 2)} km`)}
      </div>
      <div class="callout ${context.hasObjectiveData ? '' : 'warning'}" data-readiness-sync-status>
        ${context.hasObjectiveData
          ? (en ? "Last night\'s sleep and morning recovery metrics stay attached to today for the full day. Current-day steps and energy update as you move." : 'การนอนเมื่อคืนและค่าฟื้นตัวช่วงเช้าจะใช้กับวันนี้ทั้งวัน ส่วนก้าวและพลังงานจะอัปเดตตามกิจกรรมของวันนี้')
          : (en ? 'Sync your devices first. The readiness score will remain conservative until objective recovery data is available.' : 'กด Sync ก่อน คะแนนจะคงความระมัดระวังจนกว่าจะมีข้อมูลการฟื้นตัวจากอุปกรณ์')}
      </div>
    </section>

    ${renderPreview(preview, existing, en)}

    <form id="checkin-form" class="card">
      <div class="section-head"><div><div class="card-title">${en ? 'How you feel today' : 'ความรู้สึกของคุณวันนี้'}</div><div class="submetric">${en ? 'Usually under 45 seconds' : 'ตอบเฉพาะส่วนที่อุปกรณ์วัดไม่ได้ ใช้เวลาประมาณ 30–45 วินาที'}</div></div></div>
      <div class="form-grid">
        <div class="field full"><label for="date">${en ? 'Date' : 'วันที่'}</label><input id="date" name="date" type="date" value="${date}"></div>
        <details class="field full readiness-manual-override"><summary>${en ? 'Manual recovery override (optional)' : 'แก้ไขข้อมูลจากอุปกรณ์ด้วยตนเอง (กรณีจำเป็น)'}</summary><div class="form-grid" style="margin-top:12px">
          ${fieldNumber({ name:'sleepHours', label:en ? 'Sleep hours' : 'ชั่วโมงนอน', value:draft.sleepHours ?? '', min:0, max:14, step:.1, placeholder:'6.5' })}
          ${fieldNumber({ name:'restingHr', label:'Resting HR', value:draft.restingHr ?? '', min:30, max:150, placeholder:'bpm' })}
          ${fieldNumber({ name:'hrvMs', label:'HRV', value:draft.hrvMs ?? '', min:1, max:300, placeholder:'ms' })}
        </div></details>
        ${rangeField({ name:'sleepQuality', label: en ? 'Perceived sleep quality · 1 poor – 5 good' : 'คุณภาพการนอนที่รู้สึก 1 แย่ – 5 ดี', value:existing?.sleepQuality ?? 3 })}
        ${rangeField({ name:'fatigue', label: en ? 'Fatigue · 1 low – 5 high' : 'ความล้า 1 น้อย – 5 มาก', value:existing?.fatigue ?? 3 })}
        ${rangeField({ name:'stress', label: en ? 'Stress / life load · 1 low – 5 high' : 'ความเครียด/ภาระชีวิต 1 น้อย – 5 มาก', value:existing?.stress ?? 3 })}
        ${rangeField({ name:'muscleSoreness', label: en ? 'Muscle soreness · 1 low – 5 high' : 'อาการล้ากล้ามเนื้อ 1 น้อย – 5 มาก', value:existing?.muscleSoreness ?? 3 })}
      </div>
      <hr>
      <div class="card-title">Pain Safety Gate · 0 ${en ? 'none' : 'ไม่เจ็บ'} – 10 ${en ? 'severe' : 'มากที่สุด'}</div>
      <div class="form-grid">
        ${painRange('painItb','ITB / ด้านข้างเข่า',existing?.pain?.itb ?? 0)}
        ${painRange('painAchilles','เอ็นร้อยหวาย',existing?.pain?.achilles ?? 0)}
        ${painRange('painPlantar','ฝ่าเท้า / รองช้ำ',existing?.pain?.plantar ?? 0)}
        ${painRange('painOther',en ? 'Other' : 'อื่น ๆ',existing?.pain?.other ?? 0)}
      </div>
      <hr>
      <div class="grid">
        ${checkBox('painWithWalking',en ? 'Pain during normal walking' : 'เจ็บขณะเดินหรือทำกิจวัตรปกติ',existing?.painWithWalking)}
        ${checkBox('alteredGait',en ? 'Changing gait to avoid pain' : 'เดินหรือวิ่งผิดรูปเพราะหลบอาการเจ็บ',existing?.alteredGait)}
        ${checkBox('swelling',en ? 'Unusual swelling, redness or heat' : 'มีบวม แดง หรือร้อนผิดปกติ',existing?.swelling)}
        ${checkBox('illnessSymptoms',en ? 'Illness, fever or unusual sore throat' : 'มีอาการคล้ายป่วย/ไข้/เจ็บคอผิดปกติ',existing?.illnessSymptoms)}
        ${checkBox('unusualDizziness',en ? 'Dizziness, faintness or chest discomfort' : 'เวียนศีรษะ หน้ามืด หรือแน่นหน้าอกผิดปกติ',existing?.unusualDizziness)}
      </div>
      <div class="field" style="margin-top:14px"><label for="note">${en ? 'Note' : 'หมายเหตุ'}</label><textarea id="note" name="note" rows="3" placeholder="${en ? 'Travel, work stress, unusual symptoms…' : 'เดินทาง ประชุมหนัก อาการตอนเช้า ฯลฯ'}">${escapeHtml(existing?.note || '')}</textarea></div>
      <button class="button primary full" style="margin-top:15px" type="submit">${en ? 'Save and recalculate readiness' : 'บันทึกและคำนวณ Readiness ใหม่'}</button>
    </form>
    <div id="checkin-result" style="margin-top:14px"></div>
    <div class="callout danger" style="margin-top:14px">${en ? 'Decision support only, not a diagnosis. Stop and seek professional assessment for severe pain, swelling, altered gait, dizziness or other unusual symptoms.' : 'ระบบนี้เป็น decision support ไม่ใช่การวินิจฉัย หากมีอาการปวดรุนแรง บวม เดินกะเผลก เวียนศีรษะ หรืออาการผิดปกติ ให้หยุดซ้อมและพบผู้เชี่ยวชาญ'}</div>
  `;

  bindRanges(container);
  const dateInput = container.querySelector('#date');
  dateInput.addEventListener('change', () => { app.ui.checkinDate = dateInput.value; app.render(); });

  container.querySelector('[data-readiness-sync]')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    const status = container.querySelector('[data-readiness-sync-status]');
    button.disabled = true;
    button.textContent = en ? 'Syncing…' : 'กำลัง Sync…';
    if (status) status.textContent = en ? 'Updating recovery data and matching recent workouts to the plan…' : 'กำลังอัปเดตข้อมูลการฟื้นตัวและจับคู่กิจกรรมล่าสุดกับแผนซ้อม…';
    try {
      const result = await syncReadinessAndPlan(app.store, { force: true, reason: 'readiness_manual' });
      const matched = Number(result.planResult?.autoMatched || 0);
      app.toast(en ? `Updated. ${matched} workout(s) matched to plan.` : `อัปเดตแล้ว จับคู่กิจกรรมกับแผน ${matched} รายการ`);
      app.render();
    } catch (error) {
      if (status) status.textContent = error.message || (en ? 'Sync failed' : 'Sync ไม่สำเร็จ');
      app.toast(error.message || (en ? 'Sync failed' : 'Sync ไม่สำเร็จ'));
      button.disabled = false;
      button.textContent = en ? 'Sync latest' : 'Sync ข้อมูลล่าสุด';
    }
  });

  container.querySelector('#checkin-form').addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const record = formToCheckin(data, draft, context);
    await app.store.upsertRecord(STORES.CHECKINS, record);
    const readiness = calculateReadiness({
      checkin: record,
      checkinHistory: app.store.getState().checkins,
      activities: app.store.getState().activities,
      painLogs: app.store.getState().painLogs,
      settings: app.store.getState().settings,
      dateKey: record.date
    });
    const resultContainer = container.querySelector('#checkin-result');
    renderResult(resultContainer, readiness, en);
    app.localize(resultContainer);
    app.toast(en ? 'Readiness saved' : 'บันทึก Readiness แล้ว');
  });
}

function autoMetric(metric, dateKey, en, formatter) {
  const label = metric?.label || 'Metric';
  const value = metric ? formatter(metric.value) : '—';
  const freshness = readinessFreshnessLabel(metric, dateKey, en ? 'en' : 'th');
  return `<div class="readiness-device-metric ${metric ? `freshness-${metric.freshness}` : 'missing'}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(freshness)}</small></div>`;
}

function renderPreview(readiness, existing, en) {
  const label = readiness.status === 'green' ? (en ? 'Ready for the planned session' : 'พร้อมทำตามแผน') : readiness.status === 'yellow' ? (en ? 'Reduce load or stay easy' : 'ลดโหลด/เปลี่ยนเป็น Easy') : (en ? 'Rest and assess symptoms' : 'พักและประเมินอาการ');
  return `<article class="card readiness-live-preview"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><div><div class="eyebrow">${existing ? (en ? 'CURRENT READINESS' : 'READINESS ปัจจุบัน') : (en ? 'AUTOMATIC PREVIEW' : 'PREVIEW จากข้อมูลอัตโนมัติ')}</div><div class="metric">${readiness.score}<small>/100</small></div></div>${statusBadge(readiness.status,label)}</div><div class="submetric">${en ? 'Confidence' : 'ความมั่นใจ'} ${readiness.confidence}% · ${readiness.subjectiveComplete ? (en ? 'human check-in complete' : 'ตอบ Check-in แล้ว') : (en ? 'complete the short check-in to unlock full confidence' : 'ตอบ Check-in ด้านล่างเพื่อยืนยันความรู้สึกและ Pain Safety Gate')}</div></article>`;
}

function painRange(name, label, value) {
  return `<div class="field full"><label for="${name}">${escapeHtml(label)}</label><div class="range-row"><input id="${name}" name="${name}" type="range" min="0" max="10" value="${value}"><output class="range-value" data-range-output="${name}">${value}</output></div></div>`;
}
function checkBox(name,label,checked) {
  return `<label class="check-row"><input type="checkbox" name="${name}" ${checked?'checked':''}><span>${escapeHtml(label)}</span></label>`;
}
function bindRanges(container) {
  container.querySelectorAll('input[type="range"]').forEach(input => input.addEventListener('input', () => {
    const output = container.querySelector(`[data-range-output="${input.name}"]`);
    if (output) output.value = input.value;
  }));
}
function formToCheckin(data, draft, context) {
  const getNumber = key => data.get(key) === '' ? null : Number(data.get(key));
  const sources = [...new Set([...(draft.sources || []), ...context.sources, SOURCE_TYPES.MANUAL].filter(Boolean).filter(source => source !== SOURCE_TYPES.HYBRID))];
  const objective = key => data.has(key) && data.get(key) !== '' ? Number(data.get(key)) : draft[key] ?? null;
  return {
    ...draft,
    date: data.get('date'),
    sleepHours: objective('sleepHours'),
    restingHr: objective('restingHr'),
    hrvMs: objective('hrvMs'),
    source: sources.length > 1 ? SOURCE_TYPES.HYBRID : (sources[0] || SOURCE_TYPES.MANUAL),
    sources,
    sleepQuality: getNumber('sleepQuality'),
    fatigue: getNumber('fatigue'),
    stress: getNumber('stress'),
    muscleSoreness: getNumber('muscleSoreness'),
    pain: {
      itb: getNumber('painItb'),
      achilles: getNumber('painAchilles'),
      plantar: getNumber('painPlantar'),
      other: getNumber('painOther')
    },
    painWithWalking: data.has('painWithWalking'),
    alteredGait: data.has('alteredGait'),
    swelling: data.has('swelling'),
    illnessSymptoms: data.has('illnessSymptoms'),
    unusualDizziness: data.has('unusualDizziness'),
    note: data.get('note') || '',
    autoMetricDates: context.autoMetricDates,
    autoMetricEffectiveDates: context.autoMetricEffectiveDates,
    autoMetricAlignments: context.autoMetricAlignments,
    autoReadiness: {
      coveragePct: context.objectiveCoveragePct,
      confidence: context.confidence,
      generatedAt: nowIso(),
      latestMetricDate: context.lastMetricDate,
      latestSourceMetricDate: context.lastSourceMetricDate,
      recoveryDatePolicy: context.recoveryDatePolicy
    },
    createdAt: draft.createdAt || nowIso(),
    updatedAt: nowIso()
  };
}
function renderResult(container, readiness, en = false) {
  const label = readiness.status === 'green' ? (en ? 'Ready for plan' : 'พร้อมทำตามแผน') : readiness.status === 'yellow' ? (en ? 'Reduce load / easy' : 'ลดโหลด/เปลี่ยนเป็น Easy') : (en ? 'Rest and assess' : 'พักและประเมินอาการ');
  container.innerHTML = `<article class="card"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><div><div class="card-title">${en ? 'Readiness today' : 'Readiness วันนี้'}</div><div class="metric">${readiness.score}<small>/100</small></div></div>${statusBadge(readiness.status,label)}</div><div class="grid two" style="margin-top:14px"><div><div class="card-title">Recovery</div><div class="metric" style="font-size:24px">${readiness.recovery.score ?? '—'}<small>/100</small></div></div><div><div class="card-title">${en ? 'Yesterday strain' : 'Strain เมื่อวาน'}</div><div class="metric" style="font-size:24px">${readiness.previousDayStrain.score}<small>/21</small></div></div></div><div class="submetric">Confidence ${readiness.confidence}% · ${escapeHtml(readiness.flags.join(' · ') || (en ? 'No prominent warning' : 'ไม่มีสัญญาณเตือนเด่น'))}</div><a class="button secondary full" href="#/scores" style="display:grid;place-items:center;margin-top:12px">${en ? 'See score reasons' : 'ดูเหตุผลของคะแนน'}</a></article>`;
}
