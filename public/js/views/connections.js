import { isAppleHealthBridgeAvailable } from '../adapters/apple-health.js';
import {
  PROVIDER_DEFINITIONS,
  disconnectProvider,
  fetchProviderConnections,
  fetchProviderSetupStatus,
  getStravaSetupDetails,
  getSyncBaseUrl,
  normalizeSyncBaseUrl,
  parseStravaSetupReceipt,
  startProviderOAuth
} from '../adapters/provider-sync.js';
import {
  clearRetryQueue,
  getSyncState,
  retryQueuedSyncs,
  runAutoSync,
  setAutoSyncPreferences,
  syncProviderNow,
  updateConnectionSnapshot
} from '../adapters/sync-manager.js';
import { escapeHtml, pageHeader } from './components.js';

const DEFAULT_SYNC_WORKER = 'trail-runner-coach-wearable-sync';

export function renderConnections(container, state, app, options = {}) {
  const baseUrl = getSyncBaseUrl(state.settings);
  const predictedUrl = baseUrl || inferWorkerUrl(location.origin, DEFAULT_SYNC_WORKER);
  const details = predictedUrl ? getStravaSetupDetails(predictedUrl) : null;
  const appleBridge = isAppleHealthBridgeAvailable();
  const syncState = getSyncState(state);
  const callback = new URLSearchParams(location.hash.split('?')[1] || '');
  const callbackMessage = callback.get('connected') === '1'
    ? `เชื่อมต่อ ${callback.get('provider') || 'provider'} แล้ว`
    : callback.get('error') ? `เชื่อมต่อไม่สำเร็จ: ${callback.get('error')}` : '';

  const header = options.embedded
    ? '<div class="section-head"><h2>การเชื่อมต่อ</h2><span>Health & activity connections</span></div><p class="submetric">รวม Apple Health, Garmin, Suunto และ Strava โดยแปลงข้อมูลเข้าสู่ schema กลางก่อนคำนวณ Strain/Recovery</p>'
    : pageHeader('การเชื่อมต่อ', 'รวม Apple Health, Garmin, Suunto และ Strava โดยแปลงข้อมูลเข้าสู่ schema กลางก่อนคำนวณ Strain/Recovery', 'Health & activity connections');

  container.innerHTML = `${header}
    ${callbackMessage ? `<div class="callout ${callback.get('connected') === '1' ? 'good' : 'danger'}">${escapeHtml(callbackMessage)}</div>` : ''}

    <div data-sync-center-shell>${syncCenter(syncState, app.language)}</div>

    ${stravaWizard(baseUrl, details)}

    <section class="connection-grid section">
      ${providerCard('apple_health', { connected: appleBridge, status: appleBridge ? 'พร้อม Sync' : 'ต้องใช้ iOS Companion' }, syncState.providers.apple_health, app.language)}
      ${providerCard('garmin', { connected: syncState.providers.garmin.connected, status: baseUrl ? 'รอตรวจสถานะ' : 'ต้องตั้งค่า Worker' }, syncState.providers.garmin, app.language)}
      ${providerCard('suunto', { connected: syncState.providers.suunto.connected, status: baseUrl ? 'รอตรวจสถานะ' : 'ต้องตั้งค่า Worker' }, syncState.providers.suunto, app.language)}
      ${providerCard('strava', { connected: syncState.providers.strava.connected, status: baseUrl ? 'รอตรวจสถานะ' : 'ทำ Setup Wizard ก่อน' }, syncState.providers.strava, app.language)}
    </section>

    <section class="section">
      <div class="section-head"><h2>Wearable Sync Worker</h2><span>Advanced / Garmin / Suunto</span></div>
      <article class="card flat">
        <form id="sync-worker-form" class="form-grid">
          <div class="field full"><label>Worker URL</label><input name="syncBaseUrl" type="url" placeholder="https://trail-runner-coach-wearable-sync.YOUR.workers.dev" value="${escapeHtml(baseUrl)}"></div>
          <div class="field full"><small class="submetric">Client secret และ refresh token ต้องอยู่ใน Cloudflare Worker/KV เท่านั้น ห้ามใส่ใน public JavaScript หรือ GitHub</small></div>
          <button class="button primary" type="submit">บันทึก Worker URL</button>
          <button class="button secondary" type="button" data-refresh-connections>ตรวจสถานะ</button>
        </form>
        <div id="connection-status" class="submetric" style="margin-top:12px">${baseUrl ? 'กดตรวจสถานะเพื่ออ่านข้อมูลจาก Worker' : 'ยังไม่ได้ตั้งค่า Worker URL'}</div>
      </article>
    </section>

    <section class="section">
      <div class="section-head"><h2>Provider Roadmap</h2><span>แนะนำทำทีละ Provider</span></div>
      <div class="list">
        ${step('1', 'Strava', 'Setup Wizard พร้อมใช้งานสำหรับ OAuth และ Activity Sync')}
        ${step('2', 'Apple Health', 'Build iOS Companion ผ่าน Xcode, เปิด HealthKit capability และติดตั้งบน iPhone')}
        ${step('3', 'Garmin', 'สมัคร Garmin Connect Developer Program และขอ Health + Activity API access')}
        ${step('4', 'Suunto', 'สมัคร Suunto Partner Program และเปิด Workout/FIT adapter')}
      </div>
    </section>
    <div class="callout">Apple Health ใช้ Native HealthKit bridge ส่วน Garmin, Suunto และ Strava ต้องผ่าน OAuth backend เพราะ Client Secret และ refresh token ไม่ควรอยู่ใน browser</div>`;

  bindActions(container, state, app, appleBridge);
  bindSyncCenterActions(container, app);
  if (baseUrl) refreshConnectionStatus(container, state, app).catch(error => setStatus(container, error.message, true, app));
}

