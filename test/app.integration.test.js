import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

test('application initializes the multi-race IndexedDB model and renders primary routes', async () => {
  const html = await readFile(resolve('public/index.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://trail-runner-coach.test/#/today',
    pretendToBeVisual: true
  });

  const browserGlobals = [
    'window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage',
    'HTMLElement', 'HTMLDialogElement', 'Element', 'Node', 'Event', 'CustomEvent',
    'FormData', 'DOMParser', 'File', 'Blob'
  ];
  for (const key of browserGlobals) {
    Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
  }
  Object.defineProperty(globalThis, 'confirm', { value: () => true, configurable: true, writable: true });
  dom.window.scrollTo = () => {};
  if (!dom.window.HTMLDialogElement.prototype.showModal) {
    dom.window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
    dom.window.HTMLDialogElement.prototype.close = function close() { this.open = false; };
  }

  const appUrl = `${pathToFileURL(resolve('public/js/app.js')).href}?integration=${Date.now()}`;
  await import(appUrl);

  await waitFor(() => dom.window.document.querySelector('h1')?.textContent.includes('วันนี้'));
  assert.match(dom.window.document.querySelector('h1').textContent, /วันนี้/);
  assert.ok(dom.window.document.body.textContent.includes('RTC 70'));
  assert.ok(dom.window.document.body.textContent.includes('Strain'));

  for (const [route, expected] of [
    ['plan', 'แผนซ้อม'],
    ['scores', 'Strain & Recovery'],
    ['health', 'สุขภาพและการฟื้นตัว'],
    ['progress', 'แดชบอร์ดความก้าวหน้า'],
    ['checkin', 'Daily Readiness Check'],
    ['rehab', 'Rehab & Prehab'],
    ['pain', 'Niggle / Pain Log'],
    ['nutrition', 'Nutrition & Fueling'],
    ['gear', 'Gear Checklist'],
    ['data', 'ข้อมูล & Wearables'],
    ['connections-home', 'อุปกรณ์และการเชื่อมต่อ'],
    ['connections', 'การเชื่อมต่อ'],
    ['cloud-backup', 'Encrypted Cloud Backup'],
    ['body', 'Body & InBody'],
    ['races', 'สนามเป้าหมาย'],
    ['settings', 'ตั้งค่า'],
    ['train', 'ฝึก'],
    ['fuel', 'อาหาร'],
    ['log', 'บันทึก'],
    ['more', 'เพิ่มเติม']
  ]) {
    dom.window.location.hash = `#/${route}`;
    dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
    await waitFor(() => dom.window.document.querySelector('h1')?.textContent.includes(expected));
    assert.ok(dom.window.document.querySelector('h1').textContent.includes(expected));
  }

  dom.window.location.hash = '#/races';
  dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
  await waitFor(() => dom.window.document.querySelector('#race-form'));
  const raceForm = dom.window.document.querySelector('#race-form');
  raceForm.querySelector('[name="name"]').value = 'Future 50K';
  raceForm.querySelector('[name="date"]').value = '2027-02-14';
  raceForm.querySelector('[name="distanceKm"]').value = '50';
  raceForm.querySelector('[name="elevationGainM"]').value = '2800';
  raceForm.querySelector('[name="elevationLossM"]').value = '2700';
  raceForm.querySelector('[name="cutoffHours"]').value = '12';
  raceForm.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => dom.window.document.body.textContent.includes('Future 50K'));
  dom.window.location.hash = '#/plan';
  dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
  await waitFor(() => dom.window.document.querySelector('h1')?.textContent.includes('แผนซ้อม'));
  assert.ok(dom.window.document.body.textContent.includes('Future 50K'));

  dom.window.location.hash = '#/fuel';
  dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
  await waitFor(() => dom.window.document.querySelector('[data-action="add-food"]'));
  dom.window.document.querySelector('[data-action="add-food"]').click();
  await waitFor(() => dom.window.document.querySelector('[data-food-category="custom"]'));
  dom.window.document.querySelector('[data-food-category="custom"]').click();
  await waitFor(() => dom.window.document.querySelector('#custom-food-form'));
  const foodForm = dom.window.document.querySelector('#custom-food-form');
  foodForm.querySelector('[name="nameTh"]').value = 'อาหารทดสอบ';
  foodForm.querySelector('[name="kcal"]').value = '350';
  foodForm.querySelector('[name="proteinG"]').value = '25';
  foodForm.querySelector('[name="carbG"]').value = '40';
  foodForm.querySelector('[name="fatG"]').value = '10';
  foodForm.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => dom.window.document.body.textContent.includes('อาหารทดสอบ'));
  assert.ok(dom.window.document.body.textContent.includes('350 kcal'));
  const completeCheckbox = dom.window.document.querySelector('[data-food-complete]');
  completeCheckbox.checked = true;
  completeCheckbox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

  // Bundled food records remain editable without mutating the source catalog, and hidden records can be restored.
  dom.window.document.querySelector('[data-action="add-food"]').click();
  await waitFor(() => dom.window.document.querySelector('[data-food-category="meal"]'));
  dom.window.document.querySelector('[data-food-category="meal"]').click();
  await waitFor(() => dom.window.document.querySelector('[data-edit-food-base]'));
  const baseFoodId = dom.window.document.querySelector('[data-edit-food-base]').dataset.editFoodBase;
  dom.window.document.querySelector('[data-edit-food-base]').click();
  await waitFor(() => dom.window.document.querySelector('#food-base-edit'));
  dom.window.document.querySelector('#food-base-edit [name="kcal"]').value = '601';
  dom.window.document.querySelector('#food-base-edit').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => !dom.window.document.querySelector('#food-base-edit'));
  dom.window.document.querySelector('[data-action="add-food"]').click();
  await waitFor(() => dom.window.document.querySelector('[data-food-category="meal"]'));
  dom.window.document.querySelector('[data-food-category="meal"]').click();
  await waitFor(() => dom.window.document.querySelector(`[data-edit-food-base="${baseFoodId}"]`));
  dom.window.document.querySelector(`[data-edit-food-base="${baseFoodId}"]`).click();
  await waitFor(() => dom.window.document.querySelector('#food-base-edit'));
  assert.equal(dom.window.document.querySelector('#food-base-edit [name="kcal"]').value, '601');
  dom.window.document.querySelector('[data-delete-food-base]').click();
  await waitFor(() => !dom.window.document.querySelector('#food-base-edit'));
  dom.window.document.querySelector('[data-action="add-food"]').click();
  await waitFor(() => dom.window.document.querySelector('[data-food-category="custom"]'));
  dom.window.document.querySelector('[data-food-category="custom"]').click();
  await waitFor(() => dom.window.document.querySelector(`[data-restore-hidden-food="${baseFoodId}"]`));
  dom.window.document.querySelector(`[data-restore-hidden-food="${baseFoodId}"]`).click();

  dom.window.location.hash = '#/checkin';
  dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
  await waitFor(() => dom.window.document.querySelector('#checkin-form'));
  dom.window.document.querySelector('[name="sleepHours"]').value = '8';
  dom.window.document.querySelector('[name="restingHr"]').value = '55';
  dom.window.document.querySelector('[name="painAchilles"]').value = '6';
  dom.window.document.querySelector('#checkin-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => dom.window.document.querySelector('#checkin-result .metric')?.textContent.includes('/100'));
  assert.ok(dom.window.document.querySelector('#checkin-result').textContent.includes('พักและประเมินอาการ'));

  dom.window.location.hash = '#/scores';
  dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
  await waitFor(() => dom.window.document.querySelector('#calibration-feedback-form'));
  assert.ok(dom.window.document.body.textContent.includes('Personal Score Calibration'));
  dom.window.document.querySelector('[name="actualReadiness"][value="2"]').checked = true;
  dom.window.document.querySelector('[name="perceivedStrain"]').value = '9.5';
  dom.window.document.querySelector('#calibration-feedback-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => dom.window.document.querySelector('[data-edit-calibration-date]'));
  assert.ok(dom.window.document.querySelector('[data-edit-calibration-date]').closest('.list-item').textContent.includes('35/100'));

  // Thai/English switch updates the shell, routes and persists through Settings.
  dom.window.document.querySelector('#language-toggle').click();
  await waitFor(() => dom.window.document.documentElement.lang === 'en');
  await waitFor(() => dom.window.document.querySelector('[data-route="today"] small')?.textContent === 'Today');
  assert.equal(dom.window.document.querySelector('[data-route="plan"] small').textContent, 'Plan');
  assert.equal(dom.window.document.querySelector('[data-route="train"] small').textContent, 'Train');
  assert.equal(dom.window.document.querySelector('[data-route="fuel"] small').textContent, 'Food');
  assert.equal(dom.window.document.querySelector('[data-route="more"] small').textContent, 'More');

  dom.window.location.hash = '#/plan';
  dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
  await waitFor(() => dom.window.document.querySelector('h1')?.textContent.includes('Training Plan'));
  assert.ok(!/[฀-๿]/.test(dom.window.document.querySelector('#view').textContent));

  dom.window.location.hash = '#/scores';
  dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
  await waitFor(() => dom.window.document.body.textContent.includes('Personal Score Calibration'));
  assert.ok(dom.window.document.body.textContent.includes('Learn from how your body actually feels'));
  assert.ok(!/[฀-๿]/.test(dom.window.document.querySelector('#view').textContent));

  dom.window.location.hash = '#/progress';
  dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
  await waitFor(() => dom.window.document.querySelector('h1')?.textContent.includes('Progress Dashboard'));
  assert.ok(dom.window.document.body.textContent.includes('Actual vs planned distance'));
  assert.ok(dom.window.document.body.textContent.includes('Consistency and data quality'));
  assert.ok(!/[฀-๿]/.test(dom.window.document.querySelector('#view').textContent));

  dom.window.location.hash = '#/connections';
  dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
  await waitFor(() => dom.window.document.body.textContent.includes('Strava Setup Wizard'));
  assert.ok(dom.window.document.body.textContent.includes('Run one automatic setup command'));
  assert.ok(dom.window.document.body.textContent.includes('npm run setup:strava'));
  assert.ok(dom.window.document.body.textContent.includes('Auto Sync & Retry'));
  assert.ok(dom.window.document.body.textContent.includes('Sync all connected providers'));
  assert.ok(dom.window.document.body.textContent.includes('The retry queue is clear'));
  assert.ok(!/[฀-๿]/.test(dom.window.document.querySelector('#view').textContent));

  dom.window.location.hash = '#/apple-health-shortcut';
  dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
  await waitFor(() => dom.window.document.querySelector('h1')?.textContent.includes('Apple Health Sync'));
  assert.ok(dom.window.document.body.textContent.includes('npm run setup:apple-health-shortcut'));
  assert.ok(dom.window.document.body.textContent.includes('Configure Health Auto Export'));
  assert.ok(!/[฀-๿]/.test(dom.window.document.querySelector('#view').textContent));

  dom.window.location.hash = '#/data';
  dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
  await waitFor(() => dom.window.document.body.textContent.includes('Activity Integrity'));
  assert.ok(dom.window.document.body.textContent.includes('Cross-provider deduplication'));
  assert.ok(!/[฀-๿]/.test(dom.window.document.querySelector('#view').textContent));

  dom.window.location.hash = '#/cloud-backup';
  dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
  await waitFor(() => dom.window.document.querySelector('h1')?.textContent.includes('Encrypted Cloud Backup'));
  assert.ok(dom.window.document.body.textContent.includes('Create a private vault for backups'));
  assert.ok(dom.window.document.body.textContent.includes('npm run setup:backup'));
  assert.ok(!/[฀-๿]/.test(dom.window.document.querySelector('#view').textContent));

  dom.window.location.hash = '#/settings';
  dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
  await waitFor(() => dom.window.document.querySelector('#settings-form [name="language"]'));
  assert.equal(dom.window.document.querySelector('#settings-form [name="language"]').value, 'en');

  dom.window.document.querySelector('#language-toggle').click();
  await waitFor(() => dom.window.document.documentElement.lang === 'th');
  await waitFor(() => dom.window.document.querySelector('[data-route="today"] small')?.textContent === 'วันนี้');

  dom.window.close();
});

async function waitFor(predicate, timeoutMs = 7000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for application render.');
    await new Promise(resolvePromise => setTimeout(resolvePromise, 25));
  }
}
