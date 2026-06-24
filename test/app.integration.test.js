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
    ['checkin', 'Daily Readiness Check'],
    ['rehab', 'Rehab & Prehab'],
    ['pain', 'Niggle / Pain Log'],
    ['nutrition', 'Nutrition & Fueling'],
    ['gear', 'Gear Checklist'],
    ['data', 'ข้อมูล & Wearables'],
    ['body', 'Body & InBody'],
    ['races', 'สนามเป้าหมาย'],
    ['settings', 'ตั้งค่า'],
    ['train', 'ฝึก'],
    ['fuel', 'อาหาร'],
    ['log', 'บันทึก']
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

  dom.window.close();
});

async function waitFor(predicate, timeoutMs = 3000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for application render.');
    await new Promise(resolvePromise => setTimeout(resolvePromise, 25));
  }
}
