import { rehabExercises, runningDrills } from '../data/rehab.js';
import { STORES } from '../core/constants.js';
import { createId } from '../core/id.js';
import { localDateKey, nowIso } from '../core/date.js';
import { pageHeader, escapeHtml } from './components.js';

export function renderRehab(container, state, app) {
  const today = localDateKey();
  const doneToday = new Set(state.rehabLogs.filter(log => log.date === today).map(log => log.exerciseId));
  container.innerHTML = `
    ${pageHeader('Rehab & Prehab', 'งานสนับสนุนที่ต้องทำสม่ำเสมอ ไม่ใช่งานเสริมเมื่อมีเวลา', 'Protect the finish')}
    <div class="callout good">เป้าหมายคือเพิ่มความทนต่อโหลด ไม่ใช่ทำจนปวด ท่าใดทำแล้วอาการเพิ่มขึ้นชัดเจนให้หยุดและลดระดับ</div>
    <section class="section">
      <div class="section-head"><h2>คลังท่าหลัก</h2><span>${doneToday.size} ทำแล้ววันนี้</span></div>
      <div class="list">
        ${rehabExercises.map(exercise => `<article class="card flat">
          <div style="display:flex;gap:12px;align-items:flex-start">
            <button class="icon-button" data-exercise="${exercise.id}" style="flex:0 0 auto;color:${doneToday.has(exercise.id)?'var(--green)':'var(--muted)'}">${doneToday.has(exercise.id)?'✓':'○'}</button>
            <div class="grow">
              <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap"><strong>${escapeHtml(exercise.name)}</strong>${exercise.priority==='high'?'<span class="tag done">Priority</span>':''}</div>
              <div class="submetric">${escapeHtml(exercise.target)} · ${escapeHtml(exercise.prescription)}</div>
              <ul style="padding-left:18px;margin:10px 0 0;color:var(--muted);font-size:12px;line-height:1.6">${exercise.cues.map(cue=>`<li>${escapeHtml(cue)}</li>`).join('')}</ul>
              <div style="margin-top:8px;color:var(--red);font-size:10px">หยุดเมื่อ: ${escapeHtml(exercise.stopIf)}</div>
            </div>
          </div>
        </article>`).join('')}
      </div>
    </section>
    <section class="section">
      <div class="section-head"><h2>Running Drills</h2><span>ใช้เท่าที่จำเป็น</span></div>
      <div class="grid two">${runningDrills.map(drill=>`<article class="card flat"><strong>${escapeHtml(drill.name)}</strong><div class="submetric">${escapeHtml(drill.purpose)}</div><div style="margin-top:10px;color:var(--mint);font-size:12px;font-weight:800">${escapeHtml(drill.prescription)}</div></article>`).join('')}</div>
    </section>
  `;

  container.querySelectorAll('[data-exercise]').forEach(button => button.addEventListener('click', async () => {
    const exerciseId = button.dataset.exercise;
    const existing = state.rehabLogs.find(log => log.date === today && log.exerciseId === exerciseId);
    if (existing) await app.store.deleteRecord(STORES.REHAB, existing.id);
    else await app.store.upsertRecord(STORES.REHAB, { id:createId('rehab'), date:today, exerciseId, completed:true, source:'manual', createdAt:nowIso() });
    app.render();
  }));
}
