import { isAppleHealthAvailable, appleHealthConnectionMode } from '../adapters/apple-health.js';
import {
  PROVIDER_DEFINITIONS,
  fetchProviderConnections,
  getSyncBaseUrl,
  startProviderOAuth
} from '../adapters/provider-sync.js';
import {
  getSyncState,
  runAutoSync,
  syncProviderNow,
  updateConnectionSnapshot
} from '../adapters/sync-manager.js';
import { escapeHtml, pageHeader } from './components.js';

const PRIMARY_PROVIDERS = ['strava', 'google_health', 'apple_health'];
const FUTURE_PROVIDERS = ['garmin', 'suunto'];

export function renderConnectionsHome(container, state, app) {
  const en = app.language === 'en';
  const syncState = getSyncState(state);
  const configured = Boolean(getSyncBaseUrl(state.settings));
  const connectedCount = Object.values(syncState.providers).filter(item => item.connected === true).length;
  const lastSuccess = latestSuccess(syncState);
  const queued = syncState.queue.filter(item => item.status === 'queued').length;
  const failed = syncState.queue.filter(item => item.status === 'failed').length;

  container.innerHTML = `
    ${pageHeader(
      en ? 'Devices & Connections' : 'อุปกรณ์และการเชื่อมต่อ',
      en ? 'Connect once, then sync activities and health data from one simple screen.' : 'เชื่อมต่อครั้งเดียว แล้ว Sync กิจกรรมและข้อมูลสุขภาพจากหน้าที่เข้าใจง่าย',
      'SYNC CENTER'
    )}

    <section class="connection-overview card flat ${connectedCount ? 'ready' : ''}">
      <div class="connection-overview-copy">
        <span class="status ${configured ? 'green' : 'yellow'}">${configured ? (en ? 'Worker ready' : 'Worker พร้อม') : (en ? 'Setup required' : 'ต้องตั้งค่าก่อน')}</span>
        <h2>${connectedCount ? (en ? `${connectedCount} sources connected` : `เชื่อมต่อแล้ว ${connectedCount} แหล่ง`) : (en ? 'Connect your first source' : 'เริ่มเชื่อมต่อแหล่งข้อมูล')}</h2>
        <p>${lastSuccess ? `${en ? 'Last successful sync' : 'Sync สำเร็จล่าสุด'} ${escapeHtml(formatTime(lastSuccess, app.language))}` : (en ? 'No successful sync yet' : 'ยังไม่เคย Sync สำเร็จ')}</p>
      </div>
      <div class="connection-overview-actions">
        <button class="button primary" type="button" data-compact-sync-all ${connectedCount ? '' : 'disabled'}>${en ? 'Sync all' : 'Sync ทั้งหมด'}</button>
        <button class="button secondary" type="button" data-compact-refresh ${configured ? '' : 'disabled'}>${en ? 'Refresh status' : 'อัปเดตสถานะ'}</button>
      </div>
    </section>

    ${(queued || failed) ? `<div class="callout ${failed ? 'danger' : ''} section">${en ? 'Sync queue' : 'คิว Sync'}: ${queued} ${en ? 'waiting' : 'รายการรอ'}${failed ? ` · ${failed} ${en ? 'need attention' : 'รายการต้องจัดการ'}` : ''}</div>` : ''}

    <section class="section">
      <div class="section-head"><h2>${en ? 'Your data sources' : 'แหล่งข้อมูลของคุณ'}</h2><span>${en ? 'Tap only what you need' : 'เลือกเฉพาะที่ใช้งาน'}</span></div>
      <div class="provider-compact-grid">
        ${PRIMARY_PROVIDERS.map(provider => providerCompactCard(provider, syncState.providers[provider], configured, app.language, state.settings)).join('')}
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>${en ? 'Other providers' : 'อุปกรณ์อื่น'}</h2><span>${en ? 'Available after provider approval' : 'เปิดใช้เมื่อได้รับสิทธิ์จาก Provider'}</span></div>
      <div class="provider-mini-list">
        ${FUTURE_PROVIDERS.map(provider => providerMiniRow(provider, syncState.providers[provider], app.language)).join('')}
      </div>
    </section>

    <section class="section advanced-entry card flat">
      <div><div class="eyebrow">ADVANCED</div><h2>${en ? 'Setup & troubleshooting' : 'ตั้งค่าระบบและแก้ปัญหา'}</h2><p>${en ? 'Worker URL, Strava/Google setup wizard, KV, secrets and retry controls.' : 'Worker URL, Setup Wizard, KV, Secrets และ Retry Queue อยู่ในหน้าขั้นสูง'}</p></div>
      <a class="button secondary" href="#/connections">${en ? 'Open advanced settings' : 'เปิดการตั้งค่าขั้นสูง'}</a>
    </section>`;

  bindCompactActions(container, app);
}

