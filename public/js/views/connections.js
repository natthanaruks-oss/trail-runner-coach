import { STORES } from '../core/constants.js';
import { nowIso } from '../core/date.js';
import { importAppleHealthPayload, isAppleHealthBridgeAvailable, requestAppleHealthSync } from '../adapters/apple-health.js';
import {
  PROVIDER_DEFINITIONS, disconnectProvider, fetchProviderConnections,
  getSyncBaseUrl, startProviderOAuth, syncProviderActivities
} from '../adapters/provider-sync.js';
import { escapeHtml, pageHeader } from './components.js';

export function renderConnections(container, state, app, options = {}) {
  const baseUrl = getSyncBaseUrl(state.settings);
  const appleBridge = isAppleHealthBridgeAvailable();
  const callback = new URLSearchParams(location.hash.split('?')[1] || '');
  const callbackMessage = callback.get('connected') === '1'
    ? `เชื่อมต่อ ${callback.get('provider') || 'provider'} แล้ว`
    : callback.get('error') ? `เชื่อมต่อไม่สำเร็จ: ${callback.get('error')}` : '';

  const header = options.embedded ? '<div class="section-head"><h2>การเชื่อมต่อ</h2><span>Health & activity connections</span></div><p class="submetric">รวม Apple Health, Garmin, Suunto และ Strava โดยแปลงข้อมูลเข้าสู่ schema กลางก่อนคำนวณ Strain/Recovery</p>' : pageHeader('การเชื่อมต่อ','รวม Apple Health, Garmin, Suunto และ Strava โดยแปลงข้อมูลเข้าสู่ schema กลางก่อนคำนวณ Strain/Recovery','Health & activity connections');
  container.innerHTML = `${header}
    ${callbackMessage ? `<div class="callout ${callback.get('connected')==='1'?'good':'danger'}">${escapeHtml(callbackMessage)}</div>` : ''}
    <section class="connection-grid section">
      ${providerCard('apple_health', { connected: appleBridge, status: appleBridge ? 'พร้อม Sync' : 'ต้องใช้ iOS Companion' })}
      ${providerCard('garmin', { connected: false, status: baseUrl ? 'รอตรวจสถานะ' : 'ต้องตั้งค่า Worker' })}
      ${providerCard('suunto', { connected: false, status: baseUrl ? 'รอตรวจสถานะ' : 'ต้องตั้งค่า Worker' })}
      ${providerCard('strava', { connected: false, status: baseUrl ? 'รอตรวจสถานะ' : 'ต้องตั้งค่า Worker' })}
    </section>

    <section class="section">
      <div class="section-head"><h2>Wearable Sync Worker</h2><span>ใช้เฉพาะ Garmin / Suunto / Strava</span></div>
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
      <div class="section-head"><h2>ลำดับการเปิดใช้</h2><span>แนะนำทำทีละ Provider</span></div>
      <div class="list">
        ${step('1','Apple Health','Build iOS Companion ผ่าน Xcode, เปิด HealthKit capability, ติดตั้งบน iPhone แล้วกด Sync')}
        ${step('2','Strava','สร้าง Strava API Application, ตั้ง Callback Domain/Webhook แล้วใส่ Client ID/Secret ใน Worker')}
        ${step('3','Garmin','สมัคร Garmin Connect Developer Program และขอ Health + Activity API access ก่อนตั้ง OAuth credentials')}
        ${step('4','Suunto','สมัคร Suunto Partner Program, สร้าง OAuth app และ webhook endpoint')}
      </div>
    </section>
    <div class="callout">Apple Health ใช้ Native HealthKit bridge เป็นหลัก ส่วน Garmin, Suunto และ Strava ต้องผ่าน OAuth backend เพราะมี Client Secret และ refresh token ที่ไม่ควรอยู่ใน browser</div>`;

  bindActions(container, state, app, appleBridge);
  if (baseUrl) refreshConnectionStatus(container, state, app).catch(error => setStatus(container, error.message, true));
}

