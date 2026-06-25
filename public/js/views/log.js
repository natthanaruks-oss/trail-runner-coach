import { PAIN_AREAS, STORES } from '../core/constants.js';
import { createId } from '../core/id.js';
import { localDateKey, nowIso } from '../core/date.js';
import { escapeHtml, formatNumber, pageHeader } from './components.js';
import { renderConnections } from './connections.js';

const TABS=[['motivation','แรงใจ'],['progress','ความก้าวหน้า'],['pain','อาการเจ็บ'],['body','น้ำหนัก'],['sleep','การนอน'],['connections','เชื่อมต่อ'],['data','ข้อมูล']];
const QUOTES=[
  'ความก้าวหน้า ไม่ใช่ความสมบูรณ์แบบ',
  'ทุกครั้งที่อยากเลิก จำว่าทำไมถึงเริ่ม',
  'ก้าวต่อไป แม้ช้า ก็ยังคือก้าวไปข้างหน้า',
  'ภูเขาไม่ได้เอาชนะด้วยกำลัง แต่ด้วยความไม่ยอมแพ้',
  'ความสม่ำเสมอ 80% ดีกว่าเป๊ะ 100% แล้วเจ็บจนหยุด'
];

export function renderLog(container,state,app){
  app.ui.logTab ||= 'motivation';
  const tab=app.ui.logTab;
  container.innerHTML=`${pageHeader('บันทึก','แรงใจ อาการเจ็บ น้ำหนัก การนอน และข้อมูลสำรอง — อิง workflow เดิม','Personal logbook')}
  <div class="segmented-scroll">${TABS.map(([k,l])=>`<button class="segmented-button ${tab===k?'active':''}" data-log-tab="${k}">${l}</button>`).join('')}</div><div id="log-content" class="section"></div>`;
  container.querySelectorAll('[data-log-tab]').forEach(button=>button.addEventListener('click',()=>{const next=button.dataset.logTab;if(next==='progress'){app.navigate('progress');return;}app.ui.logTab=next;app.render();}));
  const content=container.querySelector('#log-content');
  if(tab==='motivation')renderMotivation(content,state,app);
  else if(tab==='pain')renderPainTab(content,state,app);
  else if(tab==='body')renderBodyTab(content,state,app);
  else if(tab==='sleep')renderSleepTab(content,state,app);
  else if(tab==='connections')renderConnections(content,state,app,{embedded:true});
  else renderDataTab(content,state);
}

function renderMotivation(container,state,app){
  const quote=QUOTES[Math.abs(dayNumber(localDateKey()))%QUOTES.length];
  container.innerHTML=`<article class="card hero"><div class="eyebrow">แรงใจประจำวัน</div><blockquote class="motivation-quote">“${escapeHtml(app.t(quote))}”</blockquote></article>
  <article class="card flat section"><h2 style="margin-top:0">ทำไมฉันถึงวิ่ง?</h2><p class="submetric">เขียนเหตุผลของคุณไว้กลับมาอ่านในคืนที่ขาไม่อยากก้าว เป้าหมายคือจบอย่างสุขภาพดีและมีความสุข</p><textarea id="motivation-text" class="large-textarea" rows="7" placeholder="เช่น เพื่อสุขภาพ เพื่อพิสูจน์ว่าทำได้ เพื่อคนที่รัก…">${escapeHtml(state.settings.profile?.motivation||'')}</textarea><button class="button primary full" data-save-motivation style="margin-top:12px">บันทึกแรงใจ</button></article>`;
  container.querySelector('[data-save-motivation]').addEventListener('click',async()=>{await app.store.saveSettings({profile:{motivation:container.querySelector('#motivation-text').value}});app.toast('บันทึกแรงใจแล้ว');});
}

