import test from 'node:test';
import assert from 'node:assert/strict';
import { getLanguage, localizedField, localizedName, normalizeLanguage, translate, translateWithPhrases } from '../public/js/core/i18n.js';

test('language settings normalize safely and default to Thai', () => {
  assert.equal(normalizeLanguage('en'), 'en');
  assert.equal(normalizeLanguage('th'), 'th');
  assert.equal(normalizeLanguage('unknown'), 'th');
  assert.equal(getLanguage({ language: 'en' }), 'en');
  assert.equal(getLanguage({}), 'th');
});

test('whole Thai UI strings and dynamic patterns translate to English', () => {
  assert.equal(translate('วันนี้', 'en'), 'Today');
  assert.equal(translate('ความก้าวหน้า', 'en'), 'Progress');
  assert.equal(translate('เปิด Progress Dashboard', 'en'), 'Open Progress Dashboard');
  assert.equal(translate('สร้าง Vault ส่วนตัวสำหรับสำรองข้อมูล', 'en'), 'Create a private vault for backups');
  assert.equal(translate('10 versions บน Cloud', 'en'), '10 versions in the cloud');
  assert.equal(translate('72.5 km · +3586 m · 15 ชม.', 'en'), '72.5 km · +3586 m · 15 h');
  assert.equal(translate('0 ทำแล้ววันนี้', 'en'), '0 completed today');
  assert.equal(translate('Pain ≥6/10, เจ็บขณะเดิน, บวม, เดินผิดรูป หรืออาการเพิ่มขึ้นต่อเนื่อง ไม่ควรฝืนซ้อม', 'en'), 'Do not push training with pain ≥6/10, pain while walking, swelling, altered gait, or continuously worsening symptoms.');
  assert.equal(translate('ตรวจเสร็จ: รวมซ้ำ 2 · รอตรวจ 1', 'en'), 'Scan complete: merged 2 · review 1');
  assert.equal(translate('อาจซ้ำกับ Morning Run · ความมั่นใจ 67%', 'en'), 'May duplicate Morning Run · confidence 67%');
});

test('translation never performs unsafe partial word substitution', () => {
  const source = 'ประโยคใหม่ที่ยังไม่มีคำแปล';
  assert.equal(translateWithPhrases(source, 'en'), source);
});

test('localized data helpers prefer English fields and fall back safely', () => {
  assert.equal(localizedName({ nameTh: 'ข้าวมันไก่', nameEn: 'Chicken rice' }, 'en'), 'Chicken rice');
  assert.equal(localizedName({ nameTh: 'เมนูส่วนตัว' }, 'en'), 'เมนูส่วนตัว');
  assert.equal(localizedField({ title: { th: 'วิ่งเบา', en: 'Easy run' } }, 'en', 'title'), 'Easy run');
  assert.equal(localizedField({ title: 'วิ่งเบา' }, 'en', 'title'), 'วิ่งเบา');
});
