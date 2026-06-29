import {
  buildAiCoachExplanationKey,
  getHomeCoachRuntime,
  scheduleHomeCoachExplanation
} from '../core/home-coach-runtime.js';
import {
  isAiCoachConfigured
} from '../adapters/ai-coach.js';
import {
  escapeHtml,
  formatNumber
} from './components.js';

export function renderHomeCoachSurface({
  snapshot,
  app,
  en = false
}) {
  const configured = isAiCoachConfigured(
    app.store.getState().settings
  );
  const runtime = getHomeCoachRuntime(app, snapshot);
  const decision = snapshot.decision || {};
  const explanation = runtime.result?.explanation || null;
  const status = String(decision.status || 'green');
  const action = actionCopy(decision.actionCode, en);
  const session = sessionText(decision, en);
  const changedText = runtime.staleData
    ? en
      ? 'Recommendation unchanged after the latest data update'
      : 'คำแนะนำยังคงเดิมหลังข้อมูลล่าสุดอัปเดต'
    : '';

  return `
    <section
      class="home-coach-surface home-coach-${escapeHtml(status)}"
      data-home-coach
      data-explanation-key="${escapeHtml(
        buildAiCoachExplanationKey(snapshot)
      )}"
    >
      <div class="home-coach-head">
        <div>
          <span class="home-coach-kicker">
            ${en ? 'TODAY’S COACH' : 'COACH วันนี้'}
          </span>
          <h2>${escapeHtml(action.title)}</h2>
        </div>
        <span class="status ${escapeHtml(status)}">
          ${escapeHtml(statusLabel(status, en))}
        </span>
      </div>

      <div class="home-coach-session">
        <strong>${escapeHtml(session)}</strong>
        <small>
          ${en ? 'Local Coach decision' : 'คำตัดสินจาก Local Coach'}
          · ${Number(decision.confidence || 0)}%
        </small>
      </div>

      ${
        decision.hardStop
          ? `
            <div class="home-coach-safety">
              <strong>
                ${en ? 'Safety Lock active' : 'Safety Lock ทำงาน'}
              </strong>
              <span>
                ${
                  en
                    ? 'AI cannot override pain or symptom protection.'
                    : 'AI ไม่สามารถข้าม Pain หรือการป้องกันอาการผิดปกติได้'
                }
              </span>
            </div>
          `
          : ''
      }

      <div class="home-ai-insight" aria-live="polite">
        <div class="home-ai-insight-title">
          <span aria-hidden="true">✦</span>
          <strong>
            ${en ? 'AI Coach Insight' : 'AI Coach Insight'}
          </strong>
        </div>

        ${renderInsightBody({
          configured,
          runtime,
          explanation,
          changedText,
          en
        })}
      </div>

      <div class="home-coach-actions">
        <button
          class="button secondary"
          type="button"
          data-home-coach-checkin
        >
          ${en ? 'Adjust readiness' : 'ปรับ Readiness'}
        </button>

        <button
          class="button secondary"
          type="button"
          data-home-coach-open
        >
          ${en ? 'View full coach' : 'ดู Coach แบบเต็ม'}
        </button>

        ${
          configured
            ? `
              <button
                class="home-coach-text-button"
                type="button"
                data-home-coach-refresh
              >
                ${
                  runtime.status === 'loading' ||
                  runtime.status === 'scheduled'
                    ? en
                      ? 'Updating…'
                      : 'กำลังอัปเดต…'
                    : en
                      ? 'Refresh AI'
                      : 'อัปเดต AI'
                }
              </button>
            `
            : ''
        }
      </div>
    </section>
  `;
}

export function bindHomeCoachSurface({
  container,
  app,
  snapshot
}) {
  const root = container.querySelector('[data-home-coach]');
  if (!root) return;

  root
    .querySelector('[data-home-coach-checkin]')
    ?.addEventListener('click', () => app.navigate('checkin'));

  root
    .querySelector('[data-home-coach-open]')
    ?.addEventListener('click', () => app.navigate('ai-coach'));

  root
    .querySelector('[data-home-coach-refresh]')
    ?.addEventListener('click', () => {
      scheduleHomeCoachExplanation({
        app,
        snapshot,
        force: true,
        delayMs: 0
      });
      app.render();
    });

  root
    .querySelector('[data-home-coach-toggle]')
    ?.addEventListener('click', event => {
      const details = root.querySelector(
        '[data-home-coach-details]'
      );
      if (!details) return;

      const expanded =
        event.currentTarget.getAttribute('aria-expanded') ===
        'true';

      event.currentTarget.setAttribute(
        'aria-expanded',
        String(!expanded)
      );
      details.hidden = expanded;
    });

  queueMicrotask(() => {
    scheduleHomeCoachExplanation({
      app,
      snapshot
    });
  });
}

