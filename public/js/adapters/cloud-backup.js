import { localDateKey, nowIso } from '../core/date.js';
import {
  buildRecoveryKit,
  decryptSnapshot,
  encryptSnapshot,
  generateVaultCredentials,
  normalizeHttpsOrigin,
  parseRecoveryKit,
  deriveBackupKeyMaterial
} from '../core/cloud-backup-crypto.js';

const BACKUP_EVENT = 'trail-runner-coach:cloud-backup-state';
let lifecycleInitialized = false;
let lifecycleTimer = null;
let lifecycleStore = null;
let lifecycleBusy = false;

export function cloudBackupConfig(settings) {
  const raw = settings?.integrations?.cloudBackup || {};
  return {
    baseUrl: raw.baseUrl || '',
    vaultId: raw.vaultId || '',
    accessToken: raw.accessToken || '',
    kdf: raw.kdf || null,
    rememberedKey: raw.rememberedKey || '',
    retention: clampRetention(raw.retention),
    autoBackupEnabled: Boolean(raw.autoBackupEnabled),
    autoBackupHours: clampAutoHours(raw.autoBackupHours),
    lastBackupAt: raw.lastBackupAt || null,
    lastBackupVersionId: raw.lastBackupVersionId || null,
    lastBackupRecordCount: Number(raw.lastBackupRecordCount) || 0,
    lastBackupError: raw.lastBackupError || '',
    lastAutoBackupAt: raw.lastAutoBackupAt || null,
    configuredAt: raw.configuredAt || null
  };
}

export function isCloudBackupConfigured(settings) {
  const config = cloudBackupConfig(settings);
  return Boolean(config.baseUrl && config.vaultId && config.accessToken && config.kdf);
}

export async function createEncryptedVault({ store, baseUrl, passphrase, retention = 10, rememberKey = false }) {
  const credentials = generateVaultCredentials();
  const origin = normalizeHttpsOrigin(baseUrl);
  const keyMaterial = await deriveBackupKeyMaterial(passphrase, credentials.kdf);
  const response = await apiRequest(origin, '/v1/vaults', {
    method: 'POST',
    body: {
      vaultId: credentials.vaultId,
      accessToken: credentials.accessToken,
      kdf: credentials.kdf,
      retention: clampRetention(retention)
    }
  });
  const patch = {
    integrations: {
      cloudBackup: {
        baseUrl: origin,
        vaultId: credentials.vaultId,
        accessToken: credentials.accessToken,
        kdf: credentials.kdf,
        rememberedKey: rememberKey ? keyMaterial : '',
        retention: clampRetention(retention),
        autoBackupEnabled: false,
        autoBackupHours: 24,
        lastBackupAt: null,
        lastBackupVersionId: null,
        lastBackupRecordCount: 0,
        lastBackupError: '',
        lastAutoBackupAt: null,
        configuredAt: nowIso()
      }
    }
  };
  await store.saveSettings(patch);
  dispatchBackupState({ type: 'vault-created', vaultId: credentials.vaultId });
  return {
    response,
    config: cloudBackupConfig(store.getState().settings),
    recoveryKit: buildRecoveryKit({ baseUrl: origin, ...credentials })
  };
}

export async function applyRecoveryKit({ store, recoveryKit, passphrase = '', rememberKey = false }) {
  const kit = parseRecoveryKit(recoveryKit);
  const keyMaterial = passphrase ? await deriveBackupKeyMaterial(passphrase, kit.kdf) : '';
  const remoteStatus = await getCloudVaultStatus({
    baseUrl: kit.baseUrl,
    vaultId: kit.vaultId,
    accessToken: kit.accessToken
  });
  await store.saveSettings({
    integrations: {
      cloudBackup: {
        baseUrl: kit.baseUrl,
        vaultId: kit.vaultId,
        accessToken: kit.accessToken,
        kdf: kit.kdf,
        rememberedKey: rememberKey ? keyMaterial : '',
        retention: clampRetention(remoteStatus.retention),
        autoBackupEnabled: false,
        autoBackupHours: 24,
        configuredAt: nowIso(),
        lastBackupError: ''
      }
    }
  });
  dispatchBackupState({ type: 'recovery-kit-applied', vaultId: kit.vaultId });
  return cloudBackupConfig(store.getState().settings);
}

