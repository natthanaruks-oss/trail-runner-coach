import { STORES } from '../core/constants.js';
import { createId } from '../core/id.js';
import { addDays, localDateKey, nowIso } from '../core/date.js';
import { foodCatalog, FOOD_CATEGORIES } from '../data/food-catalog.js';
import { loadThaiPreparedFoods, THAI_FOOD_DATASET_COUNT } from '../data/thai-food-dataset.js';
import { nutritionGuides, raceFuelTimeline } from '../data/guides.js';
import {
  athleteWeightKg, dailyWaterTargetMl, energyBalanceForDate, energyBalanceRange, energyBalancePeriod,
  foodItemsForDate, foodTotals, hrZones, nutritionTarget, recentFoodBases
} from '../core/nutrition.js';
import { escapeHtml, formatNumber, pageHeader } from './components.js';

const TABS = [
  ['food','อาหาร'], ['balance','พลังงาน'], ['guide','ไกด์'], ['race','วันแข่ง'], ['zones','HR Zones']
];

const FOOD_PICKER_FILTERS = Object.freeze([
  ['recent', 'ล่าสุด'],
  ['thai', `อาหารไทย ${THAI_FOOD_DATASET_COUNT.toLocaleString('en-US')}+`],
  ['rice', 'ข้าว'],
  ['noodle', 'เส้น'],
  ['curry_soup', 'แกง/ต้ม'],
  ['cooked', 'ผัด/ทอด/ย่าง'],
  ['regional', 'ยำ/ภูมิภาค'],
  ['dessert', 'ของหวาน'],
  ['drink', 'เครื่องดื่ม'],
  ['meal', 'เมนูเดิม'],
  ['protein', 'โปรตีน'],
  ['snack', 'ว่าง/ผลไม้'],
  ['fuel', 'ของวิ่ง'],
  ['custom', 'กำหนดเอง']
]);

let preparedFoodCatalog = [];

function baseFoods() { return [...foodCatalog, ...preparedFoodCatalog]; }

function effectiveFoods(state) {
  const overrides = new Map(state.customFoods.filter(item => item.baseFoodId).map(item => [item.baseFoodId, item]));
  const catalog = baseFoods().flatMap(base => {
    const override = overrides.get(base.id);
    if (override?.hidden) return [];
    return [{ ...base, ...(override || {}), id: base.id, baseFoodId: base.id, overrideId: override?.id || null }];
  });
  const custom = state.customFoods.filter(item => !item.baseFoodId && !item.hidden);
  return [...catalog, ...custom];
}

export function renderFuel(container, state, app) {
  app.ui.fuelTab ||= 'food';
  app.ui.foodDate ||= localDateKey();
  const tab = app.ui.fuelTab;
  const dateKey = app.ui.foodDate;
  container.innerHTML = `
    ${pageHeader('อาหาร', 'บันทึกแบบเดิมที่คุ้นเคย พร้อมเชื่อมกับ Training load และ Apple Health', 'Fuel · Hydration · Energy')}
    ${tabBar(tab)}
    <div id="fuel-content" class="section"></div>`;
  container.querySelectorAll('[data-fuel-tab]').forEach(button => button.addEventListener('click', () => {
    app.ui.fuelTab = button.dataset.fuelTab;
    app.render();
  }));
  const content = container.querySelector('#fuel-content');
  if (tab === 'food') renderFood(content, state, app, dateKey);
  else if (tab === 'balance') renderBalance(content, state, app, dateKey);
  else if (tab === 'guide') renderGuide(content);
  else if (tab === 'race') renderRace(content);
  else renderZones(content, state);
}

function tabBar(active) {
  return `<div class="segmented-scroll">${TABS.map(([key,label])=>`<button class="segmented-button ${active===key?'active':''}" data-fuel-tab="${key}">${label}</button>`).join('')}</div>`;
}

