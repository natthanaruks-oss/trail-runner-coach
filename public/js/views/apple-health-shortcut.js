import {
  appleHealthConnectionMode,
  buildAppleShortcutRunUrl,
  fetchAppleHealthShortcutPayload,
  fetchAppleHealthShortcutStatus,
  getAppleHealthShortcutConfig,
  isAppleHealthShortcutConfigured,
  normalizeShortcutBaseUrl,
  parseAppleHealthShortcutSetupReceipt
} from '../adapters/apple-health.js';
import { syncProviderNow, updateAppleHealthConnectionSnapshot } from '../adapters/sync-manager.js';
import { autoPullAppleHealth, latestAppleHealthProviderState, shouldAutoPullAppleHealth } from '../core/apple-health-auto-pull.js';
import { escapeHtml, formatNumber, pageHeader } from './components.js';
import { selectAppleHealthInsights } from '../core/health-insights.js';
import { selectToday } from '../core/selectors.js';

export function renderAppleHealthShortcut(container, state, app) {
  const en = app.language === 'en';
  const config = getAppleHealthShortcutConfig(state.settings);
  const configured = isAppleHealthShortcutConfigured(state.settings);
  const mode = appleHealthConnectionMode(state.settings);
  const importUrl = config.baseUrl ? `${config.baseUrl}/v1/import` : '';
  const tokenMask = config.accessToken ? `${config.accessToken.slice(0, 5)}••••••••${config.accessToken.slice(-4)}` : '—';
  const health = selectAppleHealthInsights(state);
  const today = selectToday(state);
  const providerState = latestAppleHealthProviderState(state);

  container.innerHTML = `
    ${pageHeader(
      en ? 'Apple Health Shortcut' : 'Apple Health ผ่าน Shortcuts',
      en ? 'Send daily recovery and body metrics from iPhone Health without changing the Strava sync.' : 'ส่งข้อมูล Recovery และ Body metrics จาก Health บน iPhone โดยไม่แตะระบบ Strava Sync',
      'APPLE HEALTH BRIDGE'
    )}

    <section class="connection-overview card flat ${configured || mode === 'native' ? 'ready' : ''}">
      <div class="connection-overview-copy">
        <span class="status ${configured || mode === 'native' ? 'green' : 'yellow'}">${mode === 'native' ? (en ? 'Native HealthKit ready' : 'Native HealthKit พร้อม') : configured ? (en ? 'Shortcut bridge ready' : 'Shortcuts Bridge พร้อม') : (en ? 'Setup required' : 'ต้องตั้งค่าก่อน')}</span>
        <h2>${mode === 'native' ? (en ? 'Using iOS Companion' : 'กำลังใช้ iOS Companion') : (en ? 'Apple Health daily bridge' : 'สะพานข้อมูล Apple Health รายวัน')}</h2>
        <p>${en ? 'Recommended: let Strava own workouts and use Apple Health for sleep, RHR, HRV, steps, energy and body metrics.' : 'แนะนำให้ Strava เป็นแหล่ง Workout และใช้ Apple Health สำหรับ Sleep, RHR, HRV, Steps, Energy และ Body metrics เพื่อลดข้อมูลซ้ำ'}</p>
      </div>
      <div class="connection-overview-actions">
        <button class="button primary" type="button" data-apple-shortcut-sync ${configured || mode === 'native' ? '' : 'disabled'}>${en ? 'Pull latest data' : 'ดึงข้อมูลล่าสุด'}</button>
        <button class="button secondary" type="button" data-apple-shortcut-diagnose ${configured ? '' : 'disabled'}>${en ? 'Check Worker data' : 'ตรวจข้อมูลบน Worker'}</button>
        <a class="button secondary" href="${escapeHtml(buildAppleShortcutRunUrl(state.settings))}" ${configured ? '' : 'aria-disabled="true"'}>${en ? 'Run shortcut' : 'เปิด Shortcut'}</a>
      </div>
    </section>
    <div class="wizard-status submetric ${providerState.status === 'error' || providerState.status === 'auth_error' ? 'error' : health.hasData ? 'success' : ''}" id="apple-live-sync-status">${liveSyncStatus(health, providerState, en)}</div>

    ${renderHealthData(health, today, en)}

    <details class="health-advanced-settings" ${configured ? '' : 'open'}>
      <summary><span>${en ? 'Bridge setup and advanced settings' : 'ตั้งค่า Bridge และตัวเลือกขั้นสูง'}</span><small>${configured ? (en ? 'Configured' : 'ตั้งค่าแล้ว') : (en ? 'Setup required' : 'ต้องตั้งค่า')}</small></summary>
      <div class="health-advanced-settings-body">
    <section class="section">
      <div class="section-head"><h2>${en ? '1. Deploy the separate bridge' : '1. Deploy Bridge แยกจาก Strava'}</h2><span>${en ? 'One-time setup' : 'ทำครั้งเดียว'}</span></div>
      <article class="card flat wizard-step">
        <p>${en ? 'Run this in GitHub Codespaces. It creates a separate Worker, KV, encryption key and a local setup file.' : 'รันคำสั่งนี้ใน GitHub Codespaces ระบบจะสร้าง Worker แยก, KV, Encryption Key และไฟล์ Setup เฉพาะเครื่อง'}</p>
        <div class="copy-row"><code data-i18n-skip>npm run setup:apple-health-shortcut</code><button class="button ghost compact" type="button" data-copy="npm run setup:apple-health-shortcut">${en ? 'Copy' : 'คัดลอก'}</button></div>
        <small class="submetric">${en ? 'This does not deploy or edit the Strava wearable Worker.' : 'คำสั่งนี้ไม่ Deploy และไม่แก้ Wearable Worker ของ Strava'}</small>
      </article>
    </section>

    <section class="section">
      <div class="section-head"><h2>${en ? '2. Import bridge settings' : '2. นำเข้าค่าตั้งค่า Bridge'}</h2><span>${configured ? (en ? 'Configured' : 'ตั้งค่าแล้ว') : (en ? 'Not configured' : 'ยังไม่ตั้งค่า')}</span></div>
      <article class="card flat">
        <form id="apple-shortcut-form" class="form-grid">
          <div class="field full"><label>${en ? 'Worker URL' : 'Worker URL'}</label><input name="baseUrl" type="url" placeholder="https://trail-runner-coach-apple-health-sync.YOUR.workers.dev" value="${escapeHtml(config.baseUrl)}"></div>
          <div class="field full"><label>${en ? 'Bridge token' : 'Bridge Token'}</label><input name="accessToken" type="password" autocomplete="off" placeholder="Paste the generated token" value="${escapeHtml(config.accessToken)}"></div>
          <div class="field full"><label>${en ? 'Shortcut name' : 'ชื่อ Shortcut'}</label><input name="shortcutName" value="${escapeHtml(config.shortcutName)}"></div>
          <div class="field full"><label>${en ? 'Import local setup result' : 'นำเข้าไฟล์ Setup'}</label><input name="receipt" type="file" accept="application/json,.json"></div>
          <button class="button primary" type="submit">${en ? 'Save and test' : 'บันทึกและทดสอบ'}</button>
          <button class="button secondary" type="button" data-apple-shortcut-test ${configured ? '' : 'disabled'}>${en ? 'Test again' : 'ทดสอบอีกครั้ง'}</button>
        </form>
        <div class="shortcut-credential-grid">
          <div><small>POST URL</small><code data-i18n-skip>${escapeHtml(importUrl || 'Setup first')}</code>${importUrl ? `<button class="mini-link" type="button" data-copy="${escapeHtml(importUrl)}">${en ? 'Copy' : 'คัดลอก'}</button>` : ''}</div>
          <div><small>Bearer Token</small><code data-i18n-skip>${escapeHtml(tokenMask)}</code>${config.accessToken ? `<button class="mini-link" type="button" data-copy="${escapeHtml(config.accessToken)}">${en ? 'Copy' : 'คัดลอก'}</button>` : ''}</div>
        </div>
        <div id="apple-shortcut-status" class="wizard-status submetric">${configured ? (en ? 'Ready to test the bridge' : 'พร้อมทดสอบ Bridge') : (en ? 'Import the .local.json setup result first' : 'นำเข้าไฟล์ .local.json ก่อน')}</div>
        <div class="callout danger section"><strong>${en ? 'Sensitive file' : 'ไฟล์ลับ'}:</strong> ${en ? 'The setup result contains a bridge token. Do not commit it to GitHub and delete it after setup.' : 'ไฟล์ Setup มี Bridge Token ห้าม Commit ขึ้น GitHub และควรลบหลังตั้งค่าเสร็จ'}</div>
      </article>
    </section>

    <section class="section">
      <div class="section-head"><h2>${en ? '3. Build the iPhone shortcut' : '3. สร้าง Shortcut บน iPhone'}</h2><span>${en ? 'Daily recovery data' : 'ข้อมูล Recovery รายวัน'}</span></div>
      <div class="list shortcut-steps">
        ${step('1', en ? 'Create a shortcut named TRC Apple Health Sync' : 'สร้าง Shortcut ชื่อ TRC Apple Health Sync', en ? 'Use Find Health Samples actions to read the latest health values.' : 'ใช้คำสั่ง Find Health Samples เพื่ออ่านค่าล่าสุดจาก Health')}
        ${step('2', en ? 'Collect the recommended fields' : 'เก็บค่าที่แนะนำ', 'Sleep Hours, Resting HR, HRV, Steps, Active Energy, Exercise Minutes, Walking/Running Distance, Weight, Body Fat')}
        ${step('3', en ? 'Create a Dictionary payload' : 'สร้าง Dictionary', en ? 'Use date format yyyy-MM-dd and the field names shown below.' : 'ใช้วันที่รูปแบบ yyyy-MM-dd และชื่อ Field ตามตัวอย่างด้านล่าง')}
        ${step('4', en ? 'POST with Get Contents of URL' : 'ส่งด้วย Get Contents of URL', en ? 'Method POST · Request Body JSON · Authorization header: Bearer + your token.' : 'Method POST · Request Body JSON · Header Authorization = Bearer ตามด้วย Token')}
        ${step('5', en ? 'Run once and grant Health permissions' : 'รันครั้งแรกและอนุญาต Health', en ? 'Allow only the health categories you selected.' : 'อนุญาตเฉพาะหมวดข้อมูลที่เลือก')}
        ${step('6', en ? 'Create a morning Personal Automation' : 'ตั้ง Personal Automation ตอนเช้า', en ? 'Run after waking up, then open this app and pull the latest data.' : 'ให้ทำงานหลังตื่นนอน จากนั้นเปิดแอปและกดดึงข้อมูลล่าสุด')}
      </div>
      <details class="card flat shortcut-json-help">
        <summary>${en ? 'Dictionary field template' : 'Template ชื่อ Field ใน Dictionary'}</summary>
        <pre data-i18n-skip>{
  "source": "apple_health",
  "exportedAt": "Current Date (ISO 8601)",
  "dailyMetric": {
    "date": "yyyy-MM-dd",
    "sleepHours": 7.2,
    "restingHr": 54,
    "hrvMs": 48,
    "steps": 8240,
    "activeEnergyKcal": 780,
    "exerciseMinutes": 65,
    "walkingRunningDistanceKm": 9.4,
    "sourceDevice": "Apple Shortcuts"
  },
  "bodyComposition": {
    "date": "yyyy-MM-dd",
    "weightKg": 88.9,
    "percentBodyFat": 27.5,
    "sourceDevice": "Apple Shortcuts"
  }
}</pre>
      </details>
    </section>
      </div>
    </details>

    <section class="section callout"><strong>${en ? 'Data ownership rule' : 'กติกาแหล่งข้อมูล'}:</strong> ${en ? 'Do not add workout actions to the Shortcut while Strava is connected. This avoids duplicate activities.' : 'ระหว่างที่ Strava เชื่อมอยู่ ไม่ต้องใส่ Workout ใน Shortcut เพื่อลดกิจกรรมซ้ำ'}</section>`;

  bindActions(container, app, state, health);
}