function stravaWizard(baseUrl, details) {
  const command = 'npm run setup:strava';
  return `<section class="section strava-wizard" data-strava-wizard>
    <div class="section-head">
      <div><div class="eyebrow">ONE-TIME SETUP</div><h2>Strava Setup Wizard</h2></div>
      <span class="status ${baseUrl ? 'green' : 'yellow'}" data-strava-wizard-badge>${baseUrl ? 'มี Worker URL แล้ว' : 'เริ่มตั้งค่า'}</span>
    </div>
    <div class="wizard-progress" aria-label="Strava setup progress"><span style="width:${baseUrl ? 75 : 25}%" data-strava-progress></span></div>

    <div class="wizard-steps">
      <article class="card flat wizard-step">
        <div class="wizard-step-head"><span class="step-number">1</span><div><h3>สร้าง Strava API Application</h3><p class="submetric">ใช้ Callback Domain ด้านล่าง แล้วเก็บ Client ID และ Client Secret ไว้สำหรับคำสั่ง Setup</p></div></div>
        ${details ? setupDetails(details, 'predicted') : '<div class="callout">ไม่สามารถคาดการณ์ Worker URL ได้ กรุณากรอก Worker URL ใน Step 3</div>'}
        <a class="button secondary" href="https://www.strava.com/settings/api" target="_blank" rel="noreferrer">เปิด Strava API Settings</a>
      </article>

      <article class="card flat wizard-step">
        <div class="wizard-step-head"><span class="step-number">2</span><div><h3>รัน Setup อัตโนมัติหนึ่งคำสั่ง</h3><p class="submetric">คำสั่งจะ Login Cloudflare, สร้าง KV 3 ชุด, ตั้ง Secrets, Deploy Worker และสร้างไฟล์ผลลัพธ์ โดยไม่บันทึก Client Secret ลง Repo</p></div></div>
        <div class="copy-row"><code data-i18n-skip>${command}</code><button class="button ghost compact" type="button" data-copy-text="${command}">คัดลอก</button></div>
        <small class="submetric">รันจากโฟลเดอร์หลักของโปรเจกต์บนเครื่องที่มี Node.js 22+</small>
      </article>

      <article class="card flat wizard-step">
        <div class="wizard-step-head"><span class="step-number">3</span><div><h3>นำเข้าผล Setup หรือวาง Worker URL</h3><p class="submetric">เลือกไฟล์ <span data-i18n-skip>strava-setup-result.json</span> ที่คำสั่งสร้าง หรือวาง URL เอง</p></div></div>
        <form id="strava-worker-form" class="form-grid">
          <div class="field full"><label>Worker URL</label><input name="workerUrl" type="url" placeholder="https://trail-runner-coach-wearable-sync.YOUR.workers.dev" value="${escapeHtml(baseUrl)}"></div>
          <div class="field full"><label>Import setup result</label><input name="setupReceipt" type="file" accept="application/json,.json"></div>
          <button class="button primary" type="submit">บันทึกและตรวจระบบ</button>
          <button class="button secondary" type="button" data-test-strava-setup ${baseUrl ? '' : 'disabled'}>ตรวจระบบอีกครั้ง</button>
        </form>
        <div id="strava-setup-status" class="wizard-status submetric">${baseUrl ? 'พร้อมตรวจ Worker configuration' : 'ยังไม่ได้บันทึก Worker URL'}</div>
        <div id="strava-live-details">${baseUrl && details ? setupDetails(details, 'saved') : ''}</div>
      </article>

      <article class="card flat wizard-step">
        <div class="wizard-step-head"><span class="step-number">4</span><div><h3>Connect และ Sync</h3><p class="submetric">เมื่อทุกจุดเป็นสีเขียว ให้กด Connect Strava แล้วอนุญาตสิทธิ์ Activity</p></div></div>
        <div class="setup-check-grid" data-setup-checks>
          ${setupCheck('appOrigin', 'App Origin')}
          ${setupCheck('kv', 'Cloudflare KV')}
          ${setupCheck('secrets', 'Strava Secrets')}
          ${setupCheck('ready', 'Worker Ready')}
        </div>
        <div class="button-row">
          <button class="button primary" type="button" data-connect-strava-wizard ${baseUrl ? '' : 'disabled'}>Connect Strava</button>
          <button class="button secondary" type="button" data-sync-provider="strava" disabled>Sync Activities</button>
        </div>
      </article>
    </div>
  </section>`;
}

