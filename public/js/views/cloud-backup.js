import { nowIso } from '../core/date.js';
import { reconcileStoredActivities } from '../adapters/activity-import.js';
import {
  applyRecoveryKit,
  backupNow,
  backupPreview,
  cloudBackupConfig,
  cloudBackupFilename,
  createEncryptedVault,
  decryptCloudBackup,
  deleteCloudBackupVersion,
  deleteCloudVault,
  exportRecoveryKit,
  forgetCloudBackupKey,
  getCloudVaultStatus,
  isCloudBackupConfigured,
  listCloudBackups,
  rememberCloudBackupKey,
  saveCloudBackupPreferences
} from '../adapters/cloud-backup.js';
import { parseRecoveryKit } from '../core/cloud-backup-crypto.js';
import { pageHeader, escapeHtml, emptyState, formatNumber } from './components.js';

export function renderCloudBackup(container, state, app) {
  const config = cloudBackupConfig(state.settings);
  const configured = isCloudBackupConfigured(state.settings);
  const unlocked = Boolean(config.rememberedKey);
  const runtime = app.ui.cloudBackup || {};
  const versions = Array.isArray(runtime.versions) ? runtime.versions : [];
  const status = runtime.status || null;
  const busy = Boolean(runtime.busy);
  if (configured && !runtime.loaded && !runtime.loading) {
    app.ui.cloudBackup = { ...runtime, loading: true };
    queueMicrotask(async () => {
      try { await loadCloudBackups(app); }
      catch (error) { app.ui.cloudBackup = { ...(app.ui.cloudBackup || {}), loaded: true, loading: false, loadError: error.message }; }
      if (location.hash.startsWith('#/cloud-backup')) app.render();
    });
  }

  container.innerHTML = `
    ${pageHeader('Encrypted Cloud Backup', 'เข้ารหัสบนอุปกรณ์ก่อนส่งขึ้น Cloudflare และ Server อ่านข้อมูลสุขภาพไม่ได้', 'Zero-knowledge backup vault')}
    <section class="cloud-backup-hero ${configured ? 'ready' : ''}">
      <div>
        <span class="eyebrow">${configured ? 'Vault connected' : 'Not configured'}</span>
        <h2>${configured ? 'ข้อมูลถูกเข้ารหัสก่อนออกจากเครื่อง' : 'สร้าง Vault ส่วนตัวสำหรับสำรองข้อมูล'}</h2>
        <p>${configured ? 'Cloudflare เก็บเฉพาะ encrypted blob, metadata ขั้นต่ำ และ token hash เท่านั้น' : 'ต้อง Deploy Cloud Backup Worker ก่อน จากนั้นสร้าง Vault และเก็บ Recovery Kit ไว้ในที่ปลอดภัย'}</p>
      </div>
      <div class="cloud-lock" aria-hidden="true">${configured ? '🔐' : '☁️'}</div>
    </section>

    ${configured ? configuredView(config, status, versions, unlocked, busy, runtime.loadError || '') : setupView(runtime)}

    <div class="callout security-callout"><strong>สำคัญ:</strong> ระบบไม่เก็บ Passphrase และไม่สามารถ Reset ให้ได้ หากลืม Passphrase จะเปิด Backup เดิมไม่ได้ แม้ยังมี Recovery Kit</div>`;

  bindSetupEvents(container, state, app);
  bindConfiguredEvents(container, state, app);
}

