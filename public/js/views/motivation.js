import { pageHeader, escapeHtml } from './components.js';
export function renderMotivation(container,state,app){
  const motivation=state.settings.profile?.motivation||'';
  container.innerHTML=`
    ${pageHeader('ทำไมฉันถึงวิ่ง','ข้อความนี้มีไว้ให้อ่านตอนระยะทางยังเหลือและใจเริ่มต่อรอง','Your reason, not your pace')}
    <article class="card hero"><div class="eyebrow">ช่วงที่ยากที่สุด</div><blockquote style="font-size:23px;line-height:1.45;margin:12px 0 0;font-weight:750">“${escapeHtml(motivation || app.t('ฉันเลือกมาที่นี่เพื่อจบอย่างสุขภาพดี มีความสุข และกลับบ้านได้ด้วยร่างกายที่ยังรักการวิ่ง'))}”</blockquote></article>
    <form id="motivation-form" class="card" style="margin-top:14px"><div class="field"><label>เหตุผลของคุณ</label><textarea name="motivation" rows="7" placeholder="เขียนให้เป็นภาษาของตัวเอง ไม่ต้องสวย แต่ต้องจริง">${escapeHtml(motivation)}</textarea></div><button class="button primary full" style="margin-top:12px">บันทึก</button></form>
    <div class="callout good" style="margin-top:14px">ความสม่ำเสมอ 80% ที่ไม่เจ็บ มีค่ามากกว่าแผน 100% ที่พังกลางทาง</div>`;
  container.querySelector('#motivation-form').addEventListener('submit',async event=>{event.preventDefault();const data=new FormData(event.currentTarget);await app.store.saveSettings({profile:{motivation:data.get('motivation')}});app.toast('บันทึกเหตุผลแล้ว');app.render();});
}
