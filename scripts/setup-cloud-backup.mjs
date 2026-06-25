#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLOUD_BACKUP_KV_BINDINGS,
  buildCloudBackupSetupReceipt,
  buildCloudBackupWorkerConfig,
  normalizeHttpsOrigin,
  normalizeWorkerName,
  parseWranglerWorkerUrl
} from './lib/cloud-backup-setup.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workerDir = resolve(root, 'workers/cloud-backup');
const configPath = resolve(workerDir, 'wrangler.jsonc');
const receiptPath = resolve(root, 'cloud-backup-setup-result.json');
const rl = createInterface({ input, output });

main().catch(error => {
  console.error(`\nSetup ไม่สำเร็จ: ${error.message}`);
  process.exitCode = 1;
}).finally(() => rl.close());

async function main() {
  ensureNode22();
  console.log('\nTrail Runner Coach — Encrypted Cloud Backup Setup');
  console.log('ระบบจะสร้าง Cloudflare KV และ Deploy Worker ที่เก็บเฉพาะข้อมูล Backup ที่เข้ารหัสแล้ว\n');

  const existing = await readExistingConfig();
  const appOrigin = normalizeHttpsOrigin(await ask('Trail Runner Coach Web App URL', existing?.vars?.APP_ORIGIN || ''));
  const workerName = normalizeWorkerName(await ask('Cloudflare Worker name', existing?.name || 'trail-runner-coach-cloud-backup'));
  await mkdir(workerDir, { recursive: true });
  await writeConfig(buildCloudBackupWorkerConfig({ appOrigin, workerName, existingConfig: existing || {} }));

  console.log('\n[1/3] ตรวจ Cloudflare login');
  let result = await runWrangler(['whoami'], { quietFailure: true });
  if (result.code !== 0) {
    result = await runWrangler(['login']);
    if (result.code !== 0) throw new Error('Cloudflare login ไม่สำเร็จ');
  }

  console.log('\n[2/3] เตรียม Cloudflare KV');
  for (const item of CLOUD_BACKUP_KV_BINDINGS) {
    const current = await readExistingConfig();
    if (current?.kv_namespaces?.some(row => row.binding === item.binding && /^[0-9a-f]{32}$/i.test(String(row.id || '')))) {
      console.log(`✓ ${item.binding} มีอยู่แล้ว`);
      continue;
    }
    const namespace = `${workerName}-${item.suffix}`;
    const create = await runWrangler([
      'kv', 'namespace', 'create', namespace,
      '--binding', item.binding,
      '--update-config',
      '--config', configPath
    ]);
    if (create.code !== 0) throw new Error(`สร้าง KV ${item.binding} ไม่สำเร็จ`);
  }

  console.log('\n[3/3] Deploy Cloud Backup Worker');
  const deploy = await runWrangler(['deploy', '--config', configPath]);
  if (deploy.code !== 0) throw new Error('Deploy Cloud Backup Worker ไม่สำเร็จ');
  let workerUrl = parseWranglerWorkerUrl(`${deploy.stdout}\n${deploy.stderr}`);
  if (!workerUrl) workerUrl = normalizeHttpsOrigin(await ask('กรุณาวาง Worker URL ที่ Cloudflare แสดง'));
  const receipt = buildCloudBackupSetupReceipt({ workerUrl, appOrigin, workerName });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

  console.log('\nSetup สำเร็จ');
  console.log(`Worker URL: ${receipt.workerUrl}`);
  console.log(`Health check: ${receipt.healthUrl}`);
  console.log(`สร้างไฟล์ผลลัพธ์แล้ว: ${receiptPath}`);
  console.log('เปิดแอป → บันทึก → ข้อมูล & Wearables → Encrypted Cloud Backup แล้ว Import ไฟล์นี้\n');
}

function ensureNode22() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) throw new Error(`ต้องใช้ Node.js 22 ขึ้นไป (ปัจจุบัน ${process.versions.node})`);
}
async function readExistingConfig() {
  if (!existsSync(configPath)) return null;
  try { return JSON.parse(await readFile(configPath, 'utf8')); }
  catch { throw new Error(`อ่าน ${configPath} ไม่ได้ กรุณาแก้ให้เป็น JSON ที่ถูกต้อง`); }
}
async function writeConfig(config) { await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8'); }
async function ask(label, defaultValue = '') {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  const value = (await rl.question(`${label}${suffix}: `)).trim();
  return value || defaultValue;
}
async function runWrangler(args, { quietFailure = false } = {}) {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  return new Promise(resolvePromise => {
    const child = spawn(executable, ['wrangler@4.103.0', ...args], { cwd: workerDir, stdio: ['inherit', 'pipe', 'pipe'], shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; output.write(chunk); });
    child.stderr.on('data', chunk => { stderr += chunk; if (!quietFailure) output.write(chunk); });
    child.on('close', code => resolvePromise({ code, stdout, stderr }));
  });
}
