import { STORES } from '../core/constants.js';
import { importBodyComposition } from '../adapters/body-import.js';
import { pageHeader, metricCard, formatNumber, escapeHtml, emptyState } from './components.js';

export function renderBody(container, state, app) {
  const records = [...state.bodyComposition].sort((a, b) => String(b.measuredAt || b.date).localeCompare(String(a.measuredAt || a.date)));
  const latest = records[0] || null;
  const inbody = records.find(record => record.source === 'inbody_scan') || latest;
  const trend = records.filter(record => Number(record.weightKg) > 0).sort((a, b) => String(a.date).localeCompare(String(b.date)));

  container.innerHTML = `
    ${pageHeader('Body & InBody', 'ใช้เป็น baseline ด้าน mechanical load และ recovery ไม่ใช่เป้าลดน้ำหนักระหว่าง Build/Peak', 'Body composition')}
    <section class="card flat">
      <input id="body-import-file" type="file" accept=".json" hidden>
      <div class="button-row"><button class="button primary" data-action="body-import">Import InBody JSON</button><a class="button secondary" href="#/data">เปิด Data Hub</a></div>
      <div class="submetric">ไฟล์ InBody ส่วนตัวไม่ถูกฝังใน Web App และไม่ถูก Deploy ขึ้น Cloudflare ข้อมูลจะถูกบันทึกใน IndexedDB หลัง Import เท่านั้น</div>
    </section>
    ${latest ? `
      <section class="grid three section">
        ${metricCard('น้ำหนัก', formatNumber(latest.weightKg, 1), 'kg', latest.date)}
        ${metricCard('SMM', formatNumber(inbody?.skeletalMuscleMassKg, 1), 'kg', 'Skeletal muscle')}
        ${metricCard('Body fat', formatNumber(inbody?.percentBodyFat, 1), '%', `Fat mass ${formatNumber(inbody?.bodyFatMassKg, 1)} kg`)}
      </section>
      <section class="grid three section">
        ${metricCard('BMI', formatNumber(inbody?.bmi, 1), '', 'ใช้ดูภาพรวม ไม่ใช้ตัดสินความฟิต')}
        ${metricCard('BMR', formatNumber(inbody?.basalMetabolicRateKcal), 'kcal', 'ค่าจากเครื่อง InBody')}
        ${metricCard('Visceral fat', formatNumber(inbody?.visceralFatLevel), '', `WHR ${formatNumber(inbody?.waistHipRatio, 2)}`)}
      </section>
    ` : `<section class="section">${emptyState('ยังไม่มีข้อมูล Body Composition — Import ไฟล์ InBody ส่วนตัวที่ส่งแยกจาก Deploy package')}</section>`}

    <section class="section">
      <div class="section-head"><h2>InBody ล่าสุด</h2><span>${escapeHtml(inbody?.measuredAt || inbody?.date || '—')}</span></div>
      ${inbody ? `<article class="card flat">
        <div class="grid two">
          ${detail('InBody Score', `${formatNumber(inbody.score)}/100`)}
          ${detail('Fat-free mass', `${formatNumber(inbody.fatFreeMassKg, 1)} kg`)}
          ${detail('Total body water', `${formatNumber(inbody.totalBodyWaterL, 1)} L`)}
          ${detail('Height', `${formatNumber(inbody.heightCm)} cm`)}
          ${detail('Leg lean mass', `${formatNumber(inbody.segmentalLeanKg?.leftLeg, 2)} / ${formatNumber(inbody.segmentalLeanKg?.rightLeg, 2)} kg`)}
          ${detail('Trunk fat mass', `${formatNumber(inbody.segmentalFatKg?.trunk, 1)} kg`)}
        </div>
      </article>` : emptyState('ไม่มีรายละเอียด InBody')}
    </section>

    <section class="section">
      <div class="section-head"><h2>แนวโน้ม</h2><span>${trend.length} ครั้ง</span></div>
      <div class="list">${trend.length ? trend.map(record => `<article class="list-item"><div style="font-size:22px">⚖️</div><div class="grow"><strong>${escapeHtml(record.date)}</strong><small>${formatNumber(record.weightKg, 1)} kg · SMM ${formatNumber(record.skeletalMuscleMassKg, 1)} kg · PBF ${formatNumber(record.percentBodyFat, 1)}% · ${escapeHtml(record.source)}</small></div><button class="button secondary" data-delete-body="${escapeHtml(record.id)}" style="padding:7px 9px;min-height:34px">ลบ</button></article>`).join('') : emptyState('ยังไม่มีประวัติ')}</div>
    </section>

    <div class="callout good">แนวทางของแอป: รักษา muscle และ recovery ให้พอสำหรับการซ้อมระยะไกลและสนามเป้าหมาย ไม่ใช้ Target Weight จากเครื่องเป็นคำสั่งลดน้ำหนัก และไม่สร้าง calorie deficit เชิงรุกในช่วง Build/Peak</div>
  `;

  const input = container.querySelector('#body-import-file');
  container.querySelector('[data-action="body-import"]').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const result = await importBodyComposition(app.store, parsed);
      app.toast(`Import Body Composition ${result.records.length} รายการแล้ว`);
      app.render();
    } catch (error) {
      app.toast(error.message || 'Import InBody ไม่สำเร็จ');
    }
  });
  container.querySelectorAll('[data-delete-body]').forEach(button => button.addEventListener('click', async () => {
    await app.store.deleteRecord(STORES.BODY_COMPOSITION, button.dataset.deleteBody);
    app.render();
  }));
}

function detail(label, value) {
  return `<div style="border-top:1px solid var(--line);padding-top:10px"><div class="card-title">${escapeHtml(label)}</div><strong>${escapeHtml(value)}</strong></div>`;
}
