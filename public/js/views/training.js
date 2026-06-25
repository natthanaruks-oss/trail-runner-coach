import { STORES } from '../core/constants.js';
import { createId } from '../core/id.js';
import { localDateKey, nowIso } from '../core/date.js';
import { rehabExercises } from '../data/rehab.js';
import { strengthExercises, runningDrills, homeEquipment } from '../data/training-library.js';
import { escapeHtml, pageHeader } from './components.js';

const TABS = [['rehab','Rehab'],['strength','Strength'],['drills','Drills'],['equipment','อุปกรณ์']];

export function renderTraining(container,state,app){
  app.ui.trainingTab ||= 'rehab';
  const tab=app.ui.trainingTab;
  container.innerHTML=`${pageHeader('ฝึก','Rehab, Strength, Running Drills และอุปกรณ์ — คง workflow เดิมไว้ครบ','Strength & movement library')}
  <div class="segmented-scroll">${TABS.map(([k,l])=>`<button class="segmented-button ${tab===k?'active':''}" data-training-tab="${k}">${l}</button>`).join('')}</div>
  <div id="training-content" class="section"></div>`;
  container.querySelectorAll('[data-training-tab]').forEach(button=>button.addEventListener('click',()=>{app.ui.trainingTab=button.dataset.trainingTab;app.render();}));
  const content=container.querySelector('#training-content');
  if(tab==='rehab')renderExerciseList(content,state,app,rehabExercises,'🩹 ทำทุกวันหรือวันเว้นวันตามอาการ เน้น 3 จุดเสี่ยงเดิม และหยุดเมื่อปวดเพิ่ม','rehab');
  else if(tab==='strength')renderExerciseList(content,state,app,strengthExercises,'💪 โดยทั่วไป 2 ครั้ง/สัปดาห์ ฟอร์มสำคัญกว่าน้ำหนัก Step-down และ Bulgarian Split Squat คือฐานสำหรับ downhill','strength');
  else if(tab==='drills')renderExerciseList(content,state,app,runningDrills,'🏃 ใช้เป็น warm-up ก่อนวันคุณภาพประมาณ 8–10 นาที เน้น cadence ก้าวสั้นและลงเท้าใต้ลำตัว','drill');
  else renderEquipment(content,state,app);
}

function renderExerciseList(container,state,app,exercises,banner,category){
  const date=localDateKey();
  const doneIds=new Set(state.rehabLogs.filter(log=>log.date===date&&log.category===category).map(log=>log.exerciseId));
  container.innerHTML=`<div class="callout good">${escapeHtml(app.t(banner))}</div><div class="list" style="margin-top:12px">${exercises.map(ex=>exerciseCard(ex,doneIds.has(ex.id),app)).join('')}</div>
  <div class="callout section">การบันทึก “ทำแล้ว” เป็น log ประจำวัน ไม่ใช่คำสั่งให้ทำทุกท่าพร้อมกัน เลือกตาม Phase, อาการ และเวลาที่มี</div>`;
  container.querySelectorAll('[data-toggle-exercise]').forEach(button=>button.addEventListener('click',async()=>{
    const exerciseId=button.dataset.toggleExercise;
    const existing=app.store.getState().rehabLogs.find(log=>log.date===date&&log.exerciseId===exerciseId&&log.category===category);
    if(existing)await app.store.deleteRecord(STORES.REHAB,existing.id);
    else await app.store.upsertRecord(STORES.REHAB,{id:createId('exercise-log'),date,exerciseId,category,completed:true,source:'manual',createdAt:nowIso()});
    app.render();
  }));
}
function exerciseCard(ex,done,app){
  const target=app.t(ex.target||''); const prescription=app.t(ex.prescription||''); const cues=(ex.cues||[]).map(cue=>app.t(cue)); const query=ex.query||`${ex.name} exercise form`;
  return `<article class="card flat exercise-card ${done?'completed':''}"><button class="exercise-check ${done?'done':''}" data-toggle-exercise="${ex.id}" aria-label="${done?'ยกเลิก':'ทำแล้ว'}">${done?'✓':'○'}</button><div class="grow"><div class="exercise-title">${ex.priority==='high'?'<span>★</span> ':''}${escapeHtml(ex.name)}</div><div class="submetric">${escapeHtml(target)}</div><strong class="exercise-dose">${escapeHtml(prescription)}</strong>${cues.length?`<details><summary>วิธีทำและจุดโฟกัส</summary><ul>${cues.map(c=>`<li>${escapeHtml(c)}</li>`).join('')}</ul>${ex.stopIf?`<div class="callout danger">${escapeHtml(app.t('หยุดเมื่อ:'))} ${escapeHtml(app.t(ex.stopIf))}</div>`:''}</details>`:''}</div><a class="mini-link" href="https://www.youtube.com/results?search_query=${encodeURIComponent(query)}" target="_blank" rel="noopener">ดูท่า</a></article>`;
}
function renderEquipment(container,state,app){
  const owned=new Set(state.gear.filter(item=>item.context==='home_training'&&item.owned).map(item=>item.id));
  container.innerHTML=`<div class="callout">🏠 อุปกรณ์ห้องซ้อม — ★ 3 ชิ้นแรกคุ้มสุด ติ๊กที่มีแล้วได้</div><div class="list" style="margin-top:12px">${homeEquipment.map(item=>`<article class="card flat equipment-row ${owned.has(item.id)?'completed':''}" data-equipment="${item.id}"><button class="exercise-check ${owned.has(item.id)?'done':''}">${owned.has(item.id)?'✓':'○'}</button><div class="grow"><strong>${item.priority==='high'?'<span style="color:var(--mint)">★</span> ':''}${escapeHtml(item.label)}</strong><small>${escapeHtml(item.reason)}</small></div><span class="equipment-cost">${escapeHtml(item.cost)}</span></article>`).join('')}</div>`;
  container.querySelectorAll('[data-equipment]').forEach(row=>row.addEventListener('click',async()=>{const id=row.dataset.equipment;const existing=app.store.getState().gear.find(item=>item.id===id);await app.store.upsertRecord(STORES.GEAR,{...(existing||{}),id,context:'home_training',owned:!existing?.owned,updatedAt:nowIso()});app.render();}));
}