function renderHealthData(health, today, en) {
  const metrics = [
    ['steps', en ? 'Steps' : 'ก้าว', '', 'Strain'],
    ['activeEnergyKcal', en ? 'Active energy' : 'พลังงานกิจกรรม', 'kcal', en ? 'Fuel target' : 'เป้าพลังงาน'],
    ['exerciseMinutes', en ? 'Exercise' : 'เวลาออกกำลัง', en ? 'min' : 'นาที', 'Strain'],
    ['walkingRunningDistanceKm', en ? 'Walk + run' : 'เดิน + วิ่ง', 'km', en ? 'Context' : 'บริบท'],
    ['sleepHours', en ? 'Sleep' : 'การนอน', en ? 'h' : 'ชม.', 'Recovery'],
    ['restingHr', 'Resting HR', 'bpm', 'Recovery'],
    ['hrvMs', 'HRV', 'ms', 'Recovery']
  ];
  const lastSync = health.lastImportedAt ? formatTimestamp(health.lastImportedAt, en) : '—';
  const body = health.latestBody;
  const behavior = today.strain.behaviorLoad;
  const energy = health.nutrition;
  return `<section class="section">
    <div class="section-head"><h2>${en ? 'Latest Apple Health data' : 'ข้อมูล Apple Health ล่าสุด'}</h2><span>${en ? 'Last sync' : 'Sync ล่าสุด'} ${escapeHtml(lastSync)}</span></div>
    ${health.hasData ? `<article class="card flat">
      <div class="health-metric-grid">
        ${metrics.map(([key,label,unit,usage]) => healthValue(label, health.metrics[key], unit, usage, en)).join('')}
      </div>
      <div class="health-trend-grid section">
        ${trendValue(en ? '7-day average steps' : 'ก้าวเฉลี่ย 7 วัน', health.trend.averages.steps, '')}
        ${trendValue(en ? 'Average sleep' : 'การนอนเฉลี่ย', health.trend.averages.sleepHours, en ? 'h' : 'ชม.')}
        ${trendValue(en ? 'Average RHR' : 'RHR เฉลี่ย', health.trend.averages.restingHr, 'bpm')}
        ${trendValue(en ? 'Average HRV' : 'HRV เฉลี่ย', health.trend.averages.hrvMs, 'ms')}
      </div>
      <div class="health-usage-list section">
        ${usageRow(en ? 'Steps + Active Energy + Exercise Minutes' : 'Steps + Active Energy + Exercise Minutes', en ? 'Adjust daily behavior load and Strain without creating duplicate workouts.' : 'ปรับ Behavior Load และ Daily Strain โดยไม่สร้าง Workout ซ้ำ', behavior?.score == null ? '—' : `${formatNumber(behavior.score)}/100`)}
        ${usageRow(en ? 'Sleep + RHR + HRV' : 'Sleep + RHR + HRV', en ? 'Build Recovery, baseline and Readiness confidence.' : 'สร้าง Recovery, Baseline และความมั่นใจของ Readiness', today.recovery?.score == null ? `${health.recoveryAvailable}/3` : `${formatNumber(today.recovery.score)}/100`)}
        ${usageRow(en ? 'Active Energy' : 'Active Energy', en ? 'Sets the fuel target using BMR + Apple Active Energy, avoiding double counting.' : 'กำหนดเป้าพลังงานจาก BMR + Apple Active Energy โดยไม่บวกกิจกรรมซ้ำ', energy.usesAppleActiveEnergy ? `${formatNumber(energy.target.kcal)} kcal` : '—')}
        ${usageRow(en ? 'Weight + Body Fat' : 'Weight + Body Fat', en ? 'Feeds Body Composition trends and nutrition calculations.' : 'ใช้ในแนวโน้ม Body Composition และการคำนวณโภชนาการ', body ? `${formatNumber(body.weightKg,1)} kg` : '—')}
      </div>
      <div class="button-row section"><a class="button secondary" href="#/scores">${en ? 'Open score details' : 'ดูรายละเอียดคะแนน'}</a><a class="button secondary" href="#/fuel">${en ? 'Open calories' : 'ดูพลังงานและอาหาร'}</a><a class="button secondary" href="#/body">${en ? 'Open body trends' : 'ดูแนวโน้มร่างกาย'}</a></div>
    </article>` : `<div class="card flat empty">${en ? 'No Apple Health data has been pulled into the app yet. Run the Shortcut, then tap Pull latest data.' : 'ยังไม่มีข้อมูล Apple Health ในแอป ให้รัน Shortcut แล้วกด “ดึงข้อมูลล่าสุด”'}</div>`}
  </section>`;
}