function setupView(runtime) {
  return `<section class="section">
    <div class="section-head"><h2>1. เตรียม Cloud Backup Worker</h2><span>ทำครั้งเดียว</span></div>
    <article class="card flat">
      <p class="submetric">หลังอัปโหลดโปรเจกต์ ให้รันคำสั่งนี้จากโฟลเดอร์หลักบนเครื่องที่มี Node.js 22+</p>
      <div class="code-copy-row"><code>npm run setup:backup</code><button class="button secondary compact" data-copy="npm run setup:backup">คัดลอก</button></div>
      <p class="submetric">คำสั่งจะสร้าง Cloudflare KV, Deploy Worker และสร้างไฟล์ <code>cloud-backup-setup-result.json</code></p>
      <input id="backup-worker-receipt" type="file" accept=".json" hidden>
      <div class="button-row"><button class="button secondary" data-action="import-backup-worker">Import setup result</button></div>
    </article>
  </section>
  <section class="section">
    <div class="section-head"><h2>2. สร้าง Encrypted Vault</h2><span>Passphrase ไม่ออกจาก Browser</span></div>
    <form id="cloud-vault-create" class="card flat">
      <div class="form-grid">
        <div class="field full"><label>Cloud Backup Worker URL</label><input name="baseUrl" type="url" required placeholder="https://trail-runner-coach-cloud-backup.xxxxx.workers.dev" value="${escapeHtml(runtime.pendingBaseUrl || '')}"></div>
        <div class="field"><label>Passphrase</label><input name="passphrase" type="password" minlength="12" autocomplete="new-password" required placeholder="อย่างน้อย 12 ตัวอักษร"></div>
        <div class="field"><label>ยืนยัน Passphrase</label><input name="confirmPassphrase" type="password" minlength="12" autocomplete="new-password" required></div>
        <div class="field"><label>เก็บย้อนหลัง</label><select name="retention"><option value="5">5 versions</option><option value="10" selected>10 versions</option><option value="20">20 versions</option><option value="30">30 versions</option></select></div>
        <label class="check-row field"><input name="rememberKey" type="checkbox" checked><span>Remember encryption key on this device เพื่อ Backup อัตโนมัติ</span></label>
      </div>
      <button class="button primary full" ${runtime.busy ? 'disabled' : ''}>${runtime.busy ? 'กำลังสร้าง Vault…' : 'สร้าง Vault และดาวน์โหลด Recovery Kit'}</button>
    </form>
  </section>
  <section class="section">
    <div class="section-head"><h2>มี Vault อยู่แล้ว</h2><span>เชื่อมเครื่องใหม่</span></div>
    <article class="card flat">
      <input id="recovery-kit-file" type="file" accept=".json" hidden>
      <div class="button-row"><button class="button secondary" data-action="import-recovery-kit">เลือก Recovery Kit</button></div>
      <div id="recovery-kit-connect" class="hidden" style="margin-top:14px"></div>
    </article>
  </section>`;
}

