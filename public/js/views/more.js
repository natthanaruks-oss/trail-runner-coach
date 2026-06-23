import { pageHeader } from './components.js';
export function renderMore(container){
  const links=[
    ['🏁','สนามเป้าหมาย','Race Profiles, active race และแผนที่เชื่อมอยู่','races'],
    ['🩹','Pain Log','ติดตามอาการเจ็บและแนวโน้ม','pain'],
    ['🍚','โภชนาการ','Fueling guideline และ Race timeline','nutrition'],
    ['🎒','Gear Checklist','อุปกรณ์กลางคืนและพึ่งพาตัวเอง','gear'],
    ['❤️','ทำไมฉันถึงวิ่ง','เหตุผลที่ต้องกลับมาอ่านตอนท้อ','motivation'],
    ['⌁','ข้อมูล & Wearables','Apple Health, Import, Export และสถานะการเชื่อมต่อ','data'],
    ['⚖️','Body & InBody','Baseline, กล้ามเนื้อ และองค์ประกอบร่างกาย','body'],
    ['⚙','ตั้งค่า','Athlete baseline และ App preferences','settings']
  ];
  container.innerHTML=`${pageHeader('เพิ่มเติม','ระบบสนับสนุนที่ทำให้แผนซ้อมครบวงจร','Trail Runner Coach Control Center')}<div class="more-grid">${links.map(([icon,title,sub,route])=>`<a class="more-link" href="#/${route}"><span>${icon}</span><div><strong>${title}</strong><small style="display:block;margin-top:5px">${sub}</small></div></a>`).join('')}</div>`;
}
