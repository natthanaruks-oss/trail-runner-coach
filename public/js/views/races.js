import { STORES } from '../core/constants.js';
import { createRaceProfile, createPlanFromTemplate, getActiveRace, getActivePlan, raceSummary } from '../core/races.js';
import { pageHeader, escapeHtml, fieldNumber, formatNumber } from './components.js';

export function renderRaces(container, state, app) {
  const activeRace = getActiveRace(state);
  const activePlan = getActivePlan(state);
  const editing = state.raceProfiles.find(item => item.id === app.ui.editRaceId) || null;

  container.innerHTML = `
    ${pageHeader('สนามเป้าหมาย', 'Race Profile และ Training Plan แยกจากกัน เพื่อรองรับหลายสนามในอนาคต', 'Multi-race control center')}
    ${activeRace ? `<section class="card hero"><div class="eyebrow">ACTIVE RACE</div><h2 style="font-size:25px;margin:8px 0 5px">${escapeHtml(activeRace.name)}</h2><p style="color:var(--muted);margin:0">${escapeHtml(activeRace.date)} · ${escapeHtml(raceSummary(activeRace))}</p><div class="button-row" style="margin-top:14px"><button class="button secondary" data-edit-race="${activeRace.id}">แก้ไขสนาม</button><a class="button primary" href="#/plan">เปิดแผนซ้อม</a><a class="button secondary" href="#/roadmap">เปิด Race Roadmap</a></div><div class="submetric" style="margin-top:10px">Plan: ${escapeHtml(activePlan?.name || 'ยังไม่มีแผน')}</div></section>` : ''}

    <section class="section"><div class="section-head"><h2>สนามทั้งหมด</h2><span>${state.raceProfiles.length} รายการ</span></div><div class="list">
      ${state.raceProfiles.map(race => {
        const plans = state.trainingPlans.filter(plan => plan.raceId === race.id);
        const isActive = race.id === activeRace?.id;
        return `<article class="card flat"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap"><strong>${escapeHtml(race.name)}</strong>${isActive ? '<span class="tag done">Active</span>' : ''}</div><div class="submetric">${escapeHtml(race.date)} · ${escapeHtml(raceSummary(race))} · ${plans.length} plan</div></div><div class="button-row"><button class="button secondary" data-activate-race="${race.id}" ${isActive ? 'disabled' : ''}>เลือก</button><button class="button secondary" data-edit-race="${race.id}">แก้</button><button class="button secondary" data-delete-race="${race.id}" ${state.raceProfiles.length <= 1 ? 'disabled' : ''}>ลบ</button></div></div></article>`;
      }).join('')}
    </div></section>

    <section class="section"><div class="section-head"><h2>${editing ? 'แก้ไข Race Profile' : 'เพิ่มสนามใหม่'}</h2><button class="button secondary" data-new-race>${editing ? 'ยกเลิกแก้ไข' : 'ล้างฟอร์ม'}</button></div>
      <form id="race-form" class="card"><input type="hidden" name="id" value="${escapeHtml(editing?.id || '')}"><div class="form-grid">
        <div class="field"><label>ชื่อสนาม</label><input name="name" required value="${escapeHtml(editing?.name || '')}" placeholder="เช่น Chiang Mai Trail 50K"></div>
        <div class="field"><label>Edition / ปี</label><input name="edition" value="${escapeHtml(editing?.edition || '')}" placeholder="2027"></div>
        <div class="field"><label>วันแข่งขัน</label><input type="date" name="date" required value="${escapeHtml(editing?.date || '')}"></div>
        <div class="field"><label>เวลา Start</label><input type="time" name="startTime" value="${escapeHtml(editing?.startTime || '06:00')}"></div>
        <div class="field full"><label>สถานที่</label><input name="location" value="${escapeHtml(editing?.location || '')}"></div>
        <div class="field"><label>Race Priority</label><select name="priority"><option value="A" ${editing?.priority === 'A' || !editing?.priority ? 'selected' : ''}>A — เป้าหมายหลัก</option><option value="B" ${editing?.priority === 'B' ? 'selected' : ''}>B — สนามทดสอบ</option><option value="C" ${editing?.priority === 'C' ? 'selected' : ''}>C — Training race</option></select></div>
        <div class="field"><label>Goal</label><select name="goalType"><option value="finish" ${editing?.goalType === 'finish' || !editing?.goalType ? 'selected' : ''}>Finish strong</option><option value="time" ${editing?.goalType === 'time' ? 'selected' : ''}>Time goal</option><option value="performance" ${editing?.goalType === 'performance' ? 'selected' : ''}>Performance</option></select></div>
        ${fieldNumber({name:'distanceKm',label:'ระยะทาง (km)',value:editing?.distanceKm ?? '',min:1,max:1000,step:.1})}
        ${fieldNumber({name:'elevationGainM',label:'Elevation gain (m)',value:editing?.elevationGainM ?? '',min:0,max:50000})}
        ${fieldNumber({name:'elevationLossM',label:'Elevation loss (m)',value:editing?.elevationLossM ?? '',min:0,max:50000})}
        ${fieldNumber({name:'cutoffHours',label:'Cut-off (ชั่วโมง)',value:editing?.cutoffMinutes ? formatNumber(editing.cutoffMinutes/60,2) : '',min:0,max:200,step:.25})}
        ${fieldNumber({name:'aidStations',label:'จำนวน Aid station',value:editing?.aidStations ?? '',min:0,max:100})}
        ${fieldNumber({name:'technicalLevel',label:'Technical level 1–5',value:editing?.technicalLevel ?? 3,min:1,max:5})}
        <label class="check-row field full"><input type="checkbox" name="nightRunning" ${editing?.nightRunning ? 'checked' : ''}><span>มีการวิ่งกลางคืน</span></label>
        <div class="field full"><label>Notes</label><textarea name="notes" rows="3">${escapeHtml(editing?.notes || '')}</textarea></div>
        ${editing ? '' : '<label class="check-row field full"><input type="checkbox" name="createPlan" checked><span>สร้างแผน 20 สัปดาห์จาก Template ปัจจุบัน และคำนวณวันเริ่มจาก Race Day</span></label>'}
      </div><button class="button primary full" style="margin-top:14px">${editing ? 'บันทึกการแก้ไข' : 'เพิ่มสนามและเลือกเป็นสนามหลัก'}</button></form>
    </section>
    <div class="callout">Race profile เก็บข้อมูลสนาม ส่วน Training plan เก็บสัปดาห์และ Session จริง การเปลี่ยนสนามไม่ทำให้ประวัติ Activity, Readiness หรือ Pain หาย</div>`;

  container.querySelectorAll('[data-activate-race]').forEach(button => button.addEventListener('click', async () => {
    await app.store.setActiveRace(button.dataset.activateRace); app.ui.planWeek = null; app.toast('เปลี่ยนสนามหลักแล้ว'); app.render();
  }));
  container.querySelectorAll('[data-edit-race]').forEach(button => button.addEventListener('click', () => { app.ui.editRaceId = button.dataset.editRace; app.render(); }));
  container.querySelector('[data-new-race]')?.addEventListener('click', () => { app.ui.editRaceId = null; app.render(); });
  container.querySelectorAll('[data-delete-race]').forEach(button => button.addEventListener('click', async () => {
    const id = button.dataset.deleteRace;
    const race = state.raceProfiles.find(item => item.id === id);
    if (!race || !globalThis.confirm?.(`ลบ ${race.name} และแผนที่เชื่อมอยู่หรือไม่?`)) return;
    for (const plan of state.trainingPlans.filter(item => item.raceId === id)) await app.store.deleteRecord(STORES.PLANS, plan.id);
    await app.store.deleteRecord(STORES.RACES, id);
    const next = app.store.getState().raceProfiles[0];
    if (next) await app.store.setActiveRace(next.id);
    app.ui.editRaceId = null; app.toast('ลบสนามแล้ว'); app.render();
  }));

  container.querySelector('#race-form').addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const existing = state.raceProfiles.find(item => item.id === data.get('id'));
      const race = createRaceProfile({
        ...existing,
        id: data.get('id') || undefined,
        name: data.get('name'), edition: data.get('edition'), date: data.get('date'), startTime: data.get('startTime'), location: data.get('location'),
        distanceKm: data.get('distanceKm'), elevationGainM: data.get('elevationGainM'), elevationLossM: data.get('elevationLossM'), cutoffHours: data.get('cutoffHours'),
        aidStations: data.get('aidStations'), technicalLevel: data.get('technicalLevel'), nightRunning: data.has('nightRunning'), priority: data.get('priority'), goalType: data.get('goalType'), notes: data.get('notes')
      });
      await app.store.upsertRecord(STORES.RACES, race);
      let plan = app.store.getState().trainingPlans.find(item => item.raceId === race.id && item.status === 'active') || app.store.getState().trainingPlans.find(item => item.raceId === race.id);
      if (!existing && data.has('createPlan')) {
        plan = createPlanFromTemplate(race);
        await app.store.upsertRecord(STORES.PLANS, plan);
      } else if (plan) {
        const updated = createPlanFromTemplate(race, { ...plan, id: plan.id, name: plan.name, weeks: plan.weeks, createdAt: plan.createdAt });
        await app.store.upsertRecord(STORES.PLANS, updated);
        plan = updated;
      }
      await app.store.setActiveRace(race.id, plan?.id || null);
      app.ui.editRaceId = null; app.ui.planWeek = null; app.toast(existing ? 'บันทึก Race profile แล้ว' : 'เพิ่มสนามแล้ว'); app.render();
    } catch (error) { app.toast(error.message || 'บันทึกสนามไม่สำเร็จ'); }
  });
}
