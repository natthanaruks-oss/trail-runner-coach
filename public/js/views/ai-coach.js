import {
  selectRaceCountdown,
  selectScoreHistory,
  selectToday,
  selectWeekSummary
} from '../core/selectors.js';
import { selectAppleHealthInsights } from '../core/health-insights.js';
import { buildUnifiedInsights } from '../core/unified-insights.js';
import { buildPersonalTrends } from '../core/personal-trends.js';
import { buildTrailCoachIntelligence } from '../core/trail-coach.js';
import { energyBalanceForDate, nutritionTarget } from '../core/nutrition.js';
import { buildAiCoachSnapshot } from '../core/ai-coach-snapshot.js';
import {
  clearAiCoachCache,
  getAiCoachConfig,
  isAiCoachConfigured,
  normalizeHttpsUrl,
  requestAiCoachExplanation
} from '../adapters/ai-coach.js';
import { escapeHtml, formatNumber, pageHeader } from './components.js';
import { nowIso } from '../core/date.js';

export function renderAiCoach(container, state, app) {
  const today = selectToday(state);
  const countdown = selectRaceCountdown(state);
  const week = selectWeekSummary(state, today.plan.weekSessions);
  const health = selectAppleHealthInsights(state, today.dateKey, 90);
  const scoreHistory = selectScoreHistory(state, 7, today.dateKey);
  const nutritionBalance = energyBalanceForDate(state, today.dateKey);
  const nutritionPlan = nutritionTarget(state, today.dateKey);
  const unified = buildUnifiedInsights({
    today,
    health,
    scoreHistory,
    nutritionBalance,
    nutritionTarget: nutritionPlan
  });
  const personalTrends = buildPersonalTrends({
    healthRows: health.rows,
    activities: state.activities,
    endDateKey: today.dateKey,
    rangeDays: 90,
    sleepTargetHours: 7.5
  });
  const trailCoach = buildTrailCoachIntelligence({
    state,
    today,
    unified,
    personalTrends,
    week,
    countdown,
    endDateKey: today.dateKey
  });
  const en = app.language === 'en';
  const snapshot = buildAiCoachSnapshot({
    today,
    unified,
    trailCoach,
    personalTrends,
    countdown,
    language: app.language
  });
  const configured = isAiCoachConfigured(state.settings);
  const config = getAiCoachConfig(state.settings);
  const runtime = app.ui.aiCoach || {};
  const result =
    runtime.snapshotDigest === snapshot.digest ? runtime.result || null : null;
  const error =
    runtime.snapshotDigest === snapshot.digest ? runtime.error || '' : '';

  container.innerHTML = `
    ${pageHeader(
      en ? 'AI Coach' : 'AI Coach',
      en
        ? 'The Local Coach decides. AI explains the decision in practical language.'
        : 'Local Coach เป็นผู้ตัดสิน ส่วน AI ช่วยอธิบายให้เป็นภาษาที่นำไปใช้ได้จริง',
      'CONTROLLED AI LAYER'
    )}

    <section class="section">
      <div class="section-head">
        <div>
          <h2>${en ? 'Local decision — source of truth' : 'คำตัดสินจาก Local Coach — ข้อมูลหลัก'}</h2>
          <small>${en ? 'AI cannot change this decision.' : 'AI ไม่มีสิทธิ์เปลี่ยนคำตัดสินส่วนนี้'}</small>
        </div>
        <span class="badge">${escapeHtml(snapshot.decision.status.toUpperCase())}</span>
      </div>

      <article class="card">
        <div class="card-title">${en ? 'Today' : 'วันนี้'}</div>
        <h3>${escapeHtml(actionTitle(snapshot.decision.actionCode, en))}</h3>
        <div class="submetric">
          ${escapeHtml(snapshot.decision.suggestedType)}
          ${snapshot.decision.suggestedDistanceKm != null ? ` · ${formatNumber(snapshot.decision.suggestedDistanceKm, 1)} km` : ''}
          ${snapshot.decision.suggestedVerticalM != null ? ` · +${formatNumber(snapshot.decision.suggestedVerticalM)} m` : ''}
        </div>
        <div class="submetric">
          ${en ? 'Local confidence' : 'ความมั่นใจ Local Coach'} ${snapshot.decision.confidence}%
          · ${en ? 'Action code' : 'รหัสคำตัดสิน'} ${escapeHtml(snapshot.decision.actionCode)}
        </div>
        ${snapshot.decision.hardStop ? `
          <div class="alert risk" style="margin-top:12px">
            ${en
              ? 'Safety lock is active. AI cannot override pain or symptom protection.'
              : 'Safety Lock ทำงานอยู่ AI ไม่สามารถข้าม Pain หรือการป้องกันอาการผิดปกติได้'}
          </div>
        ` : ''}
      </article>
    </section>

    ${configured
      ? configuredView({ en, config, result, error, snapshot })
      : setupView({ en, config })}

    <section class="section">
      <article class="card flat">
        <div class="card-title">${en ? 'Privacy boundary' : 'ขอบเขตข้อมูลที่ส่ง'}</div>
        <p>
          ${en
            ? 'Only summarized scores, the planned session and the deterministic decision are sent. Raw health rows, name, email and API keys are not included.'
            : 'ส่งเฉพาะคะแนนสรุป แผนซ้อม และคำตัดสินจากระบบ ไม่ส่ง Raw Health Rows ชื่อ อีเมล หรือ API Key'}
        </p>
        <a href="#/coach">${en ? 'Back to Trail Coach evidence' : 'กลับไปดูหลักฐานใน Trail Coach'}</a>
      </article>
    </section>
  `;

  bindAiCoachActions(container, state, app, snapshot);
}