function providerCompactCard(provider, syncInfo = {}, configured, language, settings) {
  const en = language === 'en';
  const def = PROVIDER_DEFINITIONS[provider];
  const appleReady = provider === 'apple_health' && isAppleHealthAvailable(settings);
  const connected = syncInfo.connected === true || appleReady;
  const syncing = syncInfo.status === 'syncing';
  const status = compactStatus(syncInfo, provider, language, appleReady);
  const lastSync = syncInfo.lastSuccessAt ? formatTime(syncInfo.lastSuccessAt, language) : (en ? 'Never synced' : 'ยังไม่เคย Sync');
  const icon = providerIcon(provider);
  const canConnect = provider !== 'apple_health' && configured;
  const appleMode = provider === 'apple_health' ? appleHealthConnectionMode(settings) : 'none';

  return `<article class="provider-compact-card card flat" data-compact-provider-card="${provider}">
    <div class="provider-compact-head">
      <span class="provider-icon" aria-hidden="true">${icon}</span>
      <span class="status ${status.className}">${escapeHtml(status.label)}</span>
    </div>
    <div class="provider-compact-copy">
      <h3>${escapeHtml(def.label)}</h3>
      <p>${escapeHtml(language === 'en' ? (def.dataEn || def.data) : def.data)}</p>
    </div>
    <div class="provider-compact-meta"><span>${en ? 'Last sync' : 'Sync ล่าสุด'}</span><strong>${escapeHtml(lastSync)}</strong></div>
    ${syncInfo.lastError ? `<div class="provider-inline-error">${escapeHtml(syncInfo.lastError)}</div>` : ''}
    <div class="provider-compact-actions">
      ${provider === 'apple_health'
        ? appleReady
          ? `<button class="button primary" type="button" data-compact-sync="apple_health" ${!syncing ? '' : 'disabled'}>${syncing ? (en ? 'Syncing…' : 'กำลัง Sync…') : (en ? 'Sync now' : 'Sync ตอนนี้')}</button><a class="button ghost" href="#/apple-health-shortcut">${appleMode === 'native' ? (en ? 'Details' : 'รายละเอียด') : (en ? 'Manage' : 'จัดการ')}</a>`
          : `<a class="button primary" href="#/apple-health-shortcut">${en ? 'Set up Apple Health' : 'ตั้งค่า Apple Health'}</a>`
        : connected
          ? `<button class="button primary" type="button" data-compact-sync="${provider}" ${syncing ? 'disabled' : ''}>${syncing ? (en ? 'Syncing…' : 'กำลัง Sync…') : (en ? 'Sync now' : 'Sync ตอนนี้')}</button>`
          : `<button class="button primary" type="button" data-compact-connect="${provider}" ${canConnect ? '' : 'disabled'}>${en ? 'Connect' : 'เชื่อมต่อ'}</button>`}
    </div>
  </article>`;
}