function setupDetails(details, mode) {
  return `<div class="setup-details" data-setup-details="${mode}">
    <div><small>Callback Domain</small><div class="copy-row"><code data-i18n-skip>${escapeHtml(details.callbackDomain)}</code><button class="button ghost compact" type="button" data-copy-text="${escapeHtml(details.callbackDomain)}">คัดลอก</button></div></div>
    <div><small>Callback URL</small><div class="copy-row"><code data-i18n-skip>${escapeHtml(details.callbackUrl)}</code><button class="button ghost compact" type="button" data-copy-text="${escapeHtml(details.callbackUrl)}">คัดลอก</button></div></div>
  </div>`;
}

function setupCheck(key, label) {
  return `<div class="setup-check" data-setup-check="${key}"><span class="setup-dot"></span><small>${escapeHtml(label)}</small></div>`;
}

function providerCard(provider, info, syncInfo, language) {
  const def = PROVIDER_DEFINITIONS[provider];
  const cloud = def.type === 'cloud';
  const status = providerStatus(syncInfo, info);
  const lastSync = syncInfo?.lastSuccessAt ? formatSyncTime(syncInfo.lastSuccessAt, language) : 'ยังไม่เคย Sync';
  const result = syncInfo?.lastResult ? syncResultSummary(syncInfo.lastResult, language) : '';
  const retry = syncInfo?.nextRetryAt ? `Retry ${formatSyncTime(syncInfo.nextRetryAt, language)}` : '';
  return `<article class="card flat connection-card" data-provider-card="${provider}">
    <div class="connection-card-head"><div><div class="eyebrow">${cloud ? 'CLOUD OAUTH' : 'NATIVE HEALTHKIT'}</div><h2>${escapeHtml(def.label)}</h2></div><span class="status ${status.className}" data-provider-status="${provider}">${escapeHtml(status.label)}</span></div>
    <p class="submetric">${escapeHtml(def.data)}</p>
    <div class="provider-sync-meta" data-provider-sync-meta="${provider}">
      <small><strong>Sync ล่าสุด</strong><span>${escapeHtml(lastSync)}</span></small>
      ${result ? `<small><strong>ผลล่าสุด</strong><span>${escapeHtml(result)}</span></small>` : ''}
      ${syncInfo?.lastError ? `<small class="sync-error"><strong>ปัญหาล่าสุด</strong><span>${escapeHtml(syncInfo.lastError)}</span></small>` : ''}
      ${retry ? `<small class="sync-retry"><strong>คิว Retry</strong><span>${escapeHtml(retry)}</span></small>` : ''}
    </div>
    <div class="button-row" style="margin-top:12px">
      ${provider === 'apple_health'
        ? `<button class="button primary" data-apple-sync ${info.connected ? '' : 'disabled'}>${info.connected ? 'Sync Apple Health' : 'เปิดผ่าน iOS Companion'}</button>`
        : `<button class="button primary" data-connect-provider="${provider}">เชื่อมต่อ</button><button class="button secondary" data-sync-provider="${provider}" ${info.connected ? '' : 'disabled'}>Sync</button><button class="button danger" data-disconnect-provider="${provider}" ${info.connected ? '' : 'disabled'}>ยกเลิก</button>`}
    </div>
  </article>`;
}

