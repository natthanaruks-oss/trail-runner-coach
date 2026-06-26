import { getSyncState } from '../adapters/sync-manager.js';
import { getActiveRace } from '../core/races.js';
import { escapeHtml, pageHeader } from './components.js';

export function renderMore(container, state, app) {
  const en = app.language === 'en';
  const race = getActiveRace(state);
  const syncState = getSyncState(state);
  const connected = Object.values(syncState.providers).filter(item => item.connected === true).length;
  const athlete = state.settings?.athlete || {};
  const profileName = state.settings?.profile?.name || (en ? 'Trail runner' : 'นักวิ่งเทรล');

  const groups = [
    {
      title: en ? 'Health & journal' : 'สุขภาพและบันทึก',
      items: [
        ['◷', en ? 'Health journal' : 'บันทึกสุขภาพ', en ? 'Sleep, pain, weight and motivation' : 'การนอน อาการเจ็บ น้ำหนัก และแรงใจ', 'log'],
        ['↗', en ? 'Progress dashboard' : 'แดชบอร์ดความก้าวหน้า', en ? 'Trends, adherence, load and energy balance' : 'แนวโน้ม ความสม่ำเสมอ โหลด และพลังงาน', 'progress'],
        ['⚖', en ? 'Body & InBody' : 'Body & InBody', en ? 'Weight, muscle and body composition' : 'น้ำหนัก กล้ามเนื้อ และองค์ประกอบร่างกาย', 'body']
      ]
    },
    {
      title: en ? 'Devices & data' : 'อุปกรณ์และข้อมูล',
      items: [
        ['⌁', en ? 'Devices & connections' : 'อุปกรณ์และการเชื่อมต่อ', connected ? (en ? `${connected} connected sources` : `เชื่อมต่อแล้ว ${connected} แหล่ง`) : (en ? 'Connect Strava, Fitbit or Apple Health' : 'เชื่อม Strava, Fitbit หรือ Apple Health'), 'connections-home'],
        ['⇅', en ? 'Data hub' : 'ศูนย์ข้อมูล', en ? 'Import, export and activity integrity' : 'นำเข้า ส่งออก และตรวจข้อมูลกิจกรรม', 'data'],
        ['▣', en ? 'Encrypted backup' : 'สำรองข้อมูลแบบเข้ารหัส', en ? 'Protect and restore your local data' : 'ปกป้องและกู้คืนข้อมูลในเครื่อง', 'cloud-backup']
      ]
    },
    {
      title: en ? 'Race & preparation' : 'การแข่งขันและการเตรียมตัว',
      items: [
        ['🏁', en ? 'Target races' : 'สนามเป้าหมาย', race ? race.name : (en ? 'Choose a race and build a plan' : 'เลือกสนามและสร้างแผนซ้อม'), 'races'],
        ['🎒', en ? 'Gear checklist' : 'รายการอุปกรณ์', en ? 'Race, night and self-supported gear' : 'อุปกรณ์แข่ง กลางคืน และพึ่งพาตัวเอง', 'gear'],
        ['◉', en ? 'Nutrition guide' : 'แนวทางโภชนาการ', en ? 'Fueling guidelines and race timeline' : 'แนวทางเติมพลังและ Timeline วันแข่ง', 'nutrition']
      ]
    },
    {
      title: en ? 'App' : 'แอป',
      items: [
        ['⚙', en ? 'Settings' : 'ตั้งค่า', en ? 'Athlete baseline, language and preferences' : 'ข้อมูลพื้นฐาน ภาษา และค่าการใช้งาน', 'settings'],
        ['♡', en ? 'Why I run' : 'ทำไมฉันถึงวิ่ง', en ? 'Your reason for the difficult days' : 'เหตุผลที่ต้องกลับมาอ่านในวันที่เหนื่อย', 'motivation']
      ]
    }
  ];

  container.innerHTML = `
    ${pageHeader(en ? 'More' : 'เพิ่มเติม', en ? 'Everything outside the daily training flow, organized in one place.' : 'ทุกอย่างที่อยู่นอกการใช้งานประจำวัน จัดเป็นหมวดให้หาได้ง่าย', 'CONTROL CENTER')}

    <section class="more-profile-card card flat">
      <div class="profile-avatar" aria-hidden="true">${escapeHtml(profileName.slice(0, 1).toUpperCase())}</div>
      <div class="grow"><h2>${escapeHtml(profileName)}</h2><p>${race ? escapeHtml(race.name) : (en ? 'No active race selected' : 'ยังไม่ได้เลือกสนามหลัก')}</p></div>
      <div class="profile-mini-stat"><strong>${connected}</strong><span>${en ? 'sources' : 'แหล่งข้อมูล'}</span></div>
    </section>

    ${groups.map(group => `<section class="settings-section section">
      <div class="settings-section-title">${escapeHtml(group.title)}</div>
      <div class="settings-group">
        ${group.items.map(([icon, title, detail, route]) => settingsRow(icon, title, detail, route)).join('')}
      </div>
    </section>`).join('')}

    <section class="app-mode-note section">
      <strong>${en ? 'App mode' : 'โหมดแอป'}</strong>
      <span>${isStandalone() ? (en ? 'Running as an installed app' : 'กำลังเปิดแบบแอปเต็มหน้าจอ') : (en ? 'Add to Home Screen for a full-screen experience' : 'เพิ่มไว้ที่หน้าจอหลักเพื่อเปิดแบบเต็มหน้าจอ')}</span>
    </section>`;
}

function settingsRow(icon, title, detail, route) {
  return `<a class="settings-row" href="#/${route}">
    <span class="settings-row-icon" aria-hidden="true">${escapeHtml(icon)}</span>
    <span class="settings-row-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></span>
    <span class="settings-row-chevron" aria-hidden="true">›</span>
  </a>`;
}

function isStandalone() {
  return Boolean(globalThis.matchMedia?.('(display-mode: standalone)').matches || globalThis.navigator?.standalone);
}