function renderFood(container, state, app, dateKey) {
  const totals = foodTotals(state, dateKey);
  const target = nutritionTarget(state, dateKey);
  const items = foodItemsForDate(state, dateKey);
  const water = state.waterLogs.find(item => item.date === dateKey)?.amountMl || 0;
  const flag = state.dailyFlags.find(item => item.date === dateKey);
  const kcalPct = target.kcal ? Math.min(100, Math.round(totals.kcal / target.kcal * 100)) : 0;
  const proteinPct = target.proteinG ? Math.min(100, Math.round(totals.proteinG / target.proteinG * 100)) : 0;
  const waterTarget = dailyWaterTargetMl(state, dateKey);
  const isToday = dateKey === localDateKey();
  container.innerHTML = `
    ${dateNavigator(dateKey, isToday)}
    <article class="card nutrition-hero">
      <div class="nutrition-ring" style="--nutrition-value:${kcalPct}"><div><strong>${formatNumber(totals.kcal)}</strong><small>/${formatNumber(target.kcal)} kcal</small></div></div>
      <div class="grow">
        <div class="status ${target.mode==='fuel_recovery'?'green':'neutral'}">${target.mode==='fuel_recovery'?'กินเต็มเพื่อฟื้นตัว':'รักษาพลังงานให้พอ'}</div>
        <h2>${escapeHtml(target.sessionType)} · ${escapeHtml(target.phase || 'Outside plan')}</h2>
        <div class="macro-grid">
          ${macro('Protein',totals.proteinG,target.proteinG,'g',proteinPct)}
          ${macro('Carb',totals.carbG,target.carbG,'g',Math.min(100,Math.round(totals.carbG/Math.max(1,target.carbG)*100)))}
          ${macro('Fat',totals.fatG,null,'g',null)}
        </div>
      </div>
    </article>

    <article class="card flat section">
      <div class="section-head"><h2>น้ำดื่ม</h2><span><strong data-water-value>${formatNumber(water)}</strong> / ${formatNumber(waterTarget)} ml</span></div>
      <div class="progress"><span data-water-bar style="width:${Math.min(100,water/waterTarget*100)}%;background:var(--blue)"></span></div>
      <div class="button-row" style="margin-top:12px">
        <button class="button secondary" data-water-delta="-250">−250 ml</button>
        <button class="button primary" data-water-delta="250">+250 ml</button>
        <button class="button secondary" data-water-delta="500">+500 ml</button>
      </div>
    </article>

    <section class="section">
      <div class="section-head"><h2>รายการอาหาร</h2><span>${items.length} รายการ</span></div>
      <button class="button primary full" data-action="add-food">＋ เพิ่มอาหาร</button>
      <div class="list" style="margin-top:10px">${items.length ? items.map(item => foodLogRow(item, app)).join('') : '<div class="card flat empty">ยังไม่ได้บันทึกวันนี้ — กดเพิ่มอาหารด้านบน</div>'}</div>
    </section>

    <article class="card flat section">
      <label class="check-row"><input type="checkbox" data-food-complete ${flag?.foodComplete?'checked':''}><span><strong>บันทึกครบทั้งวันแล้ว</strong><small style="display:block;color:var(--muted);margin-top:4px">ใช้เฉพาะวันที่กรอกครบ เพื่อคำนวณ Energy balance ไม่ให้ยอดเพี้ยน</small></span></label>
    </article>
    <div class="callout">ฐานอาหารรวม ${foodCatalog.length + THAI_FOOD_DATASET_COUNT} รายการ: เมนูเดิม ${foodCatalog.length} รายการ และอาหารไทยปรุงสำเร็จ ${THAI_FOOD_DATASET_COUNT} รายการ พร้อมค้นหา ปรับปริมาณเป็นกรัม กรอกเอง แก้ไข และลบ ข้อมูลอาหารไทยชุดใหม่เป็นค่าประมาณต่อ 100 กรัม ไม่ใช่ผลตรวจห้องปฏิบัติการ</div>`;

  bindDateNavigation(container, app);
  container.querySelector('[data-action="add-food"]').addEventListener('click', () => openFoodPicker(state, app, dateKey).catch(error => app.toast(error.message || 'เปิดฐานอาหารไม่สำเร็จ')));
  container.querySelectorAll('[data-edit-food-log]').forEach(button => button.addEventListener('click', () => openFoodLogEditor(state, app, button.dataset.editFoodLog)));
  container.querySelectorAll('[data-water-delta]').forEach(button => button.addEventListener('click', async () => {
    const current = app.store.getState().waterLogs.find(item => item.date === dateKey)?.amountMl || 0;
    await app.store.upsertRecord(STORES.WATER_LOGS, { date: dateKey, amountMl: Math.max(0,current+Number(button.dataset.waterDelta)), updatedAt: nowIso(), source:'manual' });
    app.render();
  }));
  container.querySelector('[data-food-complete]').addEventListener('change', async event => {
    const checked = event.currentTarget.checked;
    await app.store.upsertRecord(STORES.DAILY_FLAGS, { ...(flag || {}), date: dateKey, foodComplete:checked, updatedAt:nowIso() });
    app.toast(checked ? 'ทำเครื่องหมายว่าบันทึกครบวันแล้ว' : 'ยกเลิกสถานะบันทึกครบวัน');
  });
}