function bindActions(container, state, app, appleBridge) {
  bindCopyButtons(container, app);

  container.querySelector('#strava-worker-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const value = normalizeSyncBaseUrl(new FormData(form).get('workerUrl'));
      await saveWorkerUrl(app, value);
      updateWizardDetails(container, value, app);
      await refreshStravaSetupStatus(container, app.store.getState(), app);
    } catch (error) { setWizardStatus(container, error.message, true, app); }
  });

  container.querySelector('[name="setupReceipt"]')?.addEventListener('change', async event => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      const receipt = parseStravaSetupReceipt(await file.text());
      container.querySelector('#strava-worker-form [name="workerUrl"]').value = receipt.workerUrl;
      await saveWorkerUrl(app, receipt.workerUrl);
      updateWizardDetails(container, receipt.workerUrl, app);
      app.toast('นำเข้า Strava setup result แล้ว');
      await refreshStravaSetupStatus(container, app.store.getState(), app);
    } catch (error) { setWizardStatus(container, error.message, true, app); }
    event.currentTarget.value = '';
  });

  container.querySelector('[data-test-strava-setup]')?.addEventListener('click', () =>
    refreshStravaSetupStatus(container, app.store.getState(), app).catch(error => setWizardStatus(container, error.message, true, app))
  );

  container.querySelector('[data-connect-strava-wizard]')?.addEventListener('click', () => {
    try { startProviderOAuth('strava', app.store.getState().settings); }
    catch (error) { app.toast(error.message); }
  });

  container.querySelector('#sync-worker-form').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const value = normalizeSyncBaseUrl(new FormData(event.currentTarget).get('syncBaseUrl'));
      await saveWorkerUrl(app, value);
      const wizardInput = container.querySelector('#strava-worker-form [name="workerUrl"]');
      if (wizardInput) wizardInput.value = value;
      updateWizardDetails(container, value, app);
      app.toast('บันทึก Worker URL แล้ว');
      await refreshConnectionStatus(container, app.store.getState(), app);
    } catch (error) { setStatus(container, error.message, true, app); }
  });

  container.querySelector('[data-refresh-connections]').addEventListener('click', () =>
    refreshConnectionStatus(container, app.store.getState(), app).catch(error => setStatus(container, error.message, true, app))
  );

  container.querySelector('[data-apple-sync]')?.addEventListener('click', async event => {
    if (!appleBridge) return;
    event.currentTarget.disabled = true;
    setStatus(container, 'กำลังอ่าน Apple Health…', false, app);
    try {
      const outcome = await syncProviderNow(app.store, 'apple_health', { days: 90, trigger: 'manual', resetRetry: true });
      app.toast(`Apple Health: ${syncResultSummary(outcome.result, app.language)}`);
      refreshConnectionsSyncUi(container, app.store.getState(), app);
    } catch (error) {
      setStatus(container, error.message || 'Apple Health sync ไม่สำเร็จ', true, app);
      refreshConnectionsSyncUi(container, app.store.getState(), app);
    } finally { event.currentTarget.disabled = false; }
  });

  container.querySelectorAll('[data-connect-provider]').forEach(button => button.addEventListener('click', () => {
    try { startProviderOAuth(button.dataset.connectProvider, app.store.getState().settings); }
    catch (error) { app.toast(error.message); }
  }));

  container.querySelectorAll('[data-sync-provider]').forEach(button => button.addEventListener('click', async () => {
    const provider = button.dataset.syncProvider;
    button.disabled = true;
    setStatus(container, `กำลัง Sync ${provider}…`, false, app);
    try {
      const outcome = await syncProviderNow(app.store, provider, { days: 90, trigger: 'manual', resetRetry: true });
      app.toast(`Sync ${provider}: ${syncResultSummary(outcome.result, app.language)}`);
      await refreshConnectionStatus(container, app.store.getState(), app);
    } catch (error) {
      setStatus(container, error.message, true, app);
      refreshConnectionsSyncUi(container, app.store.getState(), app);
    } finally { button.disabled = false; }
  }));

  container.querySelectorAll('[data-disconnect-provider]').forEach(button => button.addEventListener('click', async () => {
    try {
      await disconnectProvider(button.dataset.disconnectProvider, app.store.getState().settings);
      app.toast('ยกเลิกการเชื่อมต่อแล้ว');
      await refreshConnectionStatus(container, app.store.getState(), app);
    } catch (error) { app.toast(error.message); }
  }));
}