function renderPainTab(container,state,app){
  const logs=[...state.painLogs].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const repeated=repeatedAreas(logs,14);
  container.innerHTML=`${repeated.length?`<div class="callout danger"><strong>จุดที่เกิดซ้ำใน 14 วัน:</strong> ${repeated.map(item=>`${escapeHtml(areaLabel(item.area))} ${item.count} ครั้ง`).join(' · ')}</div>`:''}
  <form id="log-pain-form" class="card flat ${repeated.length?'section':''}"><div class="form-grid"><div class="field"><label>วันที่</label><input type="date" name="date" value="${localDateKey()}"></div><div class="field"><label>บริเวณ</label><select name="area">${PAIN_AREAS.map(a=>`<option value="${a.id}">${escapeHtml(a.label)}</option>`).join('')}</select></div><div class="field full"><label>ความรุนแรง 0–10</label><input type="range" name="severity" min="0" max="10" value="3"><output class="range-value" data-pain-output>3</output></div><div class="field"><label>เกิดเมื่อ</label><select name="during"><option value="morning">ก้าวแรกตอนเช้า</option><option value="walking">เดิน</option><option value="during_run">ระหว่างวิ่ง</option><option value="after_run">หลังวิ่ง</option><option value="next_day">วันถัดไป</option></select></div><div class="field"><label>แนวโน้ม</label><select name="trend"><option value="new">เพิ่งเกิด</option><option value="better">ดีขึ้น</option><option value="same">เท่าเดิม</option><option value="worse">แย่ลง</option></select></div><div class="field full"><label>หมายเหตุ</label><textarea name="note" rows="2"></textarea></div></div><button class="button primary full" style="margin-top:12px">บันทึกอาการ</button></form>
  <section class="section"><div class="section-head"><h2>ประวัติล่าสุด</h2><a href="#/pain">เปิด Pain Log เต็ม</a></div><div class="list">${logs.length?logs.slice(0,20).map(log=>`<article class="list-item"><span class="pain-dot ${Number(log.severity)>=6?'red':Number(log.severity)>=3?'yellow':'green'}"></span><div class="grow"><strong>${escapeHtml(areaLabel(log.area))} · ${log.severity}/10</strong><small>${escapeHtml(log.date)} · ${escapeHtml(log.during||'')} · ${escapeHtml(log.trend||'')}${log.note?` · ${escapeHtml(log.note)}`:''}</small></div><button class="mini-button" data-delete-log-pain="${log.id}">×</button></article>`).join(''):'<div class="empty">ยังไม่มีบันทึก — ดีแล้ว</div>'}</div></section><div class="callout danger">Pain ≥6/10, เจ็บขณะเดิน, บวม, เดินผิดรูป หรืออาการแย่ลงต่อเนื่อง ควรหยุดโหลดและประเมินโดยผู้เชี่ยวชาญ</div>`;
  const range=container.querySelector('[name="severity"]');range.addEventListener('input',()=>container.querySelector('[data-pain-output]').textContent=range.value);
  container.querySelector('#log-pain-form').addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.currentTarget);await app.store.upsertRecord(STORES.PAIN,{id:createId('pain'),date:d.get('date'),area:d.get('area'),severity:Number(d.get('severity')),during:d.get('during'),trend:d.get('trend'),note:d.get('note')||'',source:'manual',createdAt:nowIso()});app.toast('บันทึกอาการแล้ว');app.render();});
  container.querySelectorAll('[data-delete-log-pain]').forEach(b=>b.addEventListener('click',async()=>{await app.store.deleteRecord(STORES.PAIN,b.dataset.deleteLogPain);app.render();}));
}

function renderBodyTab(container,state,app){
  const records=[...state.bodyComposition].filter(r=>Number(r.weightKg)>0).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const latest=records[0];
  container.innerHTML=`<div class="callout good">⚖️ ใช้น้ำหนักและ InBody เพื่อดู mechanical load, muscle และ recovery ไม่ใช่คำสั่งลดน้ำหนักช่วง Build/Peak</div>
  <section class="grid three section"><article class="card flat"><div class="card-title">ล่าสุด</div><div class="metric">${formatNumber(latest?.weightKg,1)}<small>kg</small></div><div class="submetric">${latest?.date||'ยังไม่มีข้อมูล'}</div></article><article class="card flat"><div class="card-title">SMM</div><div class="metric">${formatNumber(latest?.skeletalMuscleMassKg,1)}<small>kg</small></div></article><article class="card flat"><div class="card-title">Body fat</div><div class="metric">${formatNumber(latest?.percentBodyFat,1)}<small>%</small></div></article></section>
  <form id="manual-weight-form" class="card flat section"><div class="form-grid"><div class="field"><label>วันที่</label><input type="date" name="date" value="${localDateKey()}"></div><div class="field"><label>น้ำหนัก (kg)</label><input type="number" step="0.1" min="30" max="250" name="weightKg" required></div></div><button class="button primary full" style="margin-top:12px">บันทึกน้ำหนัก</button></form>
  <div class="button-row section"><a class="button secondary" href="#/body">เปิด Body & InBody</a><a class="button secondary" href="#/data">Import InBody JSON</a></div>
  <div class="list section">${records.slice(0,20).map(r=>`<article class="list-item"><div class="food-icon">⚖️</div><div class="grow"><strong>${formatNumber(r.weightKg,1)} kg</strong><small>${r.date} · ${escapeHtml(r.source||'manual')}${r.percentBodyFat?` · PBF ${formatNumber(r.percentBodyFat,1)}%`:''}</small></div></article>`).join('')}</div>`;
  container.querySelector('#manual-weight-form').addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.currentTarget);const date=d.get('date');await app.store.upsertRecord(STORES.BODY_COMPOSITION,{id:`manual-weight-${date}`,date,measuredAt:`${date}T08:00:00`,weightKg:Number(d.get('weightKg')),source:'manual',createdAt:nowIso(),updatedAt:nowIso()});await app.store.saveSettings({athlete:{weightKg:Number(d.get('weightKg'))}});app.toast('บันทึกน้ำหนักแล้ว');app.render();});
}