function renderBalance(container, state, app, dateKey) {
  app.ui.energyRange ||= 7;
  const today = energyBalanceForDate(state, dateKey);
  const hasCustomPeriod = Boolean(app.ui.energyStart && app.ui.energyEnd);
  const range = hasCustomPeriod
    ? energyBalancePeriod(state, app.ui.energyStart, app.ui.energyEnd)
    : energyBalanceRange(state, app.ui.energyRange, dateKey);
  const netClass = today.netKcal < -500 ? 'danger' : today.netKcal > 500 ? '' : 'good';
  const maxBar = Math.max(1,...range.rows.map(row=>Math.max(row.intakeKcal,row.totalOutKcal)));
  const periodLabel = `${range.startDate} – ${range.endDate}`;
  const averageClass = range.averageNetKcal != null && range.averageNetKcal < -500 ? 'danger' : 'good';
  container.innerHTML = `
    ${dateNavigator(dateKey,dateKey===localDateKey())}
    <article class="card hero">
      <div class="section-head"><h2>สมดุลพลังงาน</h2><span>${today.foodComplete?'บันทึกครบวัน':'ยังไม่ครบวัน'}</span></div>
      <div class="grid three">
        <div><div class="card-title">กินเข้า</div><div class="metric">${formatNumber(today.intakeKcal)}<small>kcal</small></div></div>
        <div><div class="card-title">เผาผลาญ</div><div class="metric">${formatNumber(today.totalOutKcal)}<small>kcal</small></div></div>
        <div><div class="card-title">สุทธิ</div><div class="metric">${today.foodComplete?(today.netKcal>0?'+':'')+formatNumber(today.netKcal):'—'}<small>kcal</small></div></div>
      </div>
      <div class="callout ${netClass}" style="margin-top:14px">${energyMessage(today)}</div>
    </article>
    <section class="grid two section">
      <article class="card flat"><div class="card-title">BMR</div><div class="metric">${formatNumber(today.target.bmrKcal)}<small>kcal</small></div><div class="submetric">${escapeHtml(today.target.bmrSource)}</div></article>
      <article class="card flat"><div class="card-title">Active / Training</div><div class="metric">${formatNumber(today.target.activeEnergyKcal)}<small>kcal</small></div><div class="submetric">${escapeHtml(today.target.activitySource)}</div></article>
    </section>
    <section class="section">
      <div class="section-head"><h2>Calories deficit ตามช่วงที่เลือก</h2><span>${periodLabel}</span></div>
      <div class="energy-filter card flat">
        <div class="compact-tabs">${[7,14,30,90].map(n=>`<button class="${!hasCustomPeriod&&app.ui.energyRange===n?'active':''}" data-energy-range="${n}">${n} วัน</button>`).join('')}</div>
        <form id="energy-period-form" class="energy-date-filter">
          <div class="field"><label>ตั้งแต่</label><input type="date" name="start" value="${escapeHtml(app.ui.energyStart || range.startDate)}"></div>
          <div class="field"><label>ถึง</label><input type="date" name="end" value="${escapeHtml(app.ui.energyEnd || range.endDate)}"></div>
          <button class="button secondary" type="submit">ใช้ช่วงนี้</button>
        </form>
      </div>
      <div class="grid three energy-summary-grid" style="margin-top:10px">
        <article class="card flat deficit-card"><div class="card-title">Deficit รวม</div><div class="metric">${range.completeDays?formatNumber(range.deficitKcal):'—'}<small>kcal</small></div><div class="submetric">รวมเฉพาะวันที่สุทธิติดลบ ${range.deficitDays} วัน</div></article>
        <article class="card flat"><div class="card-title">Surplus รวม</div><div class="metric">${range.completeDays?formatNumber(range.surplusKcal):'—'}<small>kcal</small></div><div class="submetric">วันที่สุทธิเป็นบวก ${range.surplusDays} วัน</div></article>
        <article class="card flat"><div class="card-title">Net หลังหักกัน</div><div class="metric">${range.completeDays?(range.netKcal>0?'+':'')+formatNumber(range.netKcal):'—'}<small>kcal</small></div><div class="submetric">ค่าเฉลี่ย ${range.averageNetKcal == null ? '—' : `${range.averageNetKcal>0?'+':''}${formatNumber(range.averageNetKcal)} kcal/วัน`}</div></article>
        <article class="card flat"><div class="card-title">วันที่บันทึกครบ</div><div class="metric">${range.completeDays}<small>/${range.selectedDays} วัน</small></div><div class="submetric">Coverage ${range.coveragePct}%</div></article>
        <article class="card flat"><div class="card-title">Deficit เฉลี่ย/วันที่ขาด</div><div class="metric">${range.averageDeficitKcal ?? '—'}<small>kcal</small></div><div class="submetric">ไม่ใช่เป้าบังคับ โดยเฉพาะ Build/Peak</div></article>
        <article class="card flat"><div class="card-title">น้ำหนักเชิงทฤษฎี</div><div class="metric">${range.completeDays?(range.estimatedWeightChangeKg>0?'+':'')+range.estimatedWeightChangeKg:'—'}<small>kg</small></div><div class="submetric">ใช้ดูแนวโน้มเท่านั้น</div></article>
      </div>
      <article class="card flat" style="margin-top:10px">
        <div class="energy-chart">${range.rows.map(row=>`<div class="energy-day ${row.foodComplete?'':'incomplete'}" title="${row.date}${row.foodComplete?` · net ${row.netKcal} kcal`:' · ยังไม่ครบวัน'}"><div class="energy-bars"><i style="height:${row.intakeKcal/maxBar*100}%;background:var(--mint)"></i><i style="height:${row.totalOutKcal/maxBar*100}%;background:var(--blue)"></i></div><small>${row.date.slice(5)}</small></div>`).join('')}</div>
        <div class="submetric"><span style="color:var(--mint)">■</span> กินเข้า · <span style="color:var(--blue)">■</span> เผาผลาญ · วันที่จางคือยังบันทึกไม่ครบ</div>
      </article>
      <div class="callout ${averageClass}" style="margin-top:10px">${energyPeriodMessage(range)}</div>
    </section>
    <div class="callout">Energy balance เป็นการประมาณเพื่อดูแนวโน้ม ไม่ใช่เป้าบังคับลดน้ำหนัก ในช่วง Build/Peak หรือวัน Long/Night ระบบเน้นเติมพลังและฟื้นตัวก่อน และจะคำนวณ Deficit จากวันที่ทำเครื่องหมายว่า “บันทึกครบทั้งวัน” เท่านั้น</div>`;
  bindDateNavigation(container, app);
  container.querySelectorAll('[data-energy-range]').forEach(button=>button.addEventListener('click',()=>{
    app.ui.energyRange=Number(button.dataset.energyRange);
    app.ui.energyStart=null;
    app.ui.energyEnd=null;
    app.render();
  }));
  container.querySelector('#energy-period-form').addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    app.ui.energyStart = data.get('start');
    app.ui.energyEnd = data.get('end');
    app.render();
  });
}

