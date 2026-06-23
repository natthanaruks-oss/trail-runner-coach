import { pageHeader, fieldNumber } from './components.js';
export function renderSettings(container,state,app){
  const s=state.settings;
  container.innerHTML=`
    ${pageHeader('ตั้งค่า','ค่าพื้นฐานสำหรับ Recovery และ Strain ไม่ผูกกับสนามใดสนามหนึ่ง','Athlete profile')}
    <form id="settings-form" class="card"><div class="form-grid">
      ${fieldNumber({name:'age',label:'อายุ',value:s.athlete.age??'',min:18,max:90})}
      ${fieldNumber({name:'heightCm',label:'ส่วนสูง (cm)',value:s.athlete.heightCm??'',min:120,max:230,step:.1})}
      ${fieldNumber({name:'weightKg',label:'น้ำหนักปัจจุบัน (kg)',value:s.athlete.weightKg??'',min:30,max:250,step:.1})}
      ${fieldNumber({name:'maxHr',label:'Max HR (ถ้าทราบ)',value:s.athlete.maxHr??'',min:100,max:230})}
      ${fieldNumber({name:'restingHrBaseline',label:'Resting HR baseline',value:s.athlete.restingHrBaseline??'',min:30,max:120})}
      <label class="check-row field full"><input type="checkbox" name="flatFeet" ${s.athlete.flatFeet?'checked':''}><span>เท้าแบน</span></label>
      <label class="check-row field full"><input type="checkbox" name="wideForefoot" ${s.athlete.wideForefoot?'checked':''}><span>หน้าเท้ากว้าง</span></label>
    </div><button class="button primary full" style="margin-top:14px">บันทึกการตั้งค่า</button></form>
    <section class="section"><div class="callout">วันแข่งขันและวันเริ่มแผนย้ายไปอยู่หน้า “สนามเป้าหมาย” เพื่อให้รองรับหลายสนามโดยไม่เปลี่ยน Athlete profile</div></section>
    <section class="section"><div class="callout">Resting HR baseline ควรมาจากค่าตอนตื่นหลายวันในช่วงที่ไม่ป่วย หากยังไม่ใส่ ระบบจะหา median จากประวัติ Check-in อย่างน้อย 3 วัน</div></section>`;
  container.querySelector('#settings-form').addEventListener('submit',async event=>{event.preventDefault();const d=new FormData(event.currentTarget);const nullable=k=>d.get(k)===''?null:Number(d.get(k));await app.store.saveSettings({athlete:{age:nullable('age'),sex:s.athlete.sex||null,heightCm:nullable('heightCm'),weightKg:nullable('weightKg'),maxHr:nullable('maxHr'),restingHrBaseline:nullable('restingHrBaseline'),flatFeet:d.has('flatFeet'),wideForefoot:d.has('wideForefoot')}});app.toast('บันทึกการตั้งค่าแล้ว');app.render();});
}
