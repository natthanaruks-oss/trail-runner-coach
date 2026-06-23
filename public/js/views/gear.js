import { gearChecklist } from '../data/guides.js';
import { STORES } from '../core/constants.js';
import { nowIso } from '../core/date.js';
import { pageHeader, escapeHtml } from './components.js';

export function renderGear(container, state, app) {
  const stateMap = new Map(state.gear.map(item => [item.id,item]));
  const done = gearChecklist.filter(item => stateMap.get(item.id)?.checked).length;
  container.innerHTML = `
    ${pageHeader('Gear Checklist', 'สนามมี Aid Station เพียง 3 จุด จึงต้องวางแผนพึ่งพาตัวเอง', 'Night + mountain + self-reliance')}
    <article class="card flat"><div style="display:flex;justify-content:space-between;align-items:center"><div><div class="card-title">ความพร้อมอุปกรณ์</div><div class="metric">${done}<small>/ ${gearChecklist.length}</small></div></div><div class="ring" style="width:82px;--value:${Math.round(done/gearChecklist.length*100)}"><div class="ring-content"><strong style="font-size:20px">${Math.round(done/gearChecklist.length*100)}%</strong></div></div></div></article>
    ${['ต้องมี','แนะนำ','เฉพาะคุณ'].map(group=>`<section class="section"><div class="section-head"><h2>${group}</h2></div><div class="list">${gearChecklist.filter(item=>item.group===group).map(item=>`<label class="list-item" style="cursor:pointer"><input type="checkbox" data-gear="${item.id}" ${stateMap.get(item.id)?.checked?'checked':''} style="width:20px;height:20px;accent-color:var(--mint)"><div class="grow"><strong>${escapeHtml(item.label)}</strong></div></label>`).join('')}</div></section>`).join('')}
    <div class="callout" style="margin-top:14px">อุปกรณ์ทุกชิ้นต้องถูกทดสอบใน Long Run/Night Run จริง โดยเฉพาะไฟฉาย เป้น้ำ รองเท้า ถุงเท้า และอาหารที่พก</div>
  `;
  container.querySelectorAll('[data-gear]').forEach(input=>input.addEventListener('change',async()=>{
    await app.store.upsertRecord(STORES.GEAR,{id:input.dataset.gear,checked:input.checked,updatedAt:nowIso()});
    app.render();
  }));
}