async function saveWorkerUrl(app, value) {
  await app.store.saveSettings({ integrations: { syncBaseUrl: value } });
}

function bindCopyButtons(container, app) {
  container.querySelectorAll('[data-copy-text]').forEach(button => button.addEventListener('click', async () => {
    const value = button.dataset.copyText || '';
    try {
      await navigator.clipboard.writeText(value);
      app.toast('คัดลอกแล้ว');
    } catch {
      const area = document.createElement('textarea');
      area.value = value;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      document.execCommand?.('copy');
      area.remove();
      app.toast('คัดลอกแล้ว');
    }
  }));
}

function updateWizardDetails(container, workerUrl, app) {
  const details = getStravaSetupDetails(workerUrl);
  const live = container.querySelector('#strava-live-details');
  if (live) {
    live.innerHTML = setupDetails(details, 'saved');
    app.localize(live);
    bindCopyButtons(live, app);
  }
  container.querySelector('[data-test-strava-setup]')?.removeAttribute('disabled');
  container.querySelector('[data-connect-strava-wizard]')?.removeAttribute('disabled');
  const badge = container.querySelector('[data-strava-wizard-badge]');
  if (badge) { badge.textContent = 'มี Worker URL แล้ว'; badge.className = 'status green'; app.localize(badge); }
  const progress = container.querySelector('[data-strava-progress]');
  if (progress) progress.style.width = '75%';
}

