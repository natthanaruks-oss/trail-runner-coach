#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APPLE_HEALTH_SHORTCUT_KV_BINDINGS,
  buildSetupReceipt,
  buildWorkerConfig,
  normalizeHttpsOrigin,
  normalizeWorkerName,
  parseWranglerWorkerUrl
} from './lib/apple-health-shortcut-setup.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workerDir = resolve(root, 'workers/apple-health-shortcut');
const configPath = resolve(workerDir, 'wrangler.jsonc');
const receiptPath = resolve(root, 'apple-health-shortcut-setup-result.local.json');
const headersPath = resolve(root, 'public/_headers');
const rl = createInterface({ input, output });

main().catch(error => {
  console.error(`\nSetup ไม่สำเร็จ: ${error.message}`);
  process.exitCode = 1;
}).finally(() => rl.close());

async function main() {
  ensureNode22();
  console.log('\nTrail Runner Coach — Apple Health Shortcuts Bridge Setup');
  console.log('ระบบจะสร้าง Worker แยกจาก Strava, สร้าง KV, สร้าง Token และเข้ารหัสข้อมูล Apple Health ก่อนเก็บใน Cloudflare\n');

  const existing = await readExistingConfig();
  const defaultOrigin = existing?.vars?.APP_ORIGIN || 'https://trail-runner-coachs.natthanaruk-s.workers.dev';
  const defaultWorkerName = existing?.name || 'trail-runner-coach-apple-health-sync';
  const appOrigin = normalizeHttpsOrigin(await ask('Trail Runner Coach Web App URL', defaultOrigin));
  const workerName = normalizeWorkerName(await ask('Cloudflare Worker name', defaultWorkerName));

  await mkdir(workerDir, { recursive: true });
  await writeFile(configPath, `${JSON.stringify(buildWorkerConfig({ appOrigin, workerName, existingConfig: existing || {} }), null, 2)}\n`, 'utf8');

  console.log('\n[1/4] ตรวจ Cloudflare login');
  let result = await runWrangler(['whoami'], { quietFailure: true });
  if (result.code !== 0) {
    console.log('ยังไม่ได้ login — กำลังเปิด Browser เพื่อยืนยัน Cloudflare');
    result = await runWrangler(['login']);
    if (result.code !== 0) throw new Error('Cloudflare login ไม่สำเร็จ');
  }

  console.log('\n[2/4] เตรียม Cloudflare KV');
  for (const item of APPLE_HEALTH_SHORTCUT_KV_BINDINGS) {
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

  console.log('\n[3/4] สร้าง Credential, ตั้ง Secret และ Deploy Worker');
  const accessToken = randomBytes(36).toString('base64url');
  const encryptionKey = randomBytes(32).toString('base64');
  const secretsPath = resolve(tmpdir(), `trail-runner-coach-apple-health-${process.pid}.json`);
  await writeFile(secretsPath, JSON.stringify({
    APPLE_HEALTH_BRIDGE_TOKEN: accessToken,
    APPLE_HEALTH_ENCRYPTION_KEY: encryptionKey
  }), { encoding: 'utf8', mode: 0o600 });
  await chmod(secretsPath, 0o600).catch(() => {});

  let deploy;
  try {
    deploy = await runWrangler(['deploy', '--config', configPath, '--secrets-file', secretsPath]);
  } finally {
    await unlink(secretsPath).catch(() => {});
  }
  if (deploy.code !== 0) throw new Error('Deploy Apple Health Shortcut Worker ไม่สำเร็จ');

  let workerUrl = parseWranglerWorkerUrl(`${deploy.stdout}\n${deploy.stderr}`);
  if (!workerUrl) workerUrl = normalizeHttpsOrigin(await ask('กรุณาวาง Worker URL ที่ Cloudflare แสดง'));
  const receipt = buildSetupReceipt({ workerUrl, appOrigin, workerName, accessToken });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await chmod(receiptPath, 0o600).catch(() => {});
  await allowWorkerInCsp(workerUrl);

  console.log('\n[4/4] Setup สำเร็จ');
  console.log(`Worker URL: ${receipt.workerUrl}`);
  console.log(`Import URL: ${receipt.importUrl}`);
  console.log(`\nสร้างไฟล์ลับแล้ว: ${receiptPath}`);
  console.log('ไฟล์นี้มี Bridge Token: ห้าม Commit, ห้ามส่งให้ผู้อื่น และควรลบหลังนำเข้าแอปกับสร้าง Shortcut เสร็จ');
  console.log('อัปเดต public/_headers เพื่ออนุญาต Worker แล้ว — Commit และ Push เฉพาะไฟล์ Source/Headers แต่ห้าม Commit ไฟล์ .local.json\n');
}

function ensureNode22() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) throw new Error(`ต้องใช้ Node.js 22 ขึ้นไป (ปัจจุบัน ${process.versions.node})`);
}
async function readExistingConfig() {
  if (!existsSync(configPath)) return null;
  try { return JSON.parse(await readFile(configPath, 'utf8')); }
  catch { throw new Error(`อ่าน ${configPath} ไม่ได้ กรุณาลบหรือแก้ให้เป็น JSON ที่ถูกต้อง`); }
}
async function ask(label, defaultValue = '') {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  const value = (await rl.question(`${label}${suffix}: `)).trim();
  return value || defaultValue;
}
async function allowWorkerInCsp(workerUrl) {
  if (!existsSync(headersPath)) return;
  const text = await readFile(headersPath, 'utf8');
  const origin = normalizeHttpsOrigin(workerUrl);
  if (text.includes(origin)) return;
  const marker = "connect-src 'self'";
  if (!text.includes(marker)) throw new Error('ไม่พบ connect-src ใน public/_headers');
  await writeFile(headersPath, text.replace(marker, `${marker} ${origin}`), 'utf8');
}
async function runWrangler(args, { quietFailure = false } = {}) {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const fullArgs = ['--yes', 'wrangler@4.103.0', ...args];
  const child = spawn(executable, fullArgs, { cwd: workerDir, env: process.env, shell: false, stdio: ['inherit', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { const text = chunk.toString(); stdout += text; output.write(text); });
  child.stderr.on('data', chunk => { const text = chunk.toString(); stderr += text; if (!quietFailure) process.stderr.write(text); });
  const code = await new Promise((resolvePromise, reject) => {
    child.on('error', reject);
    child.on('close', resolvePromise);
  });
  return { code, stdout, stderr };
}