function renderSleepTab(container,state,app){
  app.ui.sleepDate ||= localDateKey();
  const date=app.ui.sleepDate;
  const row=state.checkins.find(c=>c.date===date)||{};
  const recent=[...state.checkins].filter(c=>c.sleepHours!=null||c.restingHr!=null).sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,14);
  container.innerHTML=`<form id="sleep-form" class="card flat"><div class="form-grid"><div class="field"><label>วันที่</label><input type="date" name="date" value="${date}"></div><div class="field"><label>ชั่วโมงนอน</label><input type="number" step="0.1" min="0" max="14" name="sleepHours" value="${row.sleepHours??''}"></div><div class="field"><label>คุณภาพ 1–5</label><input type="number" min="1" max="5" name="sleepQuality" value="${row.sleepQuality??3}"></div><div class="field"><label>Resting HR</label><input type="number" min="30" max="150" name="restingHr" value="${row.restingHr??''}"></div><div class="field"><label>HRV ms</label><input type="number" min="1" max="300" name="hrvMs" value="${row.hrvMs??''}"></div><div class="field"><label>Fatigue 1–5</label><input type="number" min="1" max="5" name="fatigue" value="${row.fatigue??3}"></div></div><button class="button primary full" style="margin-top:12px">บันทึก Sleep / RHR</button></form>
  <section class="section"><div class="section-head"><h2>ย้อนหลัง</h2><a href="#/data">Sync Apple Health</a></div><div class="list">${recent.length?recent.map(c=>`<article class="list-item"><div class="food-icon">😴</div><div class="grow"><strong>${c.date} · ${c.sleepHours??'—'} h</strong><small>Quality ${c.sleepQuality??'—'}/5 · RHR ${c.restingHr??'—'} · HRV ${c.hrvMs??'—'} · ${escapeHtml(c.source||'manual')}</small></div></article>`).join(''):'<div class="empty">ยังไม่มีข้อมูลการนอน</div>'}</div></section><div class="callout">Apple Health เป็นแหล่งหลักเมื่อใช้งานผ่าน iOS Companion แต่ยังกรอกมือและแก้ไขวันย้อนหลังได้เหมือนระบบเดิม</div>`;
  container.querySelector('#sleep-form').addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.currentTarget);const dateKey=d.get('date');const existing=app.store.getState().checkins.find(c=>c.date===dateKey)||{};const num=k=>d.get(k)===''?null:Number(d.get(k));await app.store.upsertRecord(STORES.CHECKINS,{...existing,date:dateKey,sleepHours:num('sleepHours'),sleepQuality:num('sleepQuality'),restingHr:num('restingHr'),hrvMs:num('hrvMs'),fatigue:num('fatigue'),source:existing.source==='apple_health'?'hybrid':'manual',updatedAt:nowIso(),createdAt:existing.createdAt||nowIso()});app.toast('บันทึกการนอนแล้ว');app.render();});
}

function renderDataTab(container,state){
  const lastSync=state.metadata.find(m=>m.id==='apple_health_sync');
  container.innerHTML=`<div class="more-grid"><a class="more-link" href="#/data"><span>⌁</span><div><strong>ข้อมูล & Wearables</strong><small>Apple Health, GPX/TCX, Backup/Restore</small></div></a><a class="more-link" href="#/settings"><span>⚙</span><div><strong>ตั้งค่า</strong><small>Athlete baseline, Max HR และ Preferences</small></div></a><a class="more-link" href="#/races"><span>🏁</span><div><strong>สนามเป้าหมาย</strong><small>Race Profiles และ Training Plan</small></div></a><a class="more-link" href="#/gear"><span>🎒</span><div><strong>Gear Checklist</strong><small>อุปกรณ์วันแข่งและกลางคืน</small></div></a></div><article class="card flat section"><div class="card-title">Apple Health ล่าสุด</div><div class="metric" style="font-size:20px">${lastSync?.lastSyncAt?escapeHtml(lastSync.lastSyncAt):'ยังไม่เคย Sync'}</div><div class="submetric">ข้อมูลทั้งหมดอยู่ใน IndexedDB บนอุปกรณ์ เว้นแต่เปิด integration server ในอนาคต</div></article>`;
}

function repeatedAreas(logs,days){const cutoff=new Date();cutoff.setDate(cutoff.getDate()-days);const start=cutoff.toISOString().slice(0,10);const counts={};logs.filter(l=>l.date>=start).forEach(l=>counts[l.area]=(counts[l.area]||0)+1);return Object.entries(counts).filter(([,count])=>count>=3).map(([area,count])=>({area,count}));}
function areaLabel(id){return PAIN_AREAS.find(a=>a.id===id)?.label||id;}
function dayNumber(date){return Math.floor(new Date(`${date}T00:00:00`).getTime()/86400000);}