function renderGuide(container) {
  container.innerHTML = nutritionGuides.map(guide=>`<article class="card flat" style="margin-bottom:10px"><h2 style="font-size:16px;margin-top:0">${escapeHtml(guide.title)}</h2><div class="guide-table">${guide.rows.map(([a,b])=>`<div><strong>${escapeHtml(a)}</strong><span>${escapeHtml(b)}</span></div>`).join('')}</div></article>`).join('') + '<div class="callout good">หลักของแผนนี้คือกินให้พอสำหรับการฟื้นตัว ความสม่ำเสมอ และสุขภาพ ไม่เร่งลดน้ำหนักในช่วงโหลดสูง</div>';
}
function renderRace(container) {
  container.innerHTML = `<article class="card hero"><h2 style="margin-top:0">Race-day Fueling Timeline</h2><div class="timeline">${raceFuelTimeline.map(([time,desc])=>`<div class="timeline-row"><strong>${escapeHtml(time)}</strong><span>${escapeHtml(desc)}</span></div>`).join('')}</div></article><section class="grid two section"><article class="card flat"><div class="card-title">คาร์บเริ่มต้น</div><div class="metric">50–60<small>g/h</small></div><div class="submetric">ฝึกท้องก่อนค่อยเพิ่ม</div></article><article class="card flat"><div class="card-title">น้ำโดยทั่วไป</div><div class="metric">400–800<small>ml/h</small></div><div class="submetric">ปรับตามอากาศและเหงื่อ</div></article></section><div class="callout">สนามแต่ละแห่งและสภาพอากาศต่างกัน ต้องทดสอบ Fueling ใน Long run และใช้กติกา/คำแนะนำทางการของสนามจริงประกอบ</div>`;
}
function renderZones(container, state) {
  const maxHr = state.settings?.athlete?.maxHr;
  const zones = hrZones(maxHr);
  container.innerHTML = zones.length ? `<article class="card flat"><div class="section-head"><h2>HR Zones</h2><span>Max HR ${maxHr}</span></div><div class="list">${zones.map((z,i)=>`<div class="list-item"><span class="zone-dot zone-${i+1}">${z.zone}</span><div class="grow"><strong>${z.min}–${z.max} bpm</strong><small>${escapeHtml(z.label)}</small></div></div>`).join('')}</div></article><div class="callout section">บนทางชัน pace ไม่สะท้อนความหนักได้ดี ใช้ HR, RPE และการพูดคุยร่วมกัน ค่า Max HR ที่เดาอาจคลาดเคลื่อน ควรอัปเดตจากข้อมูลจริงเมื่อปลอดภัย</div>` : `<div class="card flat empty">ยังไม่มี Max HR — ไปที่ บันทึก › ตั้งค่า เพื่อกรอกก่อน</div>`;
}