async function refreshStravaSetupStatus(container, state, app) {
  setWizardStatus(container, 'กำลังตรวจ Worker, KV และ Secrets…', false, app);
  const result = await fetchProviderSetupStatus(state.settings);
  const kvReady = Object.values(result.kv || {}).every(Boolean);
  const secretsReady = Boolean(result.providers?.strava?.ready);
  updateSetupCheck(container, 'appOrigin', Boolean(result.appOrigin));
  updateSetupCheck(container, 'kv', kvReady);
  updateSetupCheck(container, 'secrets', secretsReady);
  updateSetupCheck(container, 'ready', Boolean(result.ready));
  const progress = container.querySelector('[data-strava-progress]');
  if (progress) progress.style.width = result.ready ? '100%' : '75%';
  setWizardStatus(container, result.ready ? 'Worker พร้อมแล้ว — ตั้ง Callback Domain ใน Strava แล้วกด Connect Strava' : 'Worker ยังตั้งค่าไม่ครบ ตรวจจุดสีแดงด้านล่าง', !result.ready, app);
  if (result.ready) await refreshConnectionStatus(container, state, app).catch(() => {});
  return result;
}

function updateSetupCheck(container, key, ready) {
  const element = container.querySelector(`[data-setup-check="${key}"]`);
  if (!element) return;
  element.classList.toggle('ready', ready);
  element.classList.toggle('missing', !ready);
}

async function refreshConnectionStatus(container, state, app) {
  setStatus(container, 'กำลังตรวจสถานะ Worker…', false, app);
  const result = await fetchProviderConnections(state.settings);
  await updateConnectionSnapshot(app.store, result);
  refreshConnectionsSyncUi(container, app.store.getState(), app);
  setStatus(container, 'ตรวจสถานะสำเร็จ', false, app);
}


function syncCenter(syncState, language) {
  const online = globalThis.navigator?.onLine !== false;
  const queued = syncState.queue.filter(item => item.status === 'queued');
  const failed = syncState.queue.filter(item => item.status === 'failed');
  const lastRun = syncState.autoSync.lastRunAt ? formatSyncTime(syncState.autoSync.lastRunAt, language) : 'ยังไม่เคยทำงาน';
  return `<section class="section sync-center">
    <div class="section-head">
      <div><div class="eyebrow">SYNC CONTROL</div><h2>Auto Sync & Retry</h2></div>
      <span class="status ${online ? 'green' : 'yellow'}">${online ? 'ออนไลน์' : 'ออฟไลน์'}</span>
    </div>
    <article class="card flat sync-control-card">
      <div class="sync-control-row">
        <label class="check-row"><input type="checkbox" data-auto-sync-toggle ${syncState.autoSync.enabled ? 'checked' : ''}><span>Sync อัตโนมัติเมื่อเปิดแอปหรือกลับมาออนไลน์</span></label>
        <label class="field compact-field"><span>ช่วงเวลา</span><select data-auto-sync-interval>
          ${[15,30,60,120].map(value => `<option value="${value}" ${Number(syncState.autoSync.intervalMin) === value ? 'selected' : ''}>${value} นาที</option>`).join('')}
        </select></label>
      </div>
      <div class="sync-summary-strip">
        <div><small>Auto Sync ล่าสุด</small><strong>${escapeHtml(lastRun)}</strong></div>
        <div><small>รอ Retry</small><strong>${queued.length}</strong></div>
        <div><small>ต้องจัดการเอง</small><strong>${failed.length}</strong></div>
      </div>
      <div class="button-row">
        <button class="button primary" type="button" data-sync-all-now>Sync ที่เชื่อมต่อทั้งหมด</button>
        <button class="button secondary" type="button" data-retry-sync-now ${syncState.queue.length ? '' : 'disabled'}>Retry ตอนนี้</button>
        <button class="button ghost" type="button" data-clear-retry ${syncState.queue.length ? '' : 'disabled'}>ล้างคิว</button>
      </div>
    </article>
    ${syncState.queue.length ? `<div class="sync-queue-list">${syncState.queue.map(item => syncQueueRow(item, language)).join('')}</div>` : '<div class="callout good">ไม่มีรายการค้างใน Retry Queue</div>'}
  </section>`;
}