function configuredView(config, status, versions, unlocked, busy, loadError) {
  return `<section class="grid three cloud-backup-stats">
    ${statCard('Vault', shortVaultId(config.vaultId), 'Connected', 'mint')}
    ${statCard('Last backup', config.lastBackupAt ? formatTimestamp(config.lastBackupAt) : '—', `${config.lastBackupRecordCount || 0} records`, 'blue')}
    ${statCard('Encryption key', unlocked ? 'Remembered' : 'Locked', unlocked ? 'Auto backup available' : 'Passphrase required', unlocked ? 'mint' : 'amber')}
  </section>

  <section class="section">
    <div class="section-head"><h2>Backup ตอนนี้</h2><span>${status?.backupCount ?? versions.length} versions บน Cloud</span></div>
    <article class="card flat">
      ${!unlocked ? `<div class="field"><label>Passphrase</label><input id="cloud-backup-passphrase" type="password" autocomplete="current-password" placeholder="ใช้เฉพาะใน Browser เพื่อเข้ารหัส/ถอดรหัส"></div>` : '<div class="status green">Encryption key พร้อมใช้งานบนอุปกรณ์นี้</div>'}
      <div class="button-row" style="margin-top:14px">
        <button class="button primary" data-action="backup-now" ${busy ? 'disabled' : ''}>${busy ? 'กำลัง Backup…' : 'Backup encrypted data now'}</button>
        <button class="button secondary" data-action="refresh-backups" ${busy ? 'disabled' : ''}>Refresh versions</button>
      </div>
      ${config.lastBackupError ? `<div class="status red" style="margin-top:12px">${escapeHtml(config.lastBackupError)}</div>` : ''}${loadError ? `<div class="status red" style="margin-top:12px">${escapeHtml(loadError)}</div>` : ''}
    </article>
  </section>

  <section class="section">
    <div class="section-head"><h2>Auto Backup</h2><span>ทำงานเมื่อเปิดแอปหรือกลับมาออนไลน์</span></div>
    <form id="cloud-backup-preferences" class="card flat">
      <div class="form-grid">
        <label class="check-row field"><input name="autoBackupEnabled" type="checkbox" ${config.autoBackupEnabled ? 'checked' : ''} ${unlocked ? '' : 'disabled'}><span>เปิด Auto Backup</span></label>
        <div class="field"><label>ความถี่</label><select name="autoBackupHours" ${unlocked ? '' : 'disabled'}>${[6,12,24,48,72,168].map(value => `<option value="${value}" ${config.autoBackupHours===value?'selected':''}>${value === 168 ? 'ทุก 7 วัน' : `ทุก ${value} ชั่วโมง`}</option>`).join('')}</select></div>
        <div class="field"><label>เก็บย้อนหลัง</label><select name="retention">${[5,10,20,30].map(value => `<option value="${value}" ${config.retention===value?'selected':''}>${value} versions</option>`).join('')}</select></div>
      </div>
      <div class="button-row" style="margin-top:12px"><button class="button secondary">บันทึกการตั้งค่า</button>${unlocked ? '<button class="button ghost" type="button" data-action="forget-backup-key">ลืม Encryption Key ในเครื่องนี้</button>' : '<button class="button secondary" type="button" data-action="remember-backup-key">Remember Key</button>'}</div>
      <div class="submetric" style="margin-top:10px">Browser/PWA ที่ปิดสนิทไม่สามารถทำงานเบื้องหลังได้ ระบบจะ Backup เมื่อเปิดแอปและถึงรอบที่กำหนด</div>
    </form>
  </section>

  <section class="section">
    <div class="section-head"><h2>Backup Versions</h2><span>Restore แบบ Merge หรือ Replace</span></div>
    <div id="cloud-backup-version-list" class="list">${versions.length ? versions.map(versionRow).join('') : emptyState('ยังไม่มี Cloud Backup หรือยังไม่ได้ Refresh')}</div>
  </section>

  <section class="section">
    <div class="section-head"><h2>Recovery & Security</h2><span>เก็บ Recovery Kit นอกอุปกรณ์</span></div>
    <article class="card flat">
      <div class="button-row"><button class="button secondary" data-action="download-recovery-kit">ดาวน์โหลด Recovery Kit อีกครั้ง</button><button class="button ghost" data-action="disconnect-vault">ตัดการเชื่อมต่อในเครื่องนี้</button><button class="button danger" data-action="delete-vault">ลบ Vault และ Backup ทั้งหมด</button></div>
      <div class="submetric" style="margin-top:10px">Recovery Kit มี Vault ID และ Access Token แต่ไม่มี Passphrase กรุณาเก็บเป็นความลับ</div>
    </article>
  </section>`;
}

