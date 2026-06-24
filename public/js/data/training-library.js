export const strengthExercises = Object.freeze([
  { id:'goblet-squat', name:'Goblet Squat', target:'ต้นขา / กล้ามก้น', prescription:'3 × 8–12', priority:'normal', query:'goblet squat dumbbell form', cues:['เข่าชี้ตามแนวนิ้วเท้า','ลงน้ำหนักกลางเท้า','รักษาลำตัวมั่นคง'] },
  { id:'romanian-deadlift', name:'Romanian Deadlift', target:'Hamstring / สะโพก / หลังล่าง', prescription:'3 × 8–10', priority:'normal', query:'dumbbell romanian deadlift form', cues:['ดันสะโพกไปหลัง','หลังเป็นกลาง','หยุดก่อนฟอร์มเสีย'] },
  { id:'bulgarian-split-squat', name:'Bulgarian Split Squat', target:'กำลังขาเดี่ยว / สมดุล / กล้ามก้น', prescription:'3 × 6–10 ต่อข้าง', priority:'high', query:'bulgarian split squat dumbbell form', cues:['เริ่มจากน้ำหนักตัว','เข่าหน้าตามแนวเท้า','เพิ่มโหลดเมื่อทำได้มั่นคง'] },
  { id:'step-down-strength', name:'Step-down', target:'แรงเบรกลงเขา / คุมเข่า / Quadriceps eccentric', prescription:'3 × 8–10 ต่อข้าง', priority:'high', query:'single leg step down eccentric knee', cues:['ลดตัวช้า 3 วินาที','เริ่มกล่องเตี้ย','หยุดถ้าเข่าล้มเข้าใน'] },
  { id:'loaded-calf-raise', name:'Loaded Calf Raise', target:'น่อง / เอ็นร้อยหวาย', prescription:'3 × 15–20', priority:'normal', query:'weighted calf raise form', cues:['เต็มช่วงการเคลื่อนไหว','คุมลงช้า','ทำทั้งเข่าตรงและเข่างอ'] },
  { id:'plank-side-plank', name:'Plank / Side Plank', target:'Core / การคุมช่วงบน', prescription:'3 × 30–60 วินาที', priority:'normal', query:'plank side plank form', cues:['ลำตัวเป็นเส้นตรง','ไม่กลั้นหายใจ','หยุดก่อนหลังแอ่น'] },
  { id:'single-leg-rdl', name:'Single-leg RDL', target:'สะโพก / Hamstring / Balance', prescription:'3 × 8 ต่อข้าง', priority:'normal', query:'single leg romanian deadlift form', cues:['สะโพกสองข้างอยู่ระดับเดียวกัน','เข่างอเล็กน้อย','แตะผนังช่วยทรงตัวได้'] },
  { id:'step-up', name:'Step-up', target:'กำลังขึ้นเขา / Glute / Quadriceps', prescription:'3 × 10 ต่อข้าง', priority:'normal', query:'step up exercise proper form', cues:['ดันผ่านขาบนกล่อง','ไม่กระโดดจากขาล่าง','ลงช้าและควบคุม'] }
]);

export const runningDrills = Object.freeze([
  { id:'a-skip', name:'A-Skip', target:'ยกเข่า / Cadence / ลงเท้าใต้ลำตัว', prescription:'2 × 20 เมตร', query:'a skip running drill technique', cues:['ตัวสูง','เท้าลงใต้สะโพก','จังหวะเบาและเร็ว'] },
  { id:'b-skip', name:'B-Skip', target:'Leg extension / Hamstring timing', prescription:'2 × 20 เมตร', query:'b skip running drill technique', cues:['เริ่มจาก A-skip','เหยียดแล้วดึงเท้าลง','ไม่เตะไปข้างหน้ารุนแรง'] },
  { id:'strides', name:'Strides', target:'ฟอร์ม / Cadence สูง', prescription:'4–6 × 20 วินาที', query:'running strides drill technique', cues:['เร่งอย่างนุ่มนวล','เร็วแต่ไม่ sprint','พักจนหายเหนื่อยระหว่างเที่ยว'] },
  { id:'downhill-stride', name:'Downhill Stride Drill', target:'ลงเขาก้าวถี่และเบา', prescription:'4 × ทางลงสั้น', query:'downhill running technique drill', cues:['เลือกทางลาดไม่ชันก่อน','เพิ่ม cadence ลด overstride','หยุดเมื่อฟอร์มเริ่มเสีย'] },
  { id:'ankling', name:'Ankling', target:'Foot stiffness / Contact เบา', prescription:'2 × 20 เมตร', query:'ankling running drill', cues:['ก้าวสั้น','เด้งจากข้อเท้าเบา ๆ','ไม่ยกเข่าสูง'] }
]);

export const homeEquipment = Object.freeze([
  { id:'resistance-band', label:'Resistance band (ยางยืดวง)', reason:'Clamshell, Monster walk และงาน Glute medius', cost:'150–400 บาท', priority:'high' },
  { id:'adjustable-dumbbell', label:'Dumbbell ปรับน้ำหนัก', reason:'Goblet squat, RDL, Split squat และ Calf raise', cost:'800–2,500 บาท', priority:'high' },
  { id:'step-box', label:'กล่องหรือม้านั่ง Step box', reason:'Step-down, Step-up และ Bulgarian split squat', cost:'500–1,500 บาท', priority:'high' },
  { id:'yoga-mat', label:'เสื่อโยคะ', reason:'Core, mobility, stretching และ rehab', cost:'200–500 บาท', priority:'normal' },
  { id:'foam-roller', label:'Foam roller', reason:'ใช้ผ่อนคลายกล้ามเนื้อหลังซ้อม ไม่ใช้กดทับจุดเจ็บรุนแรง', cost:'300–700 บาท', priority:'normal' },
  { id:'massage-ball', label:'ลูกบอลนวด / ลูกเทนนิส', reason:'นวดฝ่าเท้าและกล้ามเนื้อเฉพาะจุดอย่างอ่อนโยน', cost:'0–200 บาท', priority:'normal' }
]);
