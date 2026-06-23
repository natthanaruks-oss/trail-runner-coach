import { PAIN_AREAS, STORES } from '../core/constants.js';
import { createId } from '../core/id.js';
import { localDateKey, nowIso } from '../core/date.js';
import { pageHeader, escapeHtml, emptyState } from './components.js';

export function renderPain(container, state, app) {
  const logs = [...state.painLogs].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  container.innerHTML = `
    ${pageHeader('Niggle / Pain Log', 'มองหาแนวโน้มก่อนอาการเล็กกลายเป็นการบาดเจ็บ', 'Track patterns, not toughness')}
    <form id="pain-form" class="card">
      <div class="form-grid">
        <div class="field"><label>วันที่</label><input type="date" name="date" value="${localDateKey()}" required></div>
        <div class="field"><label>บริเวณ</label><select name="area">${PAIN_AREAS.map(area=>`<option value="${area.id}">${escapeHtml(area.label)}</option>`).join('')}</select></div>
        <div class="field full"><label>ความรุนแรง 0–10</label><div class="range-row"><input type="range" name="severity" min="0" max="10" value="3"><output class="range-value" data-range-output="severity">3</output></div></div>
        <div class="field"><label>เกิดเมื่อ</label><select name="during"><option value="morning">ตอนตื่น/ก้าวแรก</option><option value="walking">เดิน</option><option value="during_run">ระหว่างวิ่ง</option><option value="after_run">หลังวิ่ง</option><option value="next_day">วันถัดไป</option><option value="other">อื่น ๆ</option></select></div>
        <div class="field"><label>แนวโน้ม</label><select name="trend"><option value="new">เพิ่งเกิด</option><option value="better">ดีขึ้น</option><option value="same">เท่าเดิม</option><option value="worse">แย่ลง</option></select></div>
        <div class="field full"><label>หมายเหตุ</label><textarea name="note" rows="2" placeholder="เช่น เริ่มปวดหลังลงเขา 40 นาที"></textarea></div>
      </div>
      <button class="button primary full" style="margin-top:14px">บันทึกอาการ</button>
    </form>
    <section class="section"><div class="section-head"><h2>ประวัติล่าสุด</h2><span>${logs.length} รายการ</span></div>
      <div class="list">${logs.length ? logs.slice(0,30).map(log=>{
        const area=PAIN_AREAS.find(item=>item.id===log.area);
        return `<article class="list-item"><div style="font-size:22px;color:${painColor(log.severity)}">●</div><div class="grow"><strong>${escapeHtml(area?.label||log.area)} · ${log.severity}/10</strong><small>${escapeHtml(log.date)} · ${escapeHtml(log.during||'')} · ${escapeHtml(log.trend||'')}${log.note?` · ${escapeHtml(log.note)}`:''}</small></div><button class="button secondary" data-delete-pain="${log.id}" style="padding:7px 9px;min-height:34px">ลบ</button></article>`;
      }).join('') : emptyState('ยังไม่มี Pain Log')}</div>
    </section>
    <div class="callout danger" style="margin-top:14px">Pain ≥6/10, เจ็บขณะเดิน, บวม, เดินผิดรูป หรืออาการเพิ่มขึ้นต่อเนื่อง ไม่ควรฝืนซ้อม</div>
  `;
  const range=container.querySelector('input[name="severity"]');
  range.addEventListener('input',()=>container.querySelector('[data-range-output="severity"]').value=range.value);
  container.querySelector('#pain-form').addEventListener('submit',async event=>{
    event.preventDefault(); const data=new FormData(event.currentTarget);
    await app.store.upsertRecord(STORES.PAIN,{id:createId('pain'),date:data.get('date'),area:data.get('area'),severity:Number(data.get('severity')),during:data.get('during'),trend:data.get('trend'),note:data.get('note')||'',source:'manual',createdAt:nowIso()});
    app.toast('บันทึก Pain Log แล้ว'); app.render();
  });
  container.querySelectorAll('[data-delete-pain]').forEach(button=>button.addEventListener('click',async()=>{await app.store.deleteRecord(STORES.PAIN,button.dataset.deletePain);app.render();}));
}
function painColor(value){return Number(value)>=6?'var(--red)':Number(value)>=3?'var(--amber)':'var(--green)';}