function bindSetupEvents(container, state, app) {
  container.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    await navigator.clipboard?.writeText(button.dataset.copy).catch(() => {});
    app.toast('คัดลอกแล้ว');
  }));

  const setupFile = container.querySelector('#backup-worker-receipt');
  container.querySelector('[data-action="import-backup-worker"]')?.addEventListener('click', () => setupFile?.click());
  setupFile?.addEventListener('change', async () => {
    const file = setupFile.files?.[0]; if (!file) return;
    try {
      const receipt = JSON.parse(await file.text());
      if (receipt.format !== 'trail-runner-coach-cloud-backup-setup' || !receipt.workerUrl) throw new Error('Setup result ไม่ถูกต้อง');
      app.ui.cloudBackup = { ...(app.ui.cloudBackup || {}), pendingBaseUrl: receipt.workerUrl };
      app.toast('นำเข้า Worker URL แล้ว');
      app.render();
    } catch (error) { app.toast(error.message || 'อ่าน Setup result ไม่สำเร็จ'); }
  });

  const createForm = container.querySelector('#cloud-vault-create');
  createForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(createForm);
    const passphrase = String(data.get('passphrase') || '');
    if (passphrase !== String(data.get('confirmPassphrase') || '')) return app.toast('Passphrase ทั้งสองช่องไม่ตรงกัน');
    app.ui.cloudBackup = { ...(app.ui.cloudBackup || {}), busy: true, pendingBaseUrl: data.get('baseUrl') };
    app.render();
    try {
      const result = await createEncryptedVault({
        store: app.store,
        baseUrl: data.get('baseUrl'),
        passphrase,
        retention: Number(data.get('retention')),
        rememberKey: data.has('rememberKey')
      });
      downloadJson(result.recoveryKit, cloudBackupFilename());
      app.toast('สร้าง Vault แล้ว กรุณาเก็บ Recovery Kit และ Passphrase ให้ปลอดภัย');
      app.ui.cloudBackup = { busy: false, versions: [], status: result.response };
      await loadCloudBackups(app);
      app.render();
    } catch (error) {
      app.ui.cloudBackup = { ...(app.ui.cloudBackup || {}), busy: false };
      app.toast(error.message || 'สร้าง Vault ไม่สำเร็จ');
      app.render();
    }
  });

  const kitFile = container.querySelector('#recovery-kit-file');
  container.querySelector('[data-action="import-recovery-kit"]')?.addEventListener('click', () => kitFile?.click());
  kitFile?.addEventListener('change', async () => {
    const file = kitFile.files?.[0]; if (!file) return;
    try {
      const kit = parseRecoveryKit(await file.text());
      const box = container.querySelector('#recovery-kit-connect');
      box.classList.remove('hidden');
      box.innerHTML = `<form id="recovery-kit-connect-form"><div class="form-grid"><div class="field"><label>Passphrase</label><input name="passphrase" type="password" minlength="12" required></div><label class="check-row field"><input name="rememberKey" type="checkbox" checked><span>Remember encryption key on this device</span></label></div><button class="button primary full">เชื่อม Vault ${escapeHtml(shortVaultId(kit.vaultId))}</button></form>`;
      app.localize(box);
      box.querySelector('form').addEventListener('submit', async event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        try {
          await applyRecoveryKit({ store: app.store, recoveryKit: kit, passphrase: data.get('passphrase'), rememberKey: data.has('rememberKey') });
          app.ui.cloudBackup = {};
          await loadCloudBackups(app);
          app.toast('เชื่อม Cloud Backup Vault แล้ว');
          app.render();
        } catch (error) { app.toast(error.message || 'เชื่อม Vault ไม่สำเร็จ'); }
      });
    } catch (error) { app.toast(error.message || 'Recovery Kit ไม่ถูกต้อง'); }
  });
}

