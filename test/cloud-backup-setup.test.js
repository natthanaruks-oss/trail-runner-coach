import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCloudBackupSetupReceipt,
  buildCloudBackupWorkerConfig,
  normalizeHttpsOrigin,
  normalizeWorkerName,
  parseWranglerWorkerUrl
} from '../scripts/lib/cloud-backup-setup.mjs';

test('cloud backup setup validates origins and worker names', () => {
  assert.equal(normalizeHttpsOrigin('https://app.example.workers.dev/'), 'https://app.example.workers.dev');
  assert.equal(normalizeWorkerName('Trail-Runner-Backup'), 'trail-runner-backup');
  assert.throws(() => normalizeHttpsOrigin('http://example.com'), /https/);
  assert.throws(() => normalizeWorkerName('bad_name'), /Worker name/);
});

test('cloud backup worker config preserves valid KV bindings', () => {
  const config = buildCloudBackupWorkerConfig({
    appOrigin: 'https://app.example.workers.dev',
    workerName: 'trail-runner-cloud-backup',
    existingConfig: {
      kv_namespaces: [
        { binding: 'BACKUP_VAULTS', id: 'a'.repeat(32) },
        { binding: 'BROKEN', id: 'nope' }
      ]
    }
  });
  assert.equal(config.name, 'trail-runner-cloud-backup');
  assert.equal(config.vars.APP_ORIGIN, 'https://app.example.workers.dev');
  assert.deepEqual(config.kv_namespaces, [{ binding: 'BACKUP_VAULTS', id: 'a'.repeat(32) }]);
});

test('setup receipt contains no secrets', () => {
  const receipt = buildCloudBackupSetupReceipt({
    workerUrl: 'https://trail-runner-cloud-backup.account.workers.dev',
    appOrigin: 'https://trail-runner-coaches.account.workers.dev',
    workerName: 'trail-runner-cloud-backup'
  });
  assert.equal(receipt.containsSecrets, false);
  assert.equal(receipt.healthUrl, 'https://trail-runner-cloud-backup.account.workers.dev/health');
  assert.equal(parseWranglerWorkerUrl('Uploaded\nhttps://trail-runner-cloud-backup.account.workers.dev'), receipt.workerUrl);
});