function healthValue(label, value, unit, usage, en) {
  const available = value != null;
  const decimals = ['km', 'h', 'ชม.'].includes(unit) ? 1 : 0;
  return `<div class="health-metric ${available ? 'available' : 'missing'}"><div class="health-metric-head"><span>${escapeHtml(label)}</span><i>${escapeHtml(usage)}</i></div><strong>${available ? formatNumber(value, decimals) : '—'}${available && unit ? `<small>${escapeHtml(unit)}</small>` : ''}</strong><em>${available ? (en ? 'Imported' : 'นำเข้าแล้ว') : (en ? 'Not received' : 'ยังไม่มีข้อมูล')}</em></div>`;
}

function trendValue(label, value, unit) {
  return `<div class="health-trend-card"><small>${escapeHtml(label)}</small><strong>${value == null ? '—' : formatNumber(value, unit === 'h' || unit === 'ชม.' ? 1 : 0)}${value != null && unit ? ` <small>${escapeHtml(unit)}</small>` : ''}</strong></div>`;
}

function usageRow(label, detail, value) {
  return `<div><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></div><span class="status neutral">${escapeHtml(value)}</span></div>`;
}

function formatTimestamp(value, en) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '—');
  return date.toLocaleString(en ? 'en-GB' : 'th-TH', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
}