async function openFoodPicker(state, app, dateKey) {
  let category = recentFoodBases(state, effectiveFoods(state)).length ? 'recent' : 'thai';
  let query = '';
  app.openModal('เพิ่มอาหาร', `
    <div class="field"><input id="food-search" placeholder="ค้นหาชื่ออาหารไทยหรืออังกฤษ"></div>
    <div class="segmented-scroll food-categories" style="margin-top:10px">${FOOD_PICKER_FILTERS.map(([key,label])=>`<button class="segmented-button ${category===key?'active':''}" data-food-category="${key}">${label}</button>`).join('')}</div>
    <div id="food-picker-status" class="submetric" style="margin-top:10px">กำลังโหลดฐานอาหารไทย ${THAI_FOOD_DATASET_COUNT.toLocaleString('en-US')} รายการ…</div>
    <div id="food-picker-list" class="list" style="margin-top:12px"><div class="empty">กำลังเตรียมฐานอาหาร…</div></div>`);
  const modal = document.querySelector('#modal-content');
  const list = modal.querySelector('#food-picker-list');
  const search = modal.querySelector('#food-search');
  const status = modal.querySelector('#food-picker-status');

  const draw = () => {
    modal.querySelectorAll('[data-food-category]').forEach(b=>b.classList.toggle('active',b.dataset.foodCategory===category));
    const currentState = app.store.getState();
    const availableFoods = effectiveFoods(currentState);
    if (category === 'custom' && !query) {
      const mine = currentState.customFoods.filter(item => !item.baseFoodId && !item.hidden);
      const hidden = currentState.customFoods.filter(item => item.baseFoodId && item.hidden);
      list.innerHTML = `${customFoodForm()}<div class="section-head" style="margin-top:14px"><h2>เมนูของฉัน</h2><span>${mine.length} รายการ</span></div>${mine.length ? mine.map(item => foodPickerRow(item, app)).join('') : '<div class="empty">ยังไม่มีเมนูที่สร้างเอง</div>'}${hidden.length ? `<div class="section-head" style="margin-top:14px"><h2>เมนูที่ซ่อน</h2><span>${hidden.length} รายการ</span></div>${hidden.map(item => { const base=baseFoods().find(food=>food.id===item.baseFoodId); return `<article class="list-item"><div class="grow"><strong>${escapeHtml(app.name(base || item) || item.baseFoodId)}</strong><small>ซ่อนจากฐานอาหาร</small></div><button class="button secondary" data-restore-hidden-food="${item.baseFoodId}" style="min-height:34px;padding:7px 10px">คืนค่า</button></article>`; }).join('')}` : ''}`;
      bindCustomFoodForm(list,currentState,app,dateKey);
    } else {
      let foods;
      if (category === 'recent') foods = recentFoodBases(currentState, availableFoods);
      else if (category === 'thai') foods = availableFoods.filter(item=>item.source==='thai_prepared_food_dataset_1375_estimated');
      else if (['rice','noodle','curry_soup','cooked','regional','dessert'].includes(category)) foods = availableFoods.filter(item=>item.pickerGroup===category);
      else if (category === 'meal') foods = availableFoods.filter(item=>item.category==='meal' && item.source!=='thai_prepared_food_dataset_1375_estimated');
      else foods = availableFoods.filter(item=>item.category===category);
      if (query) {
        const normalized = query.toLowerCase();
        foods = availableFoods.filter(item=>`${item.nameTh} ${item.nameEn || ''} ${item.subCategory || ''}`.toLowerCase().includes(normalized));
      }
      const visible = foods.slice(0,120);
      list.innerHTML = foods.length
        ? `${visible.map(item => foodPickerRow(item, app)).join('')}${foods.length>visible.length?`<div class="empty">แสดง ${visible.length} จาก ${foods.length} รายการ — พิมพ์ค้นหาเพื่อเจาะจง</div>`:''}`
        : '<div class="empty">ไม่พบเมนู ลองคำอื่นหรือเลือก “กำหนดเอง”</div>';
    }
    list.querySelectorAll('[data-pick-food]').forEach(button=>button.addEventListener('click',()=>openPortionPicker(app.store.getState(),app,dateKey,button.dataset.pickFood)));
    list.querySelectorAll('[data-edit-food-base]').forEach(button=>button.addEventListener('click',()=>openFoodBaseEditor(app.store.getState(),app,button.dataset.editFoodBase,dateKey)));
    list.querySelectorAll('[data-restore-hidden-food]').forEach(button=>button.addEventListener('click',async()=>{await app.store.deleteRecord(STORES.CUSTOM_FOODS,`override:${button.dataset.restoreHiddenFood}`);app.toast('คืนเมนูกลับฐานอาหารแล้ว');draw();}));
    app.localize(list);
  };
  search.addEventListener('input',event=>{query=event.currentTarget.value.trim();draw();});
  modal.querySelectorAll('[data-food-category]').forEach(button=>button.addEventListener('click',()=>{category=button.dataset.foodCategory;query='';search.value='';draw();}));
  draw();
  try {
    preparedFoodCatalog = await loadThaiPreparedFoods();
    status.textContent = `พร้อมใช้ ${foodCatalog.length + preparedFoodCatalog.length} รายการ · อาหารไทยชุดใหม่คิดต่อ 100 กรัม`;
    app.localize(status);
    draw();
  } catch (error) {
    status.textContent = `โหลดอาหารไทยชุดใหม่ไม่ได้ — ยังใช้เมนูเดิม ${foodCatalog.length} รายการได้`;
    app.localize(status);
    app.toast(error.message || 'โหลดฐานอาหารไทยไม่สำเร็จ');
  }
}

function openPortionPicker(state, app, dateKey, foodId) {
  const food = effectiveFoods(state).find(item=>item.id===foodId);
  if (!food) return;
  const usesGrams = Number(food.servingGrams) > 0;
  const portionControls = usesGrams
    ? `<div class="portion-buttons">${[50,100,150,200,250].map(g=>`<button class="button ${g===100?'primary':'secondary'}" data-grams="${g}">${g}g</button>`).join('')}</div><div class="field" style="margin-top:12px"><label>กรัมที่รับประทานจริง</label><input id="portion-grams" type="number" min="1" max="2000" step="1" value="100"></div>`
    : `<div class="portion-buttons">${[.5,1,1.5,2,3].map(q=>`<button class="button ${q===1?'primary':'secondary'}" data-portion="${q}">×${q}</button>`).join('')}</div>`;
  app.openModal(app.name(food), `<div class="callout">${escapeHtml(food.serving || '1 หน่วยบริโภค')} · ${food.dataQuality==='estimated'?'ค่าประมาณ':'ผู้ใช้กำหนด'}${food.subCategory?` · ${escapeHtml(food.subCategory)}`:''}</div><div style="margin-top:14px">${portionControls}</div><div id="portion-summary" class="card flat" style="margin-top:14px"></div><button class="button primary full" data-add-selected-food style="margin-top:12px">เพิ่มในวันนี้</button>`);
  const modal = document.querySelector('#modal-content');
  let qty = 1;
  let grams = usesGrams ? 100 : null;
  const summary = () => {
    qty = usesGrams ? Math.max(.01, grams / Number(food.servingGrams || 100)) : qty;
    modal.querySelector('#portion-summary').innerHTML = `<strong>${formatNumber(food.kcal*qty)} kcal</strong><div class="submetric">Protein ${round(food.proteinG*qty)} g · Carb ${round(food.carbG*qty)} g · Fat ${round(food.fatG*qty)} g${food.sodiumMg!=null?` · Sodium ${formatNumber(food.sodiumMg*qty)} mg`:''}</div>${usesGrams?`<div class="submetric">ปริมาณ ${formatNumber(grams)} กรัม</div>`:''}`;
    modal.querySelectorAll('[data-portion]').forEach(b=>{b.className=`button ${Number(b.dataset.portion)===qty?'primary':'secondary'}`;});
    modal.querySelectorAll('[data-grams]').forEach(b=>{b.className=`button ${Number(b.dataset.grams)===grams?'primary':'secondary'}`;});
    app.localize(modal.querySelector('#portion-summary'));
  };
  modal.querySelectorAll('[data-portion]').forEach(button=>button.addEventListener('click',()=>{qty=Number(button.dataset.portion);summary();}));
  modal.querySelectorAll('[data-grams]').forEach(button=>button.addEventListener('click',()=>{grams=Number(button.dataset.grams);const input=modal.querySelector('#portion-grams');if(input)input.value=grams;summary();}));
  modal.querySelector('#portion-grams')?.addEventListener('input',event=>{grams=Math.max(1,Number(event.currentTarget.value)||100);summary();});
  modal.querySelector('[data-add-selected-food]').addEventListener('click',async()=>{
    await app.store.upsertRecord(STORES.FOOD_LOGS, foodLogRecord(food,dateKey,qty,grams));
    app.closeModal(); app.toast(app.language === 'en' ? `Added ${app.name(food)}` : `เพิ่ม ${app.name(food)} แล้ว`); app.ui.fuelTab='food'; app.ui.foodDate=dateKey; app.render();
  });
  summary();
}