function renderInsightBody({
  configured,
  runtime,
  explanation,
  changedText,
  en
}) {
  if (!configured) {
    return `
      <p>
        ${
          en
            ? 'Connect the AI Coach Worker to add an explanation layer.'
            : 'เชื่อม AI Coach Worker เพื่อเพิ่มคำอธิบายอัตโนมัติ'
        }
      </p>
      <a class="home-coach-inline-link" href="#/ai-coach">
        ${en ? 'Set up AI Coach' : 'ตั้งค่า AI Coach'}
      </a>
    `;
  }

  if (
    runtime.status === 'loading' ||
    runtime.status === 'scheduled'
  ) {
    return `
      <div class="home-ai-loading">
        <span class="home-ai-pulse" aria-hidden="true"></span>
        <p>
          ${
            en
              ? 'Explaining the latest recommendation…'
              : 'กำลังอธิบายคำแนะนำล่าสุด…'
          }
        </p>
      </div>
    `;
  }

  if (runtime.status === 'error') {
    return `
      <p class="home-ai-error">
        ${escapeHtml(runtime.error)}
      </p>
      <p class="home-ai-supporting">
        ${
          en
            ? 'The Local Coach recommendation above remains active.'
            : 'คำแนะนำจาก Local Coach ด้านบนยังคงใช้งานได้ตามปกติ'
        }
      </p>
    `;
  }

  if (!explanation) {
    return `
      <p>
        ${
          en
            ? 'The explanation will update automatically when the recommendation changes.'
            : 'คำอธิบายจะอัปเดตอัตโนมัติเมื่อคำแนะนำเปลี่ยน'
        }
      </p>
    `;
  }

  return `
    <h3>${escapeHtml(explanation.headline)}</h3>
    <p>${escapeHtml(explanation.summary)}</p>

    ${
      changedText
        ? `
          <p class="home-ai-unchanged">
            ${escapeHtml(changedText)}
          </p>
        `
        : ''
    }

    <button
      class="home-coach-inline-link"
      type="button"
      data-home-coach-toggle
      aria-expanded="false"
    >
      ${en ? 'Why this recommendation' : 'ทำไมจึงแนะนำแบบนี้'}
    </button>

    <div
      class="home-ai-details"
      data-home-coach-details
      hidden
    >
      <strong>
        ${en ? 'What to do today' : 'สิ่งที่ควรทำวันนี้'}
      </strong>
      <p>${escapeHtml(explanation.todayPlan)}</p>

      ${
        explanation.why?.length
          ? `
            <strong>${en ? 'Why' : 'เหตุผล'}</strong>
            <ul>
              ${explanation.why
                .map(value => `<li>${escapeHtml(value)}</li>`)
                .join('')}
            </ul>
          `
          : ''
      }

      ${
        explanation.watchFor?.length
          ? `
            <strong>
              ${en ? 'Watch for' : 'สิ่งที่ต้องเฝ้าระวัง'}
            </strong>
            <ul>
              ${explanation.watchFor
                .map(value => `<li>${escapeHtml(value)}</li>`)
                .join('')}
            </ul>
          `
          : ''
      }

      ${
        explanation.checkAfter
          ? `
            <strong>
              ${en ? 'Check again' : 'ประเมินซ้ำ'}
            </strong>
            <p>${escapeHtml(explanation.checkAfter)}</p>
          `
          : ''
      }
    </div>
  `;
}

function sessionText(decision, en) {
  const type = decision.suggestedType || (en ? 'Rest' : 'พัก');
  const parts = [type];

  if (decision.suggestedDistanceKm != null) {
    parts.push(
      `${formatNumber(decision.suggestedDistanceKm, 1)} km`
    );
  }

  if (decision.suggestedVerticalM != null) {
    parts.push(`+${formatNumber(decision.suggestedVerticalM)} m`);
  }

  return parts.join(' · ');
}

function statusLabel(status, en) {
  const labels = {
    green: en ? 'READY' : 'พร้อม',
    yellow: en ? 'ADJUST' : 'ปรับแผน',
    red: en ? 'STOP / REST' : 'พัก / หยุด'
  };

  return labels[status] || labels.green;
}

function actionCopy(actionCode, en) {
  const map = {
    rest_assess: {
      title: en
        ? 'Rest and assess symptoms'
        : 'พักและประเมินอาการ'
    },
    replace_easy_or_rest: {
      title: en
        ? 'Use recovery work or rest'
        : 'Recovery เบามากหรือพัก'
    },
    check_in_first: {
      title: en
        ? 'Complete check-in first'
        : 'ทำ Check-in ก่อน'
    },
    replace_with_easy: {
      title: en
        ? 'Replace with easy work'
        : 'เปลี่ยนเป็น Easy'
    },
    reduce_25: {
      title: en
        ? 'Reduce today by about 25%'
        : 'ลดโหลดวันนี้ประมาณ 25%'
    },
    reduce_15: {
      title: en
        ? 'Reduce today by about 15%'
        : 'ลดโหลดวันนี้ประมาณ 15%'
    },
    cap_long_run: {
      title: en
        ? 'Shorten the long run'
        : 'ลด Long Run'
    },
    taper_quality: {
      title: en
        ? 'Keep quality short'
        : 'รักษา Quality ให้สั้น'
    },
    follow_plan: {
      title: en
        ? 'Follow the planned session'
        : 'ทำตามแผนได้'
    }
  };

  return map[actionCode] || map.follow_plan;
}