function bindActions(container, app, state, health) {
  container.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    await navigator.clipboard.writeText(button.dataset.copy || '');
    app.toast(app.language === 'en' ? 'Copied' : 'คัดลอกแล้ว');
  }));

  const form = container.querySelector('#apple-shortcut-form');
  form?.querySelector('[name="receipt"]')?.addEventListener('change', async event => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      const config = parseAppleHealthShortcutSetupReceipt(await file.text());
      form.elements.baseUrl.value = config.baseUrl;
      form.elements.accessToken.value = config.accessToken;
      form.elements.shortcutName.value = config.shortcutName;
      await saveConfig(app, config);
      app.toast(app.language === 'en' ? 'Setup imported' : 'นำเข้า Setup แล้ว');
      app.render();
    } catch (error) { setStatus(container, error.message, true); }
  });

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const data = new FormData(event.currentTarget);
      const config = {
        baseUrl: normalizeShortcutBaseUrl(data.get('baseUrl')),
        accessToken: String(data.get('accessToken') || '').trim(),
        shortcutName: String(data.get('shortcutName') || 'TRC Apple Health Sync').trim(),
        configuredAt: new Date().toISOString()
      };
      if (config.accessToken.length < 32) throw new Error('Bridge Token สั้นหรือไม่ถูกต้อง');
      await saveConfig(app, config);
      await testConfig(container, app);
      app.render();
    } catch (error) { setStatus(container, error.message, true); }
  });

  container.querySelector('[data-apple-shortcut-test]')?.addEventListener('click', () => testConfig(container, app).catch(error => setStatus(container, error.message, true)));
  container.querySelector('[data-apple-shortcut-sync]')?.addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    setLiveStatus(container, app.language === 'en' ? 'Pulling Apple Health data into this browser…' : 'กำลังดึงข้อมูล Apple Health เข้า Browser นี้…');
    setStatus(container, app.language === 'en' ? 'Pulling Apple Health data…' : 'กำลังดึงข้อมูล Apple Health…');
    try {
      const result = await syncProviderNow(app.store, 'apple_health', { days: 90, trigger: 'shortcut_manual', resetRetry: true });
      const summary = result.result || {};
      setStatus(container, app.language === 'en' ? `Sync complete: ${summary.checkins || 0} days` : `Sync สำเร็จ: ${summary.checkins || 0} วัน`);
      setLiveStatus(container, app.language === 'en' ? `Imported ${summary.checkins || 0} day(s) into this browser.` : `นำเข้าข้อมูลเข้า Browser นี้แล้ว ${summary.checkins || 0} วัน`);
      app.toast(app.language === 'en' ? 'Apple Health synced' : 'Sync Apple Health แล้ว');
      app.render();
      return;
    } catch (error) {
      setStatus(container, error.message, true);
      setLiveStatus(container, error.message, true);
    }
    event.currentTarget.disabled = false;
  });

  container.querySelector('[data-apple-shortcut-diagnose]')?.addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    setLiveStatus(container, app.language === 'en' ? 'Checking encrypted data stored on the Worker…' : 'กำลังตรวจข้อมูลเข้ารหัสที่เก็บบน Worker…');
    try {
      const payload = await fetchAppleHealthShortcutPayload(app.store.getState().settings, { days: 90 });
      const rows = Array.isArray(payload.dailyMetrics) ? payload.dailyMetrics : [];
      const latest = rows.at(-1)?.date || '—';
      const message = app.language === 'en'
        ? `Worker has ${rows.length} daily record(s). Latest date: ${latest}.`
        : `Worker มีข้อมูลรายวัน ${rows.length} วัน · วันที่ล่าสุด ${latest}`;
      setLiveStatus(container, message, rows.length === 0);
    } catch (error) {
      setLiveStatus(container, error.message, true);
    } finally {
      event.currentTarget.disabled = false;
    }
  });

  scheduleAppleHealthPageAutoPull(container, state, app, health);
}