export async function saveCloudBackupPreferences(store, patch) {
  const current = cloudBackupConfig(store.getState().settings);
  const next = {
    ...current,
    ...patch,
    retention: clampRetention(patch.retention ?? current.retention),
    autoBackupHours: clampAutoHours(patch.autoBackupHours ?? current.autoBackupHours)
  };
  if (next.autoBackupEnabled && !next.rememberedKey) throw new Error('Auto Backup ต้องเลือก Remember encryption key on this device ก่อน');
  if (current.baseUrl && current.vaultId && current.accessToken && next.retention !== current.retention) {
    await apiRequest(current.baseUrl, `/v1/vaults/${encodeURIComponent(current.vaultId)}`, {
      method: 'PATCH',
      token: current.accessToken,
      body: { retention: next.retention }
    });
  }
  await store.saveSettings({ integrations: { cloudBackup: next } });
  dispatchBackupState({ type: 'preferences-updated' });
  return next;
}

export async function rememberCloudBackupKey(store, passphrase) {
  const config = requireConfigured(store.getState().settings);
  const rememberedKey = await deriveBackupKeyMaterial(passphrase, config.kdf);
  await saveCloudBackupPreferences(store, { rememberedKey });
  return rememberedKey;
}

export async function forgetCloudBackupKey(store) {
  await saveCloudBackupPreferences(store, { rememberedKey: '', autoBackupEnabled: false });
}

export async function backupNow({ store, passphrase = '', reason = 'manual' }) {
  const config = requireConfigured(store.getState().settings);
  const keyMaterial = config.rememberedKey || '';
  if (!keyMaterial && !passphrase) throw new Error('กรุณาใส่ Passphrase เพื่อเข้ารหัส Backup');
  dispatchBackupState({ type: 'backup-started', reason });
  try {
    const snapshot = await store.db.exportSnapshot({ includeSensitive: true });
    const envelope = await encryptSnapshot(snapshot, {
      passphrase,
      keyMaterial,
      kdf: config.kdf
    });
    const result = await apiRequest(config.baseUrl, `/v1/vaults/${encodeURIComponent(config.vaultId)}/backups`, {
      method: 'POST',
      token: config.accessToken,
      body: envelope
    });
    const timestamp = nowIso();
    await saveCloudBackupPreferences(store, {
      lastBackupAt: timestamp,
      lastAutoBackupAt: reason === 'auto' ? timestamp : config.lastAutoBackupAt,
      lastBackupVersionId: result.versionId || null,
      lastBackupRecordCount: envelope.recordCount || 0,
      lastBackupError: ''
    });
    dispatchBackupState({ type: 'backup-succeeded', reason, result });
    return { ...result, envelope };
  } catch (error) {
    await saveCloudBackupPreferences(store, { lastBackupError: error.message || 'Backup failed' }).catch(() => {});
    dispatchBackupState({ type: 'backup-failed', reason, error: error.message });
    throw error;
  }
}

export async function listCloudBackups(settings) {
  const config = requireConfigured(settings);
  return apiRequest(config.baseUrl, `/v1/vaults/${encodeURIComponent(config.vaultId)}/backups`, {
    token: config.accessToken
  });
}

export async function getCloudVaultStatus(input) {
  const config = input?.baseUrl ? input : requireConfigured(input);
  return apiRequest(config.baseUrl, `/v1/vaults/${encodeURIComponent(config.vaultId)}`, {
    token: config.accessToken
  });
}

export async function downloadCloudBackup(settings, versionId) {
  const config = requireConfigured(settings);
  return apiRequest(config.baseUrl, `/v1/vaults/${encodeURIComponent(config.vaultId)}/backups/${encodeURIComponent(versionId)}`, {
    token: config.accessToken
  });
}

export async function decryptCloudBackup({ settings, versionId, passphrase = '' }) {
  const config = requireConfigured(settings);
  const payload = await downloadCloudBackup(config, versionId);
  const snapshot = await decryptSnapshot(payload.backup, {
    passphrase,
    keyMaterial: config.rememberedKey || ''
  });
  return { snapshot, metadata: payload.metadata || {} };
}

export async function deleteCloudBackupVersion(settings, versionId) {
  const config = requireConfigured(settings);
  return apiRequest(config.baseUrl, `/v1/vaults/${encodeURIComponent(config.vaultId)}/backups/${encodeURIComponent(versionId)}`, {
    method: 'DELETE',
    token: config.accessToken
  });
}