function openFoodLogEditor(state, app, logId) {
  const item = state.foodLogs.find(row=>row.id===logId); if(!item)return;
  const base = {
    kcal:Number(item.baseKcal ?? (item.kcal / Math.max(.1,item.quantity||1))) || 0,
    proteinG:Number(item.baseProteinG ?? (item.proteinG / Math.max(.1,item.quantity||1))) || 0,
    carbG:Number(item.baseCarbG ?? (item.carbG / Math.max(.1,item.quantity||1))) || 0,
    fatG:Number(item.baseFatG ?? (item.fatG / Math.max(.1,item.quantity||1))) || 0
  };
  app.openModal('แก้ไขรายการอาหาร', `<form id="food-log-edit"><div class="form-grid"><div class="field"><label>ชื่ออาหาร (ไทย)</label><input name="nameTh" value="${escapeHtml(item.nameTh||'')}"></div><div class="field"><label>ชื่ออาหาร (English)</label><input name="nameEn" value="${escapeHtml(item.nameEn||'')}"></div><div class="field"><label>จำนวน</label><input type="number" name="quantity" min="0.1" step="0.1" value="${item.quantity||1}"></div><div class="field"><label>Calories</label><input type="number" name="kcal" min="0" step="1" value="${item.kcal}"></div><div class="field"><label>Protein g</label><input type="number" name="proteinG" min="0" step="0.1" value="${item.proteinG}"></div><div class="field"><label>Carb g</label><input type="number" name="carbG" min="0" step="0.1" value="${item.carbG}"></div><div class="field"><label>Fat g</label><input type="number" name="fatG" min="0" step="0.1" value="${item.fatG}"></div></div><div class="button-row" style="margin-top:14px"><button class="button primary" type="submit">บันทึก</button><button class="button danger" type="button" data-delete-food-log>ลบ</button></div></form>`);
  const modal=document.querySelector('#modal-content');
  const form=modal.querySelector('#food-log-edit');
  form.querySelector('[name="quantity"]').addEventListener('input', event => {
    const q=Math.max(.1,Number(event.currentTarget.value)||1);
    for (const key of ['kcal','proteinG','carbG','fatG']) form.querySelector(`[name="${key}"]`).value=round(base[key]*q);
  });
  form.addEventListener('submit',async event=>{event.preventDefault();const d=new FormData(event.currentTarget);await app.store.upsertRecord(STORES.FOOD_LOGS,{...item,nameTh:(d.get('nameTh')||d.get('nameEn')||'').trim(),nameEn:(d.get('nameEn')||d.get('nameTh')||'').trim(),quantity:Number(d.get('quantity')),kcal:Number(d.get('kcal')),proteinG:Number(d.get('proteinG')),carbG:Number(d.get('carbG')),fatG:Number(d.get('fatG')),updatedAt:nowIso()});app.closeModal();app.toast('แก้ไขอาหารแล้ว');app.render();});
  modal.querySelector('[data-delete-food-log]').addEventListener('click',async()=>{await app.store.deleteRecord(STORES.FOOD_LOGS,item.id);app.closeModal();app.toast('ลบรายการแล้ว');app.render();});
}

