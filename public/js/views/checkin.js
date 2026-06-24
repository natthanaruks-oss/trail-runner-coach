import { STORES, SOURCE_TYPES } from '../core/constants.js';
import { localDateKey, nowIso } from '../core/date.js';
import { calculateReadiness } from '../engines/readiness.js';
import { pageHeader, rangeField, fieldNumber, escapeHtml, statusBadge } from './components.js';

export function renderCheckin(container, state, app) {
  const date = app.ui.checkinDate || localDateKey();
  const existing = state.checkins.find(item => item.date === date) || {};
  const existingProvider = existing.sources?.includes('apple_health') ? 'apple_health' : existing.sources?.includes('garmin') ? 'garmin' : existing.sources?.includes('suunto') ? 'suunto' : existing.source;
  container.innerHTML = `
    ${pageHeader('Daily Readiness Check', 'ใช้เวลา 60–90 วินาที ก่อนตัดสินใจซ้อม', 'Recovery before ego')}
    <form id="checkin-form" class="card">
      <div class="form-grid">
        <div class="field full"><label for="date">วันที่</label><input id="date" name="date" type="date" value="${date}"></div>
        ${fieldNumber({ name:'sleepHours', label:'นอนกี่ชั่วโมง', value:existing.sleepHours ?? '', min:0, max:14, step:.1, placeholder:'เช่น 6.5' })}
        ${fieldNumber({ name:'restingHr', label:'Resting HR ตอนตื่น', value:existing.restingHr ?? '', min:30, max:150, placeholder:'bpm' })}
        ${fieldNumber({ name:'hrvMs', label:'HRV (ถ้ามี)', value:existing.hrvMs ?? '', min:1, max:300, placeholder:'ms' })}
        <div class="field"><label for="source">แหล่งข้อมูล</label><select id="source" name="source"><option value="manual">กรอกเอง</option><option value="garmin" ${existingProvider==='garmin'?'selected':''}>Garmin</option><option value="suunto" ${existingProvider==='suunto'?'selected':''}>Suunto</option><option value="apple_health" ${existingProvider==='apple_health'?'selected':''}>Apple Health</option></select></div>
        ${rangeField({ name:'sleepQuality', label:'คุณภาพการนอน 1 แย่ – 5 ดี', value:existing.sleepQuality ?? 3 })}
        ${rangeField({ name:'fatigue', label:'ความล้า 1 น้อย – 5 มาก', value:existing.fatigue ?? 3 })}
        ${rangeField({ name:'stress', label:'ความเครียด/ภาระงาน 1 น้อย – 5 มาก', value:existing.stress ?? 3 })}
        ${rangeField({ name:'muscleSoreness', label:'อาการล้ากล้ามเนื้อ 1 น้อย – 5 มาก', value:existing.muscleSoreness ?? 3 })}
      </div>
      <hr>
      <div class="card-title">Pain Safety Gate · 0 ไม่เจ็บ – 10 มากที่สุด</div>
      <div class="form-grid">
        ${painRange('painItb','ITB / ด้านข้างเข่า',existing.pain?.itb ?? 0)}
        ${painRange('painAchilles','เอ็นร้อยหวาย',existing.pain?.achilles ?? 0)}
        ${painRange('painPlantar','ฝ่าเท้า / รองช้ำ',existing.pain?.plantar ?? 0)}
        ${painRange('painOther','อื่น ๆ',existing.pain?.other ?? 0)}
      </div>
      <hr>
      <div class="grid">
        ${checkBox('painWithWalking','เจ็บขณะเดินหรือทำกิจวัตรปกติ',existing.painWithWalking)}
        ${checkBox('alteredGait','เดินหรือวิ่งผิดรูปเพราะหลบอาการเจ็บ',existing.alteredGait)}
        ${checkBox('swelling','มีบวม แดง หรือร้อนผิดปกติ',existing.swelling)}
        ${checkBox('illnessSymptoms','มีอาการคล้ายป่วย/ไข้/เจ็บคอผิดปกติ',existing.illnessSymptoms)}
        ${checkBox('unusualDizziness','เวียนศีรษะ หน้ามืด หรือแน่นหน้าอกผิดปกติ',existing.unusualDizziness)}
      </div>
      <div class="field" style="margin-top:14px"><label for="note">หมายเหตุ</label><textarea id="note" name="note" rows="3" placeholder="เดินทาง ประชุมหนัก อาการตอนเช้า ฯลฯ">${escapeHtml(existing.note || '')}</textarea></div>
      <button class="button primary full" style="margin-top:15px" type="submit">คำนวณและบันทึก Readiness</button>
    </form>
    <div id="checkin-result" style="margin-top:14px"></div>
    <div class="callout danger" style="margin-top:14px">ระบบนี้เป็น decision support ไม่ใช่การวินิจฉัย หากมีอาการปวดรุนแรง บวม เดินกะเผลก เวียนศีรษะ หรืออาการผิดปกติ ให้หยุดซ้อมและพบผู้เชี่ยวชาญ</div>
  `;

  bindRanges(container);
  const dateInput = container.querySelector('#date');
  dateInput.addEventListener('change', () => { app.ui.checkinDate = dateInput.value; app.render(); });
  container.querySelector('#checkin-form').addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const record = formToCheckin(data, existing);
    await app.store.upsertRecord(STORES.CHECKINS, record);
    const readiness = calculateReadiness({
      checkin: record,
      checkinHistory: app.store.getState().checkins,
      activities: app.store.getState().activities,
      painLogs: app.store.getState().painLogs,
      settings: app.store.getState().settings,
      dateKey: record.date
    });
    renderResult(container.querySelector('#checkin-result'), readiness);
    app.toast('บันทึก Readiness แล้ว');
  });
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
function formToCheckin(data, existing) {
  const getNumber = key => data.get(key) === '' ? null : Number(data.get(key));
  const selectedSource = data.get('source') || SOURCE_TYPES.MANUAL;
  const existingSources = existing.sources || (existing.source && existing.source !== SOURCE_TYPES.HYBRID ? [existing.source] : []);
  const sources = [...new Set([...existingSources, selectedSource, SOURCE_TYPES.MANUAL].filter(source => source && source !== SOURCE_TYPES.HYBRID))];
  return {
    ...existing,
    date: data.get('date'),
    source: sources.length > 1 ? SOURCE_TYPES.HYBRID : selectedSource,
    sources,
    sleepHours: getNumber('sleepHours'),
    restingHr: getNumber('restingHr'),
    hrvMs: getNumber('hrvMs'),
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
    createdAt: existing.createdAt || nowIso(),
    updatedAt: nowIso()
  };
}
function renderResult(container, readiness) {
  const label = readiness.status === 'green' ? 'พร้อมทำตามแผน' : readiness.status === 'yellow' ? 'ลดโหลด/เปลี่ยนเป็น Easy' : 'พักและประเมินอาการ';
  container.innerHTML = `<article class="card"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><div><div class="card-title">Readiness วันนี้</div><div class="metric">${readiness.score}<small>/100</small></div></div>${statusBadge(readiness.status,label)}</div><div class="grid two" style="margin-top:14px"><div><div class="card-title">Recovery</div><div class="metric" style="font-size:24px">${readiness.recovery.score ?? '—'}<small>/100</small></div></div><div><div class="card-title">Strain เมื่อวาน</div><div class="metric" style="font-size:24px">${readiness.previousDayStrain.score}<small>/21</small></div></div></div><div class="submetric">Confidence ${readiness.confidence}% · ${escapeHtml(readiness.flags.join(' · ') || 'ไม่มีสัญญาณเตือนเด่น')}</div><a class="button secondary full" href="#/scores" style="display:grid;place-items:center;margin-top:12px">ดูเหตุผลของคะแนน</a></article>`;
}