function bindConfiguredEvents(container, state, app) {
  if (!isCloudBackupConfigured(state.settings)) return;
  container.querySelector('[data-action="backup-now"]')?.addEventListener('click', async () => {
    const passphrase = container.querySelector('#cloud-backup-passphrase')?.value || '';
    setBusy(app, true);
    try {
      const result = await backupNow({ store: app.store, passphrase });
      app.toast(`Encrypted backup สำเร็จ ${result.envelope.recordCount} records`);
      await loadCloudBackups(app);
    } catch (error) { app.toast(error.message || 'Backup ไม่สำเร็จ'); }
    finally { setBusy(app, false); app.render(); }
  });

  container.querySelector('[data-action="refresh-backups"]')?.addEventListener('click', async () => {
    try { await loadCloudBackups(app); app.toast('อัปเดตรายการ Backup แล้ว'); app.render(); }
    catch (error) { app.toast(error.message || 'โหลดรายการ Backup ไม่สำเร็จ'); }
  });

  container.querySelector('#cloud-backup-preferences')?.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await saveCloudBackupPreferences(app.store, {
        autoBackupEnabled: data.has('autoBackupEnabled'),
        autoBackupHours: Number(data.get('autoBackupHours')),
        retention: Number(data.get('retention'))
      });
      app.toast('บันทึกการตั้งค่า Cloud Backup แล้ว');
      app.render();
    } catch (error) { app.toast(error.message); }
  });

  container.querySelector('[data-action="remember-backup-key"]')?.addEventListener('click', () => promptRememberKey(app));
  container.querySelector('[data-action="forget-backup-key"]')?.addEventListener('click', async () => {
    await forgetCloudBackupKey(app.store); app.toast('ลืม Encryption Key ในเครื่องนี้แล้ว'); app.render();
  });
  container.querySelector('[data-action="download-recovery-kit"]')?.addEventListener('click', () => {
    downloadJson(exportRecoveryKit(app.store.getState().settings), cloudBackupFilename());
    app.toast('ดาวน์โหลด Recovery Kit แล้ว');
  });
  container.querySelector('[data-action="disconnect-vault"]')?.addEventListener('click', async () => {
    if (!confirm('ตัดการเชื่อมต่อ Vault ในเครื่องนี้? Backup บน Cloud จะยังอยู่')) return;
    await deleteCloudVault({ store: app.store, deleteRemote: false });
    app.ui.cloudBackup = {};
    app.toast('ตัดการเชื่อมต่อแล้ว');
    app.render();
  });
  container.querySelector('[data-action="delete-vault"]')?.addEventListener('click', async () => {
    if (!confirm('ลบ Vault และ Backup ทุก Version แบบถาวร? การกระทำนี้ย้อนกลับไม่ได้')) return;
    if (!confirm('ยืนยันอีกครั้ง: ลบ Encrypted Cloud Backup ทั้งหมด')) return;
    try {
      await deleteCloudVault({ store: app.store, deleteRemote: true });
      app.ui.cloudBackup = {};
      app.toast('ลบ Vault และ Backup ทั้งหมดแล้ว');
      app.render();
    } catch (error) { app.toast(error.message || 'ลบ Vault ไม่สำเร็จ'); }
  });

  container.querySelectorAll('[data-restore-backup]').forEach(button => button.addEventListener('click', () => openRestoreDialog(app, button.dataset.restoreBackup)));
  container.querySelectorAll('[data-delete-backup]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('ลบ Backup Version นี้?')) return;
    try { await deleteCloudBackupVersion(app.store.getState().settings, button.dataset.deleteBackup); await loadCloudBackups(app); app.toast('ลบ Backup Version แล้ว'); app.render(); }
    catch (error) { app.toast(error.message || 'ลบ Backup ไม่สำเร็จ'); }
  }));
}

async function promptRememberKey(app) {
  app.openModal('Remember Encryption Key', `<form id="remember-cloud-key"><div class="field"><label>Passphrase</label><input name="passphrase" type="password" minlength="12" required autocomplete="current-password"></div><div class="callout" style="margin:12px 0">Key จะเก็บเฉพาะใน IndexedDB ของอุปกรณ์นี้ เพื่อให้ Auto Backup ทำงานได้ Passphrase จะไม่ถูกเก็บ</div><button class="button primary full">Remember on this device</button></form>`);
  document.querySelector('#remember-cloud-key')?.addEventListener('submit', async event => {
    event.preventDefault();
    try { await rememberCloudBackupKey(app.store, new FormData(event.currentTarget).get('passphrase')); app.closeModal(); app.toast('Remember Encryption Key แล้ว'); app.render(); }
    catch (error) { app.toast(error.message); }
  });
}

