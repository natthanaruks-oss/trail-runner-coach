export const rehabExercises = [
  {
    id: 'short-foot',
    name: 'Short Foot',
    target: 'อุ้งเท้า / เท้าแบน / รองช้ำ',
    prescription: '3 × 10 ต่อข้าง ค้าง 5 วินาที',
    phase: ['prep', 'base', 'build', 'peak', 'taper'],
    priority: 'high',
    cues: ['ดึงโคนนิ้วโป้งเข้าหาส้นโดยไม่งอนิ้ว', 'รักษาสามจุดสัมผัส: ส้น โคนนิ้วโป้ง โคนนิ้วก้อย', 'เริ่มท่านั่ง แล้วค่อยพัฒนาเป็นยืน'],
    stopIf: 'ปวดแปลบหรือเป็นตะคริวรุนแรง'
  },
  {
    id: 'towel-scrunch',
    name: 'Towel Scrunch',
    target: 'กล้ามเนื้อเล็กของเท้า',
    prescription: '2–3 × 15',
    phase: ['prep', 'base'],
    priority: 'medium',
    cues: ['วางส้นติดพื้น', 'ขยุ้มผ้าช้า ๆ ไม่เกร็งน่อง'],
    stopIf: 'เจ็บฝ่าเท้าเพิ่มหลังทำ'
  },
  {
    id: 'eccentric-heel-drop',
    name: 'Eccentric Heel Drop',
    target: 'เอ็นร้อยหวาย / น่อง',
    prescription: '3 × 12–15 ลงช้า 3 วินาที',
    phase: ['prep', 'base', 'build'],
    priority: 'high',
    cues: ['ใช้สองขาช่วยขึ้น ใช้ข้างเดียวควบคุมลง', 'เข่าตรงและเข่างออย่างละแบบ', 'ไม่เด้งที่จุดล่าง'],
    stopIf: 'ปวดเอ็นร้อยหวายเกิน 3/10 หรือปวดค้างวันถัดไปมากขึ้น'
  },
  {
    id: 'clamshell',
    name: 'Clamshell',
    target: 'Glute medius / ITB control',
    prescription: '3 × 12–15 ต่อข้าง',
    phase: ['prep', 'base', 'build'],
    priority: 'high',
    cues: ['สะโพกไม่กลิ้งไปด้านหลัง', 'เท้าชิดกันและเปิดเข่าจากกล้ามก้น'],
    stopIf: 'ปวดด้านข้างเข่าหรือสะโพกแปลบ'
  },
  {
    id: 'side-lying-leg-raise',
    name: 'Side-Lying Leg Raise',
    target: 'Glute medius / pelvic stability',
    prescription: '3 × 12–15 ต่อข้าง',
    phase: ['prep', 'base', 'build'],
    priority: 'medium',
    cues: ['ปลายเท้าชี้ตรงหรือกดลงเล็กน้อย', 'ยกไม่สูงจนหลังแอ่น'],
    stopIf: 'รู้สึกที่หลังล่างมากกว่ากล้ามก้น'
  },
  {
    id: 'step-down',
    name: 'Step-Down',
    target: 'แรงเบรกลงเขา / คุมเข่า / Quadriceps eccentric',
    prescription: '3 × 8–10 ต่อข้าง',
    phase: ['base', 'build', 'peak'],
    priority: 'high',
    cues: ['เข่าชี้ตามแนวนิ้วเท้าที่สอง', 'ลดตัวช้า 3 วินาที', 'เริ่มจากกล่องเตี้ยก่อน'],
    stopIf: 'เข่าปวดเกิน 3/10 หรือทรงตัวเสียจนเข่าล้มเข้าใน'
  },
  {
    id: 'bulgarian-split-squat',
    name: 'Bulgarian Split Squat',
    target: 'กำลังขาเดี่ยว / ความสมดุล / กล้ามก้น',
    prescription: '3 × 6–10 ต่อข้าง',
    phase: ['base', 'build', 'peak'],
    priority: 'high',
    cues: ['ลงน้ำหนักกลางเท้าหน้า', 'ลำตัวเอียงหน้าเล็กน้อย', 'เริ่มน้ำหนักตัวก่อนเพิ่มดัมเบล'],
    stopIf: 'เจ็บเข่า เอ็นร้อยหวาย หรือเสียฟอร์ม'
  },
  {
    id: 'calf-isometric',
    name: 'Calf Isometric Hold',
    target: 'เอ็นร้อยหวาย / ลดอาการระคายก่อนโหลด',
    prescription: '4 × 30–45 วินาที',
    phase: ['prep', 'base'],
    priority: 'medium',
    cues: ['ยกส้นระดับกลาง', 'คงแรงเท่ากันตลอดเซ็ต'],
    stopIf: 'ปวดเพิ่มระหว่างทำ'
  },
  {
    id: 'plantar-stretch',
    name: 'Plantar Fascia Stretch',
    target: 'รองช้ำ โดยเฉพาะก่อนก้าวแรกตอนเช้า',
    prescription: 'ค้าง 30 วินาที × 3',
    phase: ['prep', 'base', 'build', 'peak', 'taper'],
    priority: 'high',
    cues: ['ดึงนิ้วเท้าเข้าหาหน้าแข้งจนตึงฝ่าเท้า', 'ทำก่อนลงจากเตียงและหลังนั่งนาน'],
    stopIf: 'ปวดแปลบ'
  }
];

export const runningDrills = [
  { id: 'a-skip', name: 'A-Skip', prescription: '2 × 20 เมตร', purpose: 'Cadence และลงเท้าใต้ลำตัว' },
  { id: 'b-skip', name: 'B-Skip', prescription: '2 × 20 เมตร', purpose: 'การเหยียดขาและ hamstring timing' },
  { id: 'strides', name: 'Strides', prescription: '4–6 × 20 วินาที', purpose: 'ฟอร์มเร็วแบบไม่ล้า' },
  { id: 'downhill-stride', name: 'Downhill Stride Drill', prescription: '4 × 20–30 วินาที บนทางไม่ชัน', purpose: 'ก้าวสั้น ถี่ เบา และไม่เบรกด้วยส้น' }
];