async function saveConfig(app, config) {
  await app.store.saveSettings({ integrations: { appleHealthShortcut: config } });
  await updateAppleHealthConnectionSnapshot(app.store);
}

async function testConfig(container, app) {
  setStatus(container, app.language === 'en' ? 'Testing bridge…' : 'กำลังทดสอบ Bridge…');
  const status = await fetchAppleHealthShortcutStatus(app.store.getState().settings);
  if (!status.ready) throw new Error('Apple Health Shortcut Worker ยังตั้งค่าไม่ครบ');
  setStatus(container, app.language === 'en' ? 'Bridge is ready' : 'Bridge พร้อมใช้งาน');
  app.toast(app.language === 'en' ? 'Bridge ready' : 'Bridge พร้อม');
}


function liveSyncStatus(health, providerState, en) {
  if (providerState?.lastError) return providerState.lastError;
  if (health.hasData) {
    return en
      ? `This browser has Apple Health data. Last import ${formatTimestamp(health.lastImportedAt, en)}.`
      : `Browser นี้มีข้อมูล Apple Health แล้ว · นำเข้าล่าสุด ${formatTimestamp(health.lastImportedAt, en)}`;
  }
  return en
    ? 'The Shortcut uploads to the Worker first. This page now pulls that data into the current browser automatically.'
    : 'Shortcut จะส่งข้อมูลขึ้น Worker ก่อน หน้านี้จะดึงข้อมูลเข้า Browser ปัจจุบันให้อัตโนมัติ';
}