function configuredView({ en, config, result, error, snapshot }) {
  return `
    <section class="section">
      <div class="section-head">
        <div>
          <h2>${en ? 'AI explanation' : 'คำอธิบายจาก AI'}</h2>
          <small>${escapeHtml(config.baseUrl)}</small>
        </div>
        <button class="button secondary" type="button" data-ai-config>
          ${en ? 'Settings' : 'ตั้งค่า'}
        </button>
      </div>

      ${error ? `<div class="alert risk">${escapeHtml(error)}</div>` : ''}

      ${result ? renderExplanation(result.explanation, en) : `
        <article class="card">
          <h3>${en ? 'Ask for today’s explanation' : 'ขอคำอธิบายสำหรับวันนี้'}</h3>
          <p>
            ${en
              ? 'AI will explain the Local Coach decision. It cannot alter distance, vertical, intensity or safety gates.'
              : 'AI จะอธิบายคำตัดสินของ Local Coach และไม่สามารถเปลี่ยนระยะ Vertical ความหนัก หรือ Safety Gate'}
          </p>
          <div class="button-row">
            <button class="button primary" type="button" data-ai-ask>
              ${en ? 'Ask AI Coach' : 'ถาม AI Coach'}
            </button>
            <button class="button secondary" type="button" data-ai-force>
              ${en ? 'Refresh explanation' : 'สร้างคำอธิบายใหม่'}
            </button>
          </div>
          <div class="submetric" style="margin-top:10px">
            Snapshot ${escapeHtml(snapshot.digest)}
          </div>
        </article>
      `}
    </section>
  `;
}

