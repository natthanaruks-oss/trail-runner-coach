import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHttpsUrl,
  validateAiCoachPayload
} from '../public/js/adapters/ai-coach.js';

const snapshot = {
  digest: 'ac1-test0001',
  decision: {
    actionCode: 'reduce_25',
    status: 'yellow',
    hardStop: false
  }
};

function payload(overrides = {}) {
  return {
    version: 'ai_coach_explanation_v1',
    model: 'gpt-5.4-mini',
    generatedAt: '2026-06-29T00:00:00.000Z',
    explanation: {
      actionCodeEcho: 'reduce_25',
      statusEcho: 'yellow',
      safetyLockEcho: false,
      headline: 'ลดโหลดวันนี้',
      summary: 'ระบบแนะนำให้ลดโหลดตามคำตัดสินเดิม',
      todayPlan: 'Easy 4 km',
      why: ['Training load เพิ่มเร็ว'],
      watchFor: ['Pain'],
      checkAfter: 'ประเมินอีกครั้งหลัง 10 นาที',
      safetyNote: 'หยุดหากมีอาการผิดปกติ',
      ...overrides
    }
  };
}

test('AI explanation is accepted only when it echoes the Local Coach decision', () => {
  const result = validateAiCoachPayload(payload(), snapshot);
  assert.equal(result.explanation.actionCodeEcho, 'reduce_25');
  assert.equal(result.explanation.statusEcho, 'yellow');
});

test('AI explanation is rejected when it changes the Local Coach action', () => {
  assert.throws(
    () =>
      validateAiCoachPayload(
        payload({ actionCodeEcho: 'follow_plan' }),
        snapshot
      ),
    /พยายามเปลี่ยนคำตัดสิน/
  );
});

test('AI explanation is rejected when it changes the safety lock', () => {
  assert.throws(
    () =>
      validateAiCoachPayload(
        payload({ safetyLockEcho: true }),
        snapshot
      ),
    /Safety Lock/
  );
});

test('AI Worker URL must use HTTPS', () => {
  assert.equal(
    normalizeHttpsUrl('https://coach.example.workers.dev/path'),
    'https://coach.example.workers.dev'
  );
  assert.throws(() => normalizeHttpsUrl('http://coach.example.com'), /HTTPS/);
});
