#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STRAVA_KV_BINDINGS,
  buildSetupReceipt,
  buildWorkerConfig,
  normalizeClientId,
  normalizeHttpsOrigin,
  normalizeWorkerName,
  parseWranglerWorkerUrl
} from './lib/strava-setup.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workerDir = resolve(root, 'workers/wearable-sync');
const configPath = resolve(workerDir, 'wrangler.jsonc');
const receiptPath = resolve(root, 'strava-setup-result.json');
const rl = createInterface({ input, output });

main().catch(error => {
  console.error(`\nSetup ไม่สำเร็จ: ${error.message}`);
  process.exitCode = 1;
}).finally(() => rl.close());

async function main() {
  ensureNode22();
  console.log('\nTrail Runner Coach — Strava Setup Wizard');
  console.log('ระบบจะสร้าง KV, ตั้ง Secret และ Deploy Wearable Worker ให้โดยไม่บันทึก Client Secret ลงไฟล์โปรเจกต์\n');

  const existing = await readExistingConfig();
  const defaultOrigin = existing?.vars?.APP_ORIGIN || '';
  const defaultWorkerName = existing?.name || 'trail-runner-coach-wearable-sync';

  const appOrigin = normalizeHttpsOrigin(await ask('Trail Runner Coach Web App URL', defaultOrigin));
  const workerName = normalizeWorkerName(await ask('Cloudflare Worker name', defaultWorkerName));
  const clientId = normalizeClientId(process.env.STRAVA_CLIENT_ID || await ask('Strava Client ID'));
  const clientSecret = process.env.STRAVA_CLIENT_SECRET || await askHidden('Strava Client Secret');
  if (clientSecret.trim().length < 8) throw new Error('Strava Client Secret ไม่ถูกต้อง');

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
  for (const item of STRAVA_KV_BINDINGS) {
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

  console.log('\n[3/4] ตั้ง Secret และ Deploy Worker');
  const secretsPath = resolve(tmpdir(), `trail-runner-coach-strava-${process.pid}.json`);
  const verifyToken = randomBytes(24).toString('hex');
  const tokenKey = randomBytes(32).toString('base64');
  await writeFile(secretsPath, JSON.stringify({
    TOKEN_ENCRYPTION_KEY: tokenKey,
    STRAVA_CLIENT_ID: clientId,
    STRAVA_CLIENT_SECRET: clientSecret.trim(),
    STRAVA_VERIFY_TOKEN: verifyToken
  }), { encoding: 'utf8', mode: 0o600 });
  await chmod(secretsPath, 0o600).catch(() => {});

  let deploy;
  try {
    deploy = await runWrangler(['deploy', '--config', configPath, '--secrets-file', secretsPath]);
  } finally {
    await unlink(secretsPath).catch(() => {});
  }
  if (deploy.code !== 0) throw new Error('Deploy Wearable Worker ไม่สำเร็จ');

  let workerUrl = parseWranglerWorkerUrl(`${deploy.stdout}\n${deploy.stderr}`);
  if (!workerUrl) workerUrl = normalizeHttpsOrigin(await ask('กรุณาวาง Worker URL ที่ Cloudflare แสดง'));
  const receipt = buildSetupReceipt({ workerUrl, appOrigin, workerName });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

  console.log('\n[4/4] Setup สำเร็จ');
  console.log(`Worker URL: ${receipt.workerUrl}`);
  console.log(`Strava Callback Domain: ${receipt.callbackDomain}`);
  console.log(`Callback URL: ${receipt.callbackUrl}`);
  console.log(`Webhook URL: ${receipt.webhookUrl}`);
  console.log(`\nสร้างไฟล์ผลลัพธ์แล้ว: ${receiptPath}`);
  console.log('ไฟล์นี้ไม่มี Client Secret — นำเข้าได้ที่ บันทึก → เชื่อมต่อ → Strava Setup Wizard');
  console.log('\nขั้นถัดไป: เปิด Strava API Settings, ใส่ Callback Domain ด้านบน, Save แล้วกลับไปกด Connect Strava ในแอป\n');
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

async function askHidden(label) {
  if (!input.isTTY || !output.isTTY) return (await rl.question(`${label}: `)).trim();
  rl.pause();
  readline.emitKeypressEvents(input);
  input.setRawMode(true);
  output.write(`${label}: `);
  return new Promise((resolvePromise, reject) => {
    let value = '';
    const cleanup = () => {
      input.off('keypress', onKeypress);
      input.setRawMode(false);
      rl.resume();
      output.write('\n');
    };
    const onKeypress = (char, key = {}) => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        reject(new Error('ยกเลิกโดยผู้ใช้'));
        return;
      }
      if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        resolvePromise(value.trim());
        return;
      }
      if (key.name === 'backspace') {
        if (value) { value = value.slice(0, -1); output.write('\b \b'); }
        return;
      }
      if (char && !key.ctrl && !key.meta && char >= ' ') {
        value += char;
        output.write('•');
      }
    };
    input.on('keypress', onKeypress);
  });
}

async function runWrangler(args, { quietFailure = false } = {}) {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const fullArgs = ['--yes', 'wrangler@4.103.0', ...args];
  const child = spawn(executable, fullArgs, {
    cwd: workerDir,
    env: process.env,
    shell: false,
    stdio: ['inherit', 'pipe', 'pipe']
  });
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