function setLiveStatus(container, message, error = false) {
  const element = container.querySelector('#apple-live-sync-status');
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('error', error);
  element.classList.toggle('success', !error);
}

function scheduleAppleHealthPageAutoPull(container, state, app, health) {
  if (!shouldAutoPullAppleHealth(state, health)) return;
  const button = container.querySelector('[data-apple-shortcut-sync]');
  if (button) {
    button.disabled = true;
    button.textContent = app.language === 'en' ? 'Pulling…' : 'กำลังดึง…';
  }
  setLiveStatus(container, app.language === 'en' ? 'Automatically pulling the latest Worker data…' : 'กำลังดึงข้อมูลล่าสุดจาก Worker อัตโนมัติ…');
  queueMicrotask(async () => {
    try {
      const result = await autoPullAppleHealth(app, { days: 90, trigger: 'apple_health_page_auto' });
      const count = Number(result?.result?.checkins || 0);
      if (count > 0) {
        app.toast(app.language === 'en' ? `Apple Health imported: ${count} day(s)` : `นำเข้า Apple Health แล้ว ${count} วัน`);
        app.render();
        return;
      }
      setLiveStatus(container, app.language === 'en' ? 'Worker responded but contains no supported daily data.' : 'Worker ตอบกลับแล้ว แต่ยังไม่มี Daily Metric ที่รองรับ', true);
    } catch (error) {
      setLiveStatus(container, error.message, true);
    } finally {
      if (button?.isConnected) {
        button.disabled = false;
        button.textContent = app.language === 'en' ? 'Pull latest data' : 'ดึงข้อมูลล่าสุด';
      }
    }
  });
}

function setStatus(container, message, error = false) {
  const element = container.querySelector('#apple-shortcut-status');
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('error', error);
  element.classList.toggle('success', !error);
}

function step(number, title, detail) {
  return `<article class="list-item"><div class="step-number">${number}</div><div class="grow"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div></article>`;
}