function syncQueueRow(item, language) {
  const english = language === 'en';
  const next = item.nextRetryAt ? formatSyncTime(item.nextRetryAt, language) : (english ? 'Automatic retry has stopped' : 'หยุด Retry อัตโนมัติแล้ว');
  const attempt = english ? `Attempt ${Number(item.attempts || 0)}/5` : `ครั้งที่ ${Number(item.attempts || 0)}/5`;
  return `<article class="list-item sync-queue-item">
    <span class="sync-queue-icon">↻</span>
    <div class="grow"><strong>${escapeHtml(PROVIDER_DEFINITIONS[item.provider]?.label || item.provider)}</strong><small>${escapeHtml(item.lastError || 'Sync failed')}</small><small>${escapeHtml(next)} · ${escapeHtml(attempt)}</small></div>
    <span class="status ${item.status === 'failed' ? 'red' : 'yellow'}">${item.status === 'failed' ? 'ต้องกด Retry' : 'รอ Retry'}</span>
  </article>`;
}

function providerStatus(syncInfo, fallback) {
  const status = syncInfo?.status || 'idle';
  const labels = {
    syncing: ['กำลัง Sync', 'neutral'],
    success: ['Sync สำเร็จ', 'green'],
    queued: ['รอ Retry', 'yellow'],
    failed: ['Sync ล้มเหลว', 'red'],
    error: ['มีข้อผิดพลาด', 'red'],
    auth_error: ['เชื่อมต่อใหม่', 'red'],
    not_connected: ['ยังไม่เชื่อมต่อ', 'yellow'],
    pending: ['รอเปิด API', 'yellow'],
    idle: [fallback?.status || (fallback?.connected ? 'พร้อม Sync' : 'ยังไม่เชื่อมต่อ'), fallback?.connected ? 'green' : 'yellow']
  };
  const [label, className] = labels[status] || labels.idle;
  return { label, className };
}

function syncResultSummary(result = {}, language = 'th') {
  const english = language === 'en';
  const parts = [];
  if (Number(result.checkins)) parts.push(english ? `${result.checkins} days` : `${result.checkins} วัน`);
  if (Number(result.fetched)) parts.push(english ? `${result.fetched} fetched` : `พบ ${result.fetched}`);
  if (Number(result.added)) parts.push(english ? `${result.added} added` : `เพิ่ม ${result.added}`);
  if (Number(result.updated)) parts.push(english ? `${result.updated} updated` : `อัปเดต ${result.updated}`);
  if (Number(result.merged)) parts.push(english ? `${result.merged} merged` : `รวมซ้ำ ${result.merged}`);
  if (Number(result.review)) parts.push(english ? `${result.review} review` : `รอตรวจ ${result.review}`);
  return parts.join(' · ') || (english ? 'No new data' : 'ไม่มีข้อมูลใหม่');
}

function formatSyncTime(value, language = 'th') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'th-TH', {
    dateStyle: 'medium', timeStyle: 'short'
  }).format(date);
}

function bindSyncCenterActions(container, app) {
  container.querySelector('[data-auto-sync-toggle]')?.addEventListener('change', async event => {
    await setAutoSyncPreferences(app.store, { enabled: event.currentTarget.checked });
    app.toast(event.currentTarget.checked ? 'เปิด Auto Sync แล้ว' : 'ปิด Auto Sync แล้ว');
    refreshConnectionsSyncUi(container, app.store.getState(), app);
  });
  container.querySelector('[data-auto-sync-interval]')?.addEventListener('change', async event => {
    await setAutoSyncPreferences(app.store, { intervalMin: Number(event.currentTarget.value) });
    app.toast('บันทึกช่วงเวลา Auto Sync แล้ว');
    refreshConnectionsSyncUi(container, app.store.getState(), app);
  });
  container.querySelector('[data-sync-all-now]')?.addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    setStatus(container, 'กำลัง Sync ทุก Provider ที่เชื่อมต่อ…', false, app);
    try {
      const outcome = await runAutoSync(app.store, { force: true, reason: 'manual_all' });
      const succeeded = outcome.results.filter(item => item.ok).length;
      const failed = outcome.results.length - succeeded;
      app.toast(`Sync เสร็จ ${succeeded}${failed ? ` · ไม่สำเร็จ ${failed}` : ''}`);
    } catch (error) { setStatus(container, error.message, true, app); }
    refreshConnectionsSyncUi(container, app.store.getState(), app);
  });
  container.querySelector('[data-retry-sync-now]')?.addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    const results = await retryQueuedSyncs(app.store, { force: true });
    const succeeded = results.filter(item => item.ok).length;
    app.toast(`Retry เสร็จ ${succeeded}/${results.length}`);
    refreshConnectionsSyncUi(container, app.store.getState(), app);
  });
  container.querySelector('[data-clear-retry]')?.addEventListener('click', async () => {
    await clearRetryQueue(app.store);
    app.toast('ล้าง Retry Queue แล้ว');
    refreshConnectionsSyncUi(container, app.store.getState(), app);
  });
}