export async function deleteCloudVault({ store, deleteRemote = false }) {
  const config = requireConfigured(store.getState().settings);
  if (deleteRemote) {
    await apiRequest(config.baseUrl, `/v1/vaults/${encodeURIComponent(config.vaultId)}`, {
      method: 'DELETE',
      token: config.accessToken
    });
  }
  await store.saveSettings({
    integrations: {
      cloudBackup: {
        baseUrl: '', vaultId: '', accessToken: '', kdf: null, rememberedKey: '', retention: 10,
        autoBackupEnabled: false, autoBackupHours: 24, lastBackupAt: null, lastBackupVersionId: null,
        lastBackupRecordCount: 0, lastBackupError: '', lastAutoBackupAt: null, configuredAt: null
      }
    }
  });
  dispatchBackupState({ type: 'vault-disconnected', remoteDeleted: deleteRemote });
}

export function exportRecoveryKit(settings) {
  const config = requireConfigured(settings);
  return buildRecoveryKit(config);
}

export function cloudBackupFilename(prefix = 'trail-runner-coach-recovery-kit') {
  return `${prefix}-${localDateKey()}.json`;
}

export function initializeCloudBackupLifecycle(store) {
  if (lifecycleInitialized) return;
  lifecycleInitialized = true;
  lifecycleStore = store;
  const trigger = () => maybeRunAutomaticCloudBackup(store).catch(() => {});
  window.addEventListener('online', trigger);
  window.addEventListener('focus', trigger);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') trigger(); });
  lifecycleTimer = setInterval(trigger, 30 * 60 * 1000);
  lifecycleTimer?.unref?.();
  const initialTimer = setTimeout(trigger, 3000);
  initialTimer?.unref?.();
}

export function stopCloudBackupLifecycle() {
  if (lifecycleTimer) clearInterval(lifecycleTimer);
  lifecycleTimer = null;
  lifecycleStore = null;
  lifecycleInitialized = false;
}

export async function maybeRunAutomaticCloudBackup(store = lifecycleStore) {
  if (!store || lifecycleBusy || navigator.onLine === false) return { skipped: true, reason: 'unavailable' };
  const config = cloudBackupConfig(store.getState().settings);
  if (!isCloudBackupConfigured(store.getState().settings) || !config.autoBackupEnabled || !config.rememberedKey) {
    return { skipped: true, reason: 'disabled' };
  }
  const last = Date.parse(config.lastAutoBackupAt || config.lastBackupAt || 0);
  const dueMs = config.autoBackupHours * 60 * 60 * 1000;
  if (Number.isFinite(last) && Date.now() - last < dueMs) return { skipped: true, reason: 'not-due' };
  lifecycleBusy = true;
  try { return await backupNow({ store, reason: 'auto' }); }
  finally { lifecycleBusy = false; }
}

export function backupPreview(snapshot) {
  const stores = snapshot?.stores || {};
  const count = name => Array.isArray(stores[name]) ? stores[name].length : 0;
  return {
    exportedAt: snapshot.exportedAt || null,
    appVersion: snapshot.appVersion || null,
    totalRecords: Object.values(stores).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0),
    activities: count('activities'),
    checkins: count('checkins'),
    painLogs: count('painLogs'),
    workouts: count('workouts'),
    foodLogs: count('foodLogs'),
    bodyComposition: count('bodyComposition')
  };
}

function requireConfigured(settings) {
  const config = cloudBackupConfig(settings);
  if (!config.baseUrl || !config.vaultId || !config.accessToken || !config.kdf) throw new Error('Cloud Backup ยังไม่ได้ตั้งค่า');
  return config;
}

async function apiRequest(baseUrl, path, { method = 'GET', token = '', body = null } = {}) {
  const origin = normalizeHttpsOrigin(baseUrl);
  let response;
  try {
    response = await fetch(`${origin}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body == null ? {} : { 'content-type': 'application/json' })
      },
      body: body == null ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new Error('เชื่อม Cloud Backup Worker ไม่ได้ กรุณาตรวจอินเทอร์เน็ตและ Worker URL');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || `Cloud Backup request failed (${response.status})`);
    error.status = response.status;
    error.code = payload.code || null;
    throw error;
  }
  return payload;
}

function dispatchBackupState(detail) {
  globalThis.dispatchEvent?.(new CustomEvent(BACKUP_EVENT, { detail }));
}

function clampRetention(value) {
  const number = Number(value) || 10;
  return Math.max(3, Math.min(30, Math.round(number)));
}

function clampAutoHours(value) {
  const number = Number(value) || 24;
  return [6, 12, 24, 48, 72, 168].includes(number) ? number : 24;
}