function bindCustomFoodForm(container,state,app,dateKey) {
  container.querySelector('#custom-food-form').addEventListener('submit',async event=>{event.preventDefault();const d=new FormData(event.currentTarget);const nameTh=(d.get('nameTh')||'').trim();const nameEn=(d.get('nameEn')||'').trim();const item={id:createId('custom-food'),category:d.get('category'),nameTh:nameTh||nameEn,nameEn:nameEn||nameTh,serving:d.get('serving')||'1 หน่วย',kcal:Number(d.get('kcal')),proteinG:Number(d.get('proteinG'))||0,carbG:Number(d.get('carbG'))||0,fatG:Number(d.get('fatG'))||0,dataQuality:'user_entered',source:'manual',createdAt:nowIso(),updatedAt:nowIso()};if(!(item.nameTh||item.nameEn)||!Number.isFinite(item.kcal))return;await app.store.upsertRecord(STORES.CUSTOM_FOODS,item);await app.store.upsertRecord(STORES.FOOD_LOGS,foodLogRecord(item,dateKey,1));app.closeModal();app.toast('บันทึกเมนูและเพิ่มวันนี้แล้ว');app.render();});
}
function openFoodBaseEditor(state, app, id, dateKey) {
  const catalogBase = baseFoods().find(item => item.id === id);
  const custom = state.customFoods.find(item => item.id === id && !item.baseFoodId);
  const override = state.customFoods.find(item => item.baseFoodId === id);
  const item = custom || (catalogBase ? { ...catalogBase, ...(override || {}), id: catalogBase.id } : null);
  if (!item) return;
  const isCatalog = Boolean(catalogBase);
  app.openModal(isCatalog ? 'แก้ไขเมนูฐาน' : 'แก้ไขเมนูของฉัน', `<form id="food-base-edit">${customFoodFields(item)}<div class="button-row" style="margin-top:14px"><button class="button primary">บันทึก</button><button type="button" class="button danger" data-delete-food-base>${isCatalog ? 'ซ่อนเมนู' : 'ลบเมนู'}</button>${isCatalog && override ? '<button type="button" class="button secondary" data-reset-food-base>คืนค่าเดิม</button>' : ''}</div></form><div class="submetric" style="margin-top:10px">${isCatalog ? 'การแก้ไขจะสร้างค่าทับของผู้ใช้ โดยไม่แก้ฐานเมนูต้นฉบับ' : 'เมนูนี้เป็นข้อมูลที่คุณสร้างเอง'}</div>`);
  const modal = document.querySelector('#modal-content');
  modal.querySelector('#food-base-edit').addEventListener('submit', async event => {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const patch = {
      category:d.get('category'), nameTh:(d.get('nameTh')||d.get('nameEn')||'').trim(), nameEn:(d.get('nameEn')||d.get('nameTh')||'').trim(),
      serving:d.get('serving') || '1 หน่วย', kcal:Number(d.get('kcal')) || 0,
      proteinG:Number(d.get('proteinG')) || 0, carbG:Number(d.get('carbG')) || 0, fatG:Number(d.get('fatG')) || 0,
      dataQuality:'user_entered', updatedAt:nowIso()
    };
    if (isCatalog) await app.store.upsertRecord(STORES.CUSTOM_FOODS, { ...(override || {}), ...patch, id:`override:${id}`, baseFoodId:id, hidden:false, source:'user_override', createdAt:override?.createdAt || nowIso() });
    else await app.store.upsertRecord(STORES.CUSTOM_FOODS, { ...custom, ...patch });
    app.closeModal(); app.toast('บันทึกเมนูแล้ว'); app.render();
  });
  modal.querySelector('[data-delete-food-base]').addEventListener('click', async () => {
    if (isCatalog) await app.store.upsertRecord(STORES.CUSTOM_FOODS, { ...(override || {}), id:`override:${id}`, baseFoodId:id, hidden:true, source:'user_override', createdAt:override?.createdAt || nowIso(), updatedAt:nowIso() });
    else await app.store.deleteRecord(STORES.CUSTOM_FOODS, id);
    app.closeModal(); app.toast(isCatalog ? 'ซ่อนเมนูแล้ว' : 'ลบเมนูแล้ว'); app.render();
  });
  modal.querySelector('[data-reset-food-base]')?.addEventListener('click', async () => {
    await app.store.deleteRecord(STORES.CUSTOM_FOODS, `override:${id}`);
    app.closeModal(); app.toast('คืนค่าเมนูเดิมแล้ว'); app.render();
  });
}