function providerMiniRow(provider, syncInfo = {}, language) {
  const en = language === 'en';
  const def = PROVIDER_DEFINITIONS[provider];
  const connected = syncInfo.connected === true;
  return `<article class="provider-mini-row">
    <span class="provider-icon small" aria-hidden="true">${providerIcon(provider)}</span>
    <div class="grow"><strong>${escapeHtml(def.label)}</strong><small>${connected ? (en ? 'Connected' : 'เชื่อมต่อแล้ว') : (en ? 'Not configured' : 'ยังไม่ได้ตั้งค่า')}</small></div>
    <a class="mini-link" href="#/connections">${en ? 'Manage' : 'จัดการ'}</a>
  </article>`;
}

function bindCompactActions(container, app) {
  container.querySelector('[data-compact-refresh]')?.addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    try {
      const result = await fetchProviderConnections(app.store.getState().settings);
      await updateConnectionSnapshot(app.store, result);
      app.toast(app.language === 'en' ? 'Connection status updated' : 'อัปเดตสถานะแล้ว');
      app.render();
    } catch (error) {
      app.toast(error.message || (app.language === 'en' ? 'Unable to refresh status' : 'อัปเดตสถานะไม่สำเร็จ'));
      event.currentTarget.disabled = false;
    }
  });

  container.querySelector('[data-compact-sync-all]')?.addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    try {
      const outcome = await runAutoSync(app.store, { force: true, reason: 'compact_manual_all' });
      const ok = outcome.results.filter(item => item.ok).length;
      app.toast(app.language === 'en' ? `Sync complete: ${ok}/${outcome.results.length}` : `Sync เสร็จ ${ok}/${outcome.results.length}`);
    } catch (error) {
      app.toast(error.message || (app.language === 'en' ? 'Sync failed' : 'Sync ไม่สำเร็จ'));
    }
    app.render();
  });

  container.querySelectorAll('[data-compact-connect]').forEach(button => button.addEventListener('click', () => {
    try { startProviderOAuth(button.dataset.compactConnect, app.store.getState().settings); }
    catch (error) { app.toast(error.message); }
  }));

  container.querySelectorAll('[data-compact-sync]').forEach(button => button.addEventListener('click', async () => {
    const provider = button.dataset.compactSync;
    button.disabled = true;
    button.textContent = app.language === 'en' ? 'Syncing…' : 'กำลัง Sync…';
    try {
      const outcome = await syncProviderNow(app.store, provider, { days: 90, trigger: 'compact_manual', resetRetry: true });
      const result = outcome.result || {};
      const count = Number(result.added || 0) + Number(result.updated || 0) + Number(result.merged || 0);
      app.toast(app.language === 'en' ? `Sync complete · ${count} changes` : `Sync สำเร็จ · เปลี่ยนแปลง ${count} รายการ`);
    } catch (error) {
      app.toast(error.message || (app.language === 'en' ? 'Sync failed' : 'Sync ไม่สำเร็จ'));
    }
    app.render();
  }));
}

function compactStatus(info = {}, provider, language, appleReady = false) {
  const en = language === 'en';
  if (info.status === 'syncing') return { label: en ? 'Syncing' : 'กำลัง Sync', className: 'neutral' };
  if (['failed', 'error', 'auth_error'].includes(info.status)) return { label: en ? 'Needs attention' : 'ต้องตรวจสอบ', className: 'red' };
  if (info.status === 'queued') return { label: en ? 'Retry queued' : 'รอ Retry', className: 'yellow' };
  if (info.connected === true || (provider === 'apple_health' && appleReady)) return { label: en ? 'Connected' : 'เชื่อมต่อแล้ว', className: 'green' };
  return { label: en ? 'Not connected' : 'ยังไม่เชื่อมต่อ', className: 'yellow' };
}

function latestSuccess(syncState) {
  const values = Object.values(syncState.providers)
    .map(item => item.lastSuccessAt)
    .filter(Boolean)
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  return values[0] || null;
}

function formatTime(value, language = 'th') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '—');
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'th-TH', {
    dateStyle: 'medium', timeStyle: 'short'
  }).format(date);
}

function providerIcon(provider) {
  return ({
    strava: 'S',
    google_health: 'G',
    apple_health: '♥',
    garmin: '△',
    suunto: 'S'
  })[provider] || '•';
}
