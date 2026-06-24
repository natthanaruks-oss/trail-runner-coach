import { pageHeader, fieldNumber } from './components.js';
export function renderSettings(container,state,app){
  const s=state.settings;
  container.innerHTML=`
    ${pageHeader('ตั้งค่า','ค่าพื้นฐานสำหรับ Recovery, Strain, Nutrition และ HR Zones ไม่ผูกกับสนามใดสนามหนึ่ง','Athlete profile')}
    <form id="settings-form" class="card"><div class="form-grid">
      ${fieldNumber({name:'age',label:'อายุ',value:s.athlete.age??'',min:18,max:90})}
      <div class="field"><label>เพศสำหรับสูตร BMR (ไม่บังคับ)</label><select name="sex"><option value="" ${!s.athlete.sex?'selected':''}>ไม่ระบุ</option><option value="male" ${s.athlete.sex==='male'?'selected':''}>ชาย</option><option value="female" ${s.athlete.sex==='female'?'selected':''}>หญิง</option></select></div>
      ${fieldNumber({name:'heightCm',label:'ส่วนสูง (cm)',value:s.athlete.heightCm??'',min:120,max:230,step:.1})}
      ${fieldNumber({name:'weightKg',label:'น้ำหนักปัจจุบัน (kg)',value:s.athlete.weightKg??'',min:30,max:250,step:.1})}
      ${fieldNumber({name:'maxHr',label:'Max HR (ถ้าทราบ)',value:s.athlete.maxHr??'',min:100,max:230})}
      ${fieldNumber({name:'restingHrBaseline',label:'Resting HR baseline',value:s.athlete.restingHrBaseline??'',min:30,max:120})}
      ${fieldNumber({name:'bmrKcal',label:'BMR kcal (เว้นว่างเพื่อใช้ InBody/สูตร)',value:s.nutrition?.bmrKcal??'',min:800,max:4000})}
      <div class="field"><label>กิจกรรมนอกการซ้อม</label><select name="activityFactor"><option value="1.2" ${Number(s.preferences?.nonExerciseActivityFactor||1.2)===1.2?'selected':''}>นั่งทำงาน 1.20</option><option value="1.3" ${Number(s.preferences?.nonExerciseActivityFactor)===1.3?'selected':''}>ขยับบ้าง 1.30</option><option value="1.4" ${Number(s.preferences?.nonExerciseActivityFactor)===1.4?'selected':''}>ขยับเยอะ 1.40</option><option value="1.5" ${Number(s.preferences?.nonExerciseActivityFactor)===1.5?'selected':''}>ใช้แรงมาก 1.50</option></select></div>
      ${fieldNumber({name:'proteinTargetGPerKg',label:'Protein target (g/kg)',value:s.nutrition?.proteinTargetGPerKg??1.8,min:1.2,max:2.4,step:.1})}
      ${fieldNumber({name:'waterBaseMlPerKg',label:'น้ำพื้นฐาน (ml/kg)',value:s.nutrition?.waterBaseMlPerKg??30,min:20,max:50,step:1})}
      <label class="check-row field full"><input type="checkbox" name="flatFeet" ${s.athlete.flatFeet?'checked':''}><span>เท้าแบน</span></label>
      <label class="check-row field full"><input type="checkbox" name="wideForefoot" ${s.athlete.wideForefoot?'checked':''}><span>หน้าเท้ากว้าง</span></label>
    </div><button class="button primary full" style="margin-top:14px">บันทึกการตั้งค่า</button></form>
    <section class="section"><div class="callout">วันแข่งขันและวันเริ่มแผนอยู่หน้า “สนามเป้าหมาย” เพื่อรองรับหลายสนาม ส่วน Calories เป็นค่าประมาณเพื่อประกอบการฟื้นตัว ไม่ใช่คำสั่งจำกัดอาหาร</div></section>
    <section class="section"><div class="callout">Resting HR baseline ควรมาจากค่าตอนตื่นหลายวันในช่วงที่ไม่ป่วย หากยังไม่ใส่ ระบบจะหา median จากประวัติ Check-in อย่างน้อย 3 วัน</div></section>`;
  container.querySelector('#settings-form').addEventListener('submit',async event=>{event.preventDefault();const d=new FormData(event.currentTarget);const nullable=k=>d.get(k)===''?null:Number(d.get(k));await app.store.saveSettings({athlete:{age:nullable('age'),sex:d.get('sex')||null,heightCm:nullable('heightCm'),weightKg:nullable('weightKg'),maxHr:nullable('maxHr'),restingHrBaseline:nullable('restingHrBaseline'),flatFeet:d.has('flatFeet'),wideForefoot:d.has('wideForefoot')},preferences:{nonExerciseActivityFactor:Number(d.get('activityFactor'))||1.2},nutrition:{bmrKcal:nullable('bmrKcal'),proteinTargetGPerKg:Number(d.get('proteinTargetGPerKg'))||1.8,waterBaseMlPerKg:Number(d.get('waterBaseMlPerKg'))||30}});app.toast('บันทึกการตั้งค่าแล้ว');app.render();});
}