export function refreshConnectionsSyncUi(container, state, app) {
  if (!container?.querySelector) return;
  const syncState = getSyncState(state);
  const shell = container.querySelector('[data-sync-center-shell]');
  if (shell) {
    shell.innerHTML = syncCenter(syncState, app?.language || 'th');
    app?.localize(shell);
    bindSyncCenterActions(container, app);
  }
  for (const provider of Object.keys(syncState.providers)) {
    const info = syncState.providers[provider];
    const label = container.querySelector(`[data-provider-status="${provider}"]`);
    if (label) {
      const status = providerStatus(info, { connected: info.connected });
      label.textContent = status.label;
      label.className = `status ${status.className}`;
      app?.localize(label);
    }
    const meta = container.querySelector(`[data-provider-sync-meta="${provider}"]`);
    if (meta) {
      meta.innerHTML = `<small><strong>Sync ล่าสุด</strong><span>${escapeHtml(info.lastSuccessAt ? formatSyncTime(info.lastSuccessAt, app?.language || 'th') : 'ยังไม่เคย Sync')}</span></small>
        ${info.lastResult ? `<small><strong>ผลล่าสุด</strong><span>${escapeHtml(syncResultSummary(info.lastResult, app?.language || 'th'))}</span></small>` : ''}
        ${info.lastError ? `<small class="sync-error"><strong>ปัญหาล่าสุด</strong><span>${escapeHtml(info.lastError)}</span></small>` : ''}
        ${info.nextRetryAt ? `<small class="sync-retry"><strong>คิว Retry</strong><span>${escapeHtml(formatSyncTime(info.nextRetryAt, app?.language || 'th'))}</span></small>` : ''}`;
      app?.localize(meta);
    }
    container.querySelectorAll(`[data-sync-provider="${provider}"]`).forEach(button => { button.disabled = !info.connected || info.status === 'syncing'; });
    container.querySelectorAll(`[data-disconnect-provider="${provider}"]`).forEach(button => { button.disabled = !info.connected; });
  }
}

function setWizardStatus(container, message, error = false, app = null) {
  const element = container.querySelector('#strava-setup-status');
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('error', error);
  element.classList.toggle('success', !error);
  app?.localize(element);
}

function setStatus(container, message, error = false, app = null) {
  const element = container.querySelector('#connection-status');
  if (!element) return;
  element.textContent = message;
  element.style.color = error ? 'var(--red)' : '';
  app?.localize(element);
}

function inferWorkerUrl(appOrigin, workerName) {
  try {
    const app = new URL(appOrigin);
    const parts = app.hostname.split('.');
    if (parts.length >= 3 && parts.slice(-2).join('.') === 'workers.dev') {
      return `https://${workerName}.${parts.slice(1).join('.')}`;
    }
  } catch { /* no prediction */ }
  return '';
}

function step(number, title, detail) {
  return `<article class="list-item"><div class="step-number">${number}</div><div class="grow"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div></article>`;
}