function renderExplanation(item, en) {
  return `
    <article class="card" data-ai-coach-result>
      <div class="card-title">${en ? 'AI explanation — not a new decision' : 'คำอธิบายจาก AI — ไม่ใช่คำตัดสินใหม่'}</div>
      <h3>${escapeHtml(item.headline)}</h3>
      <p>${escapeHtml(item.summary)}</p>

      <div class="card flat">
        <div class="card-title">${en ? 'What to do today' : 'สิ่งที่ควรทำวันนี้'}</div>
        <strong>${escapeHtml(item.todayPlan)}</strong>
      </div>

      ${item.why.length ? `
        <div style="margin-top:14px">
          <div class="card-title">${en ? 'Why' : 'เหตุผล'}</div>
          <ul class="clean-list">
            ${item.why.map(value => `<li>${escapeHtml(value)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      ${item.watchFor.length ? `
        <div style="margin-top:14px">
          <div class="card-title">${en ? 'Watch for' : 'สิ่งที่ต้องเฝ้าระวัง'}</div>
          <ul class="clean-list">
            ${item.watchFor.map(value => `<li>${escapeHtml(value)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      <div style="margin-top:14px">
        <div class="card-title">${en ? 'Check again' : 'ประเมินซ้ำ'}</div>
        <p>${escapeHtml(item.checkAfter)}</p>
      </div>

      <div class="alert" style="margin-top:14px">
        ${escapeHtml(item.safetyNote)}
      </div>

      <div class="button-row" style="margin-top:14px">
        <button class="button secondary" type="button" data-ai-force>
          ${en ? 'Generate again' : 'สร้างใหม่'}
        </button>
      </div>
    </article>
  `;
}

function setupView({ en, config }) {
  return `
    <section class="section">
      <article class="card">
        <h2>${en ? 'Connect AI Coach Worker' : 'เชื่อม AI Coach Worker'}</h2>
        <p>
          ${en
            ? 'Run the setup wizard in Codespaces, then import the local receipt or paste the Worker URL and access token.'
            : 'รัน Setup Wizard ใน Codespaces แล้วนำเข้าไฟล์ Receipt หรือวาง Worker URL และ Access Token'}
        </p>

        <form id="ai-coach-config-form">
          <label>
            ${en ? 'Worker URL' : 'Worker URL'}
            <input
              name="baseUrl"
              type="url"
              required
              placeholder="https://trail-runner-coach-ai....workers.dev"
              value="${escapeHtml(config.baseUrl)}"
            >
          </label>

          <label>
            ${en ? 'Access token' : 'Access Token'}
            <input
              name="accessToken"
              type="password"
              required
              minlength="24"
              autocomplete="off"
              value=""
            >
          </label>

          <button class="button primary" type="submit">
            ${en ? 'Save AI Coach connection' : 'บันทึกการเชื่อมต่อ AI Coach'}
          </button>
        </form>

        <hr>

        <label>
          ${en ? 'Import setup receipt' : 'นำเข้า Setup Receipt'}
          <input type="file" accept=".json,application/json" data-ai-receipt>
        </label>
        <div class="submetric">
          ${en
            ? 'The receipt contains the Worker access token. Do not commit or share it.'
            : 'Receipt มี Worker Access Token ห้าม Commit หรือส่งให้ผู้อื่น'}
        </div>
      </article>
    </section>
  `;
}

function bindAiCoachActions(container, state, app, snapshot) {
  container
    .querySelector('#ai-coach-config-form')
    ?.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);

      try {
        const baseUrl = normalizeHttpsUrl(data.get('baseUrl'));
        const accessToken = String(data.get('accessToken') || '').trim();
        if (accessToken.length < 24) throw new Error('Access Token สั้นเกินไป');

        await app.store.saveSettings({
          integrations: {
            aiCoach: {
              baseUrl,
              accessToken,
              configuredAt: nowIso(),
              lastSuccessAt: null,
              lastError: ''
            }
          }
        });

        clearAiCoachCache();
        app.ui.aiCoach = {};
        app.toast(app.language === 'en' ? 'AI Coach connected' : 'เชื่อม AI Coach แล้ว');
        app.render();
      } catch (error) {
        app.toast(error.message || 'ตั้งค่า AI Coach ไม่สำเร็จ');
      }
    });

  container
    .querySelector('[data-ai-receipt]')
    ?.addEventListener('change', async event => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const receipt = JSON.parse(await file.text());
        if (receipt?.kind !== 'trail-runner-coach-ai-coach-v1') {
          throw new Error('ไฟล์นี้ไม่ใช่ AI Coach Setup Receipt');
        }

        const baseUrl = normalizeHttpsUrl(receipt.baseUrl);
        const accessToken = String(receipt.accessToken || '').trim();
        if (accessToken.length < 24) throw new Error('Receipt ไม่มี Access Token');

        await app.store.saveSettings({
          integrations: {
            aiCoach: {
              baseUrl,
              accessToken,
              configuredAt: receipt.configuredAt || nowIso(),
              lastSuccessAt: null,
              lastError: ''
            }
          }
        });

        clearAiCoachCache();
        app.ui.aiCoach = {};
        app.toast(app.language === 'en' ? 'Receipt imported' : 'นำเข้า Receipt แล้ว');
        app.render();
      } catch (error) {
        app.toast(error.message || 'นำเข้า Receipt ไม่สำเร็จ');
      }
    });

  container.querySelector('[data-ai-config]')?.addEventListener('click', async () => {
    await app.store.saveSettings({
      integrations: {
        aiCoach: {
          baseUrl: '',
          accessToken: '',
          configuredAt: null,
          lastSuccessAt: null,
          lastError: ''
        }
      }
    });
    clearAiCoachCache();
    app.ui.aiCoach = {};
    app.render();
  });

  container.querySelectorAll('[data-ai-ask], [data-ai-force]').forEach(button => {
    button.addEventListener('click', async () => {
      const force = button.hasAttribute('data-ai-force');
      button.disabled = true;
      button.textContent =
        app.language === 'en' ? 'AI Coach is writing…' : 'AI Coach กำลังเขียนคำแนะนำ…';

      try {
        const result = await requestAiCoachExplanation({
          settings: app.store.getState().settings,
          snapshot,
          force
        });

        app.ui.aiCoach = {
          snapshotDigest: snapshot.digest,
          result,
          error: ''
        };

        await app.store.saveSettings({
          integrations: {
            aiCoach: {
              lastSuccessAt: nowIso(),
              lastError: ''
            }
          }
        });
      } catch (error) {
        app.ui.aiCoach = {
          snapshotDigest: snapshot.digest,
          result: null,
          error: error.message || 'AI Coach ไม่สำเร็จ'
        };

        await app.store.saveSettings({
          integrations: {
            aiCoach: {
              lastError: error.message || 'AI Coach ไม่สำเร็จ'
            }
          }
        });
      }

      app.render();
    });
  });
}

function actionTitle(actionCode, en) {
  const map = {
    rest_assess: en ? 'Rest and assess symptoms' : 'พักและประเมินอาการ',
    replace_easy_or_rest: en ? 'Recovery work or rest' : 'Recovery เบามากหรือพัก',
    check_in_first: en ? 'Complete check-in first' : 'ทำ Check-in ก่อน',
    replace_with_easy: en ? 'Replace with easy work' : 'เปลี่ยนเป็น Easy',
    reduce_25: en ? 'Reduce today by about 25%' : 'ลดโหลดวันนี้ประมาณ 25%',
    reduce_15: en ? 'Reduce today by about 15%' : 'ลดโหลดวันนี้ประมาณ 15%',
    cap_long_run: en ? 'Shorten the long run' : 'ลด Long Run',
    taper_quality: en ? 'Keep quality short' : 'รักษา Quality ให้สั้น',
    follow_plan: en ? 'Follow the planned session' : 'ทำตามแผนได้'
  };
  return map[actionCode] || map.follow_plan;
}