function providerCard(provider, info) {
  const def = PROVIDER_DEFINITIONS[provider];
  const cloud = def.type === 'cloud';
  return `<article class="card flat connection-card" data-provider-card="${provider}">
    <div class="connection-card-head"><div><div class="eyebrow">${cloud?'CLOUD OAUTH':'NATIVE HEALTHKIT'}</div><h2>${escapeHtml(def.label)}</h2></div><span class="status ${info.connected?'green':'yellow'}" data-provider-status="${provider}">${escapeHtml(info.status)}</span></div>
    <p class="submetric">${escapeHtml(def.data)}</p>
    <div class="button-row" style="margin-top:12px">
      ${provider==='apple_health'
        ? `<button class="button primary" data-apple-sync ${info.connected?'':'disabled'}>${info.connected?'Sync Apple Health':'เปิดผ่าน iOS Companion'}</button>`
        : `<button class="button primary" data-connect-provider="${provider}">เชื่อมต่อ</button><button class="button secondary" data-sync-provider="${provider}" disabled>Sync</button><button class="button danger" data-disconnect-provider="${provider}" disabled>ยกเลิก</button>`}
    </div>
  </article>`;
}

function bindActions(container, state, app, appleBridge) {
  container.querySelector('#sync-worker-form').addEventListener('submit', async event => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('syncBaseUrl').trim().replace(/\/$/, '');
    await app.store.saveSettings({ integrations: { syncBaseUrl: value } });
    app.toast('บันทึก Worker URL แล้ว');
    app.render();
  });
  container.querySelector('[data-refresh-connections]').addEventListener('click', () => refreshConnectionStatus(container, app.store.getState(), app).catch(error => setStatus(container, error.message, true)));
  container.querySelector('[data-apple-sync]')?.addEventListener('click', async event => {
    if (!appleBridge) return;
    event.currentTarget.disabled = true;
    setStatus(container, 'กำลังอ่าน Apple Health…');
    try {
      const payload = await requestAppleHealthSync({ days: 90 });
      const result = await importAppleHealthPayload(app.store, payload);
      app.toast(`Apple Health: ${result.checkins} วัน · ${result.activities} กิจกรรม`);
      app.render();
    } catch (error) {
      event.currentTarget.disabled = false;
      setStatus(container, error.message || 'Apple Health sync ไม่สำเร็จ', true);
    }
  });
  container.querySelectorAll('[data-connect-provider]').forEach(button => button.addEventListener('click', () => {
    try { startProviderOAuth(button.dataset.connectProvider, app.store.getState().settings); }
    catch (error) { app.toast(error.message); }
  }));
  container.querySelectorAll('[data-sync-provider]').forEach(button => button.addEventListener('click', async () => {
    const provider = button.dataset.syncProvider;
    button.disabled = true;
    setStatus(container, `กำลัง Sync ${provider}…`);
    try {
      const payload = await syncProviderActivities(provider, app.store.getState().settings, 90);
      const activities = Array.isArray(payload.activities) ? payload.activities : [];
      if (activities.length) await app.store.upsertMany(STORES.ACTIVITIES, activities.map(item => ({ ...item, importedAt: item.importedAt || nowIso() })));
      app.toast(`Sync ${provider}: ${activities.length} กิจกรรม`);
      app.render();
    } catch (error) { button.disabled = false; setStatus(container, error.message, true); }
  }));
  container.querySelectorAll('[data-disconnect-provider]').forEach(button => button.addEventListener('click', async () => {
    try {
      await disconnectProvider(button.dataset.disconnectProvider, app.store.getState().settings);
      app.toast('ยกเลิกการเชื่อมต่อแล้ว');
      app.render();
    } catch (error) { app.toast(error.message); }
  }));
}

async function refreshConnectionStatus(container, state) {
  setStatus(container, 'กำลังตรวจสถานะ Worker…');
  const result = await fetchProviderConnections(state.settings);
  for (const provider of ['garmin','suunto','strava']) {
    const connected = Boolean(result.providers?.[provider]?.connected);
    const label = container.querySelector(`[data-provider-status="${provider}"]`);
    if (label) { label.textContent = connected ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'; label.className = `status ${connected?'green':'yellow'}`; }
    const sync = container.querySelector(`[data-sync-provider="${provider}"]`);
    const disconnect = container.querySelector(`[data-disconnect-provider="${provider}"]`);
    if (sync) sync.disabled = !connected;
    if (disconnect) disconnect.disabled = !connected;
  }
  setStatus(container, 'ตรวจสถานะสำเร็จ');
}

function setStatus(container, message, error = false) {
  const element = container.querySelector('#connection-status');
  if (!element) return;
  element.textContent = message;
  element.style.color = error ? 'var(--red)' : '';
}
function step(number, title, detail) { return `<article class="list-item"><div class="step-number">${number}</div><div class="grow"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div></article>`; }
