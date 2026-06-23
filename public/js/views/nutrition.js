import { nutritionGuides, raceFuelTimeline } from '../data/guides.js';
import { pageHeader, escapeHtml } from './components.js';

export function renderNutrition(container) {
  container.innerHTML = `
    ${pageHeader('Nutrition & Fueling', 'กินเพื่อซ้อมและฟื้นตัว ไม่ใช่ลงโทษร่างกายในช่วง Build/Peak', 'Fuel the work')}
    <div class="callout good">เป้าหมายช่วงซ้อมหนักคือ Energy availability และ Recovery ที่เพียงพอ การลดน้ำหนักไม่ควรแลกกับคุณภาพการนอน อาการล้า หรือการบาดเจ็บ</div>
    <section class="section">
      <div class="section-head"><h2>Guideline</h2><span>ต้องทดสอบระหว่าง Long Run</span></div>
      <div class="grid">${nutritionGuides.map(guide => `<article class="card flat"><h3 style="margin:0 0 10px;font-size:15px">${escapeHtml(guide.title)}</h3><div class="list">${guide.rows.map(([name,value])=>`<div style="display:grid;grid-template-columns:110px 1fr;gap:10px;border-top:1px solid var(--line);padding-top:9px"><strong style="font-size:12px">${escapeHtml(name)}</strong><span style="font-size:12px;color:var(--muted);line-height:1.5">${escapeHtml(value)}</span></div>`).join('')}</div></article>`).join('')}</div>
    </section>
    <section class="section">
      <div class="section-head"><h2>Race-day Timeline</h2><span>Start 16:00 · กลางคืน 10+ ชม.</span></div>
      <div class="list">${raceFuelTimeline.map(([time,action],index)=>`<article class="list-item"><div style="display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--mint-dark);color:var(--mint);font-weight:900">${index+1}</div><div class="grow"><strong>${escapeHtml(time)}</strong><small>${escapeHtml(action)}</small></div></article>`).join('')}</div>
    </section>
    <div class="callout" style="margin-top:14px">ค่าคาร์บ น้ำ และโซเดียมเป็นช่วงเริ่มต้นสำหรับทดลอง ไม่ใช่ตัวเลขบังคับ ต้องปรับจากอากาศ อัตราเหงื่อ การทนของท้อง และคำแนะนำจากผู้เชี่ยวชาญเมื่อจำเป็น</div>
  `;
}