async function openRestoreDialog(app, versionId) {
  const config = cloudBackupConfig(app.store.getState().settings);
  app.openModal('Restore Encrypted Backup', `<form id="restore-cloud-backup"><div class="field"><label>Passphrase</label><input name="passphrase" type="password" ${config.rememberedKey ? '' : 'required'} autocomplete="current-password" placeholder="${config.rememberedKey ? 'ใช้ Key ที่จำไว้ หรือใส่ Passphrase เพื่อแทนที่' : 'Passphrase ของ Vault'}"></div><button class="button primary full">ถอดรหัสและตรวจข้อมูล</button><div id="restore-preview" style="margin-top:14px"></div></form>`);
  const form = document.querySelector('#restore-cloud-backup');
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const previewBox = form.querySelector('#restore-preview');
    previewBox.innerHTML = '<div class="status yellow">กำลังดาวน์โหลดและถอดรหัสบนอุปกรณ์นี้…</div>';
    try {
      const result = await decryptCloudBackup({ settings: app.store.getState().settings, versionId, passphrase: new FormData(form).get('passphrase') });
      const preview = backupPreview(result.snapshot);
      previewBox.innerHTML = `<article class="card flat"><strong>Backup พร้อม Restore</strong><div class="grid three" style="margin-top:12px">${previewMetric('Records', preview.totalRecords)}${previewMetric('Activities', preview.activities)}${previewMetric('Food logs', preview.foodLogs)}${previewMetric('Check-ins', preview.checkins)}${previewMetric('Pain logs', preview.painLogs)}${previewMetric('Body records', preview.bodyComposition)}</div><div class="submetric" style="margin-top:10px">Exported ${escapeHtml(formatTimestamp(preview.exportedAt))} · App ${escapeHtml(preview.appVersion || 'unknown')}</div><div class="button-row" style="margin-top:14px"><button type="button" class="button secondary" data-restore-mode="merge">Merge กับข้อมูลปัจจุบัน</button><button type="button" class="button danger" data-restore-mode="replace">Replace ข้อมูลในเครื่องทั้งหมด</button></div></article>`;
      app.localize(previewBox);
      previewBox.querySelectorAll('[data-restore-mode]').forEach(button => button.addEventListener('click', async () => {
        const replace = button.dataset.restoreMode === 'replace';
        if (replace && !confirm('Replace จะล้างข้อมูลในเครื่องก่อน Restore ยืนยันหรือไม่?')) return;
        button.disabled = true;
        try {
          await app.store.db.importSnapshot(result.snapshot, { replace });
          await app.store.refreshAll();
          await reconcileStoredActivities(app.store, { force: true });
          await app.store.upsertRecord('metadata', { id: 'cloud_backup_restore', versionId, restoredAt: nowIso(), mode: replace ? 'replace' : 'merge' });
          app.closeModal();
          app.toast(replace ? 'Replace และ Restore สำเร็จ' : 'Merge และ Restore สำเร็จ');
          app.render();
        } catch (error) { app.toast(error.message || 'Restore ไม่สำเร็จ'); button.disabled = false; }
      }));
    } catch (error) { previewBox.innerHTML = `<div class="status red">${escapeHtml(error.message || 'ถอดรหัสไม่สำเร็จ')}</div>`; }
  });
}

async function loadCloudBackups(app) {
  const [status, list] = await Promise.all([
    getCloudVaultStatus(app.store.getState().settings),
    listCloudBackups(app.store.getState().settings)
  ]);
  app.ui.cloudBackup = { ...(app.ui.cloudBackup || {}), status, versions: list.backups || [], loaded: true, loading: false, loadError: '' };
  return app.ui.cloudBackup;
}

function setBusy(app, busy) { app.ui.cloudBackup = { ...(app.ui.cloudBackup || {}), busy }; }
function statCard(label, value, sub, tone) { return `<article class="card flat cloud-stat ${tone}"><div class="card-title">${escapeHtml(label)}</div><div class="metric compact-value">${escapeHtml(String(value))}</div><div class="submetric">${escapeHtml(sub)}</div></article>`; }
function previewMetric(label, value) { return `<div><small>${escapeHtml(label)}</small><strong>${formatNumber(value)}</strong></div>`; }
function versionRow(version) {
  return `<article class="list-item cloud-version-row"><div class="grow"><strong>${escapeHtml(formatTimestamp(version.createdAt))}</strong><small>${formatNumber(version.recordCount)} records · ${formatBytes(version.encryptedBytes)} · App ${escapeHtml(version.appVersion || '—')}</small><small>Version ${escapeHtml(version.versionId)}</small></div><div class="button-row"><button class="button primary compact" data-restore-backup="${escapeHtml(version.versionId)}">Restore</button><button class="button ghost compact" data-delete-backup="${escapeHtml(version.versionId)}">ลบ</button></div></article>`;
}
function shortVaultId(value) { const text = String(value || ''); return text.length > 18 ? `${text.slice(0, 10)}…${text.slice(-6)}` : text; }
function formatTimestamp(value) { if (!value) return '—'; try { return new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); } catch { return String(value); } }
function formatBytes(value) { const bytes = Number(value) || 0; if (bytes < 1024) return `${bytes} B`; if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`; return `${(bytes/1048576).toFixed(1)} MB`; }
function downloadJson(value, filename) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