function customFoodForm(){return `<form id="custom-food-form" class="card flat">${customFoodFields()}<button class="button primary full" style="margin-top:14px">บันทึกเมนู + เพิ่มวันนี้</button></form>`;}
function customFoodFields(item={}){return `<div class="form-grid"><div class="field"><label>ชื่ออาหาร (ไทย)</label><input name="nameTh" value="${escapeHtml(item.nameTh||'')}"></div><div class="field"><label>ชื่ออาหาร (English)</label><input name="nameEn" value="${escapeHtml(item.nameEn||'')}"></div><div class="field"><label>หมวด</label><select name="category">${Object.entries(FOOD_CATEGORIES).filter(([k])=>!['recent','custom'].includes(k)).map(([k,v])=>`<option value="${k}" ${item.category===k?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label>หน่วยบริโภค</label><input name="serving" value="${escapeHtml(item.serving||'1 หน่วย')}"></div><div class="field"><label>Calories</label><input type="number" name="kcal" min="0" required value="${item.kcal??''}"></div><div class="field"><label>Protein g</label><input type="number" step="0.1" name="proteinG" min="0" value="${item.proteinG??''}"></div><div class="field"><label>Carb g</label><input type="number" step="0.1" name="carbG" min="0" value="${item.carbG??''}"></div><div class="field"><label>Fat g</label><input type="number" step="0.1" name="fatG" min="0" value="${item.fatG??''}"></div></div>`;}

function foodLogRecord(food,dateKey,qty,grams=null){return {id:createId('food-log'),date:dateKey,foodId:food.id,category:food.category,nameTh:food.nameTh,nameEn:food.nameEn,serving:food.serving,servingGrams:food.servingGrams||null,grams:grams||null,quantity:qty,baseKcal:food.kcal,baseProteinG:food.proteinG,baseCarbG:food.carbG,baseFatG:food.fatG,baseFiberG:food.fiberG??null,baseSugarG:food.sugarG??null,baseSodiumMg:food.sodiumMg??null,kcal:round(food.kcal*qty),proteinG:round(food.proteinG*qty),carbG:round(food.carbG*qty),fatG:round(food.fatG*qty),fiberG:food.fiberG==null?null:round(food.fiberG*qty),sugarG:food.sugarG==null?null:round(food.sugarG*qty),sodiumMg:food.sodiumMg==null?null:round(food.sodiumMg*qty),dataQuality:food.dataQuality||'estimated',source:food.source||'catalog',createdAt:nowIso(),updatedAt:nowIso()};}
function foodPickerRow(food,app){return `<article class="list-item"><button class="food-row-main" data-pick-food="${food.id}"><strong>${escapeHtml(app.name(food))}</strong><small>${formatNumber(food.kcal)} kcal · P ${round(food.proteinG)} · C ${round(food.carbG)} · F ${round(food.fatG)} · ${escapeHtml(food.serving||'1 หน่วย')}${food.subCategory?` · ${escapeHtml(food.subCategory)}`:''}</small></button><button class="mini-button" data-edit-food-base="${food.id}" aria-label="แก้ไข">✎</button><button class="mini-button add" data-pick-food="${food.id}" aria-label="เพิ่ม">＋</button></article>`;}
function foodLogRow(item,app){return `<article class="list-item"><div class="food-icon">${foodIcon(item.category)}</div><div class="grow"><strong>${escapeHtml(app.name(item))} ${item.grams?`${formatNumber(item.grams)}g`:item.quantity!==1?`×${item.quantity}`:''}</strong><small>${formatNumber(item.kcal)} kcal · P ${round(item.proteinG)} · C ${round(item.carbG)} · F ${round(item.fatG)}</small></div><button class="mini-button" data-edit-food-log="${item.id}">✎</button></article>`;}
function foodIcon(category){return category==='protein'?'🍗':category==='snack'?'🍌':category==='fuel'?'⚡':category==='drink'?'🥤':'🍚';}
function macro(label,value,target,unit,pct){return `<div><strong>${formatNumber(value,1)}${target?`<small>/${target}</small>`:''} ${unit}</strong><span>${label}</span>${pct!=null?`<i><b style="width:${pct}%"></b></i>`:''}</div>`;}
function dateNavigator(dateKey,isToday){return `<div class="date-navigator"><button class="button secondary" data-date-shift="-1">‹</button><div><strong>${isToday?'วันนี้':formatDate(dateKey)}</strong><small>${dateKey}</small></div><button class="button secondary" data-date-shift="1" ${isToday?'disabled':''}>›</button><button class="button secondary" data-date-today>วันนี้</button></div>`;}
function bindDateNavigation(container,app){container.querySelectorAll('[data-date-shift]').forEach(b=>b.addEventListener('click',()=>{app.ui.foodDate=addDays(app.ui.foodDate,Number(b.dataset.dateShift));app.render();}));container.querySelector('[data-date-today]')?.addEventListener('click',()=>{app.ui.foodDate=localDateKey();app.render();});}
function energyMessage(day){if(!day.foodComplete)return `บันทึกแล้ว ${formatNumber(day.intakeKcal)} kcal แต่ยังไม่ครบวัน จึงยังไม่ใช้ยอดสุทธิสรุปแนวโน้ม`;if(day.netKcal < -700)return 'ขาดพลังงานค่อนข้างมาก โดยเฉพาะวันซ้อมหนักอาจทำให้ฟื้นตัวไม่ทัน';if(day.netKcal > 700)return 'พลังงานสูงกว่าค่าประมาณหนึ่งวันยังไม่ใช่ปัญหา ให้ดูแนวโน้มหลายวันและความหิว/การฟื้นตัว';return 'พลังงานอยู่ในช่วงใกล้เคียงค่าประมาณ ให้ดู Sleep, Readiness และคุณภาพการซ้อมร่วมกัน';}
function energyPeriodMessage(range){if(!range.completeDays)return 'ยังไม่มีวันที่ทำเครื่องหมายว่าบันทึกอาหารครบ จึงยังสรุป Calories deficit ไม่ได้';if(range.coveragePct<50)return `ช่วงนี้มีข้อมูลครบเพียง ${range.coveragePct}% ควรกรอกให้ครบมากขึ้นก่อนตีความแนวโน้ม`;if(range.averageNetKcal < -500)return `ค่าเฉลี่ยสุทธิ ${range.averageNetKcal} kcal/วัน อยู่ในระดับขาดพลังงานค่อนข้างมาก ควรดู Recovery, Sleep และคุณภาพการซ้อมร่วมกัน โดยเฉพาะช่วง Build/Peak`;if(range.averageNetKcal > 500)return `ค่าเฉลี่ยสุทธิ +${range.averageNetKcal} kcal/วัน ให้ดูแนวโน้มหลายวัน ความหิว และการฟื้นตัว ไม่ต้องแก้ด้วยการอดอาหารฉับพลัน`;return `ช่วงที่เลือกมี Net ${range.netKcal>0?'+':''}${formatNumber(range.netKcal)} kcal จากข้อมูลครบ ${range.completeDays} วัน ใช้เป็นแนวโน้ม ไม่ใช่คำวินิจฉัยหรือเป้าบังคับ`; }
function formatDate(value){try{return new Intl.DateTimeFormat(document.documentElement.lang==='en'?'en-GB':'th-TH',{weekday:'short',day:'numeric',month:'short'}).format(new Date(`${value}T00:00:00`));}catch{return value;}}
function round(value){return Math.round((Number(value)||0)*10)/10;}
