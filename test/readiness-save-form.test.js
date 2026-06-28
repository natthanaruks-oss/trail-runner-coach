import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { fieldNumber } from '../public/js/views/components.js';

test('readiness objective inputs accept synced decimal precision such as 5.35 hours', () => {
  const dom = new JSDOM(`<form id="form">
    ${fieldNumber({ name: 'sleepHours', label: 'Sleep', value: 5.35, min: 0, max: 14, step: 'any' })}
    ${fieldNumber({ name: 'restingHr', label: 'RHR', value: 52.45, min: 30, max: 150, step: 'any' })}
    ${fieldNumber({ name: 'hrvMs', label: 'HRV', value: 41.75, min: 1, max: 300, step: 'any' })}
    <button type="submit">Save</button>
  </form>`);
  assert.equal(dom.window.document.querySelector('#form').checkValidity(), true);
});

test('Daily Readiness form uses precision-safe objective inputs and reveals hidden invalid fields', async () => {
  const source = await readFile(new URL('../public/js/views/checkin.js', import.meta.url), 'utf8');
  assert.match(source, /name:'sleepHours'[\s\S]{0,180}step:'any'/);
  assert.match(source, /name:'restingHr'[\s\S]{0,180}step:'any'/);
  assert.match(source, /name:'hrvMs'[\s\S]{0,180}step:'any'/);
  assert.match(source, /addEventListener\('invalid'[\s\S]{0,240}details\.open\s*=\s*true/);
  assert.match(source, /checkinForm\.addEventListener\('submit'/);
});
