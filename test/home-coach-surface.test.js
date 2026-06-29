import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderHomeCoachSurface
} from '../public/js/views/home-coach-surface.js';

const snapshot = {
  date: '2026-06-29',
  digest: 'ac1-test',
  language: 'th',
  decision: {
    actionCode: 'reduce_25',
    status: 'yellow',
    hardStop: false,
    suggestedType: 'Easy',
    suggestedDistanceKm: 6,
    suggestedVerticalM: 100,
    intensityCode: 'easy_aerobic',
    confidence: 82
  },
  readiness: { status: 'moderate' },
  pillars: {
    recovery: { status: 'watch' },
    load: { status: 'balanced' },
    energy: { status: 'good' }
  },
  race: { stage: 'build' }
};

function app(runtime = {}) {
  return {
    ui: {
      homeAiCoach: runtime
    },
    store: {
      getState() {
        return {
          settings: {
            integrations: {
              aiCoach: {
                baseUrl: 'https://worker.example',
                accessToken: 'a'.repeat(48)
              }
            }
          }
        };
      }
    }
  };
}

test('home surface keeps Local Coach decision above AI explanation', () => {
  const html = renderHomeCoachSurface({
    snapshot,
    app: app({
      explanationKey: 'not-current',
      status: 'idle'
    }),
    en: false
  });

  assert.match(html, /COACH วันนี้/);
  assert.match(html, /ลดโหลดวันนี้ประมาณ 25%/);
  assert.match(html, /Local Coach/);
  assert.match(html, /AI Coach Insight/);
});

test('loading state never removes the deterministic recommendation', () => {
  const keyMatchApp = app();
  const html = renderHomeCoachSurface({
    snapshot,
    app: keyMatchApp,
    en: false
  });

  assert.match(html, /ลดโหลดวันนี้ประมาณ 25%/);
  assert.match(html, /คำอธิบายจะอัปเดตอัตโนมัติ/);
});

test('hard stop is presented as a safety lock', () => {
  const html = renderHomeCoachSurface({
    snapshot: {
      ...snapshot,
      decision: {
        ...snapshot.decision,
        actionCode: 'rest_assess',
        status: 'red',
        hardStop: true
      }
    },
    app: app(),
    en: false
  });

  assert.match(html, /Safety Lock ทำงาน/);
  assert.match(html, /AI ไม่สามารถข้าม/);
});
