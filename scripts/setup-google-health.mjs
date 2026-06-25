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
  GOOGLE_HEALTH_KV_BINDINGS,
  buildGoogleHealthSetupReceipt,
  buildGoogleHealthWorkerConfig,
  normalizeGoogleClientId,
  parseWranglerWorkerUrl
} from './lib/google-health-setup.mjs';
import { normalizeHttpsOrigin, normalizeWorkerName } from './lib/strava-setup.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workerDir = resolve(root, 'workers/wearable-sync');
const configPath = resolve(workerDir, 'wrangler.jsonc');
const receiptPath = resolve(root, 'google-health-setup-result.json');
const rl = createInterface({ input, output });

main().catch(error => { console.error(`\nSetup ไม่สำเร็จ: ${error.message}`); process.exitCode = 1; }).finally(() => rl.close());

async function main() {
  ensureNode22();
  console.log('\nTrail Runner Coach — Google Health / Fitbit Setup');
  console.log('ก่อนเริ่ม ให้เปิด Google Health API และสร้าง OAuth Client แบบ Web application ใน Google Cloud Console\n');
  const existing = await readExistingConfig();
  const appOrigin = normalizeHttpsOrigin(await ask('Trail Runner Coach Web App URL', existing?.vars?.APP_ORIGIN || ''));
  const workerName = normalizeWorkerName(await ask('Cloudflare Worker name', existing?.name || 'trail-runner-coach-wearable-sync'));
  const clientId = normalizeGoogleClientId(process.env.GOOGLE_HEALTH_CLIENT_ID || await ask('Google OAuth Client ID'));
  const clientSecret = process.env.GOOGLE_HEALTH_CLIENT_SECRET || await askHidden('Google OAuth Client Secret');
  if (clientSecret.trim().length < 8) throw new Error('Google OAuth Client Secret ไม่ถูกต้อง');
  const existingEncryption = /^y(es)?$/i.test(await ask('Worker นี้เคยตั้ง Strava/TOKEN_ENCRYPTION_KEY แล้วหรือยัง? (y/n)', existing ? 'y' : 'n'));

  await mkdir(workerDir, { recursive: true });
  await writeFile(configPath, `${JSON.stringify(buildGoogleHealthWorkerConfig({ appOrigin, workerName, existingConfig: existing || {} }), null, 2)}\n`, 'utf8');

  console.log('\n[1/4] ตรวจ Cloudflare login');
  let result = await runWrangler(['whoami'], { quietFailure: true });
  if (result.code !== 0) result = await runWrangler(['login']);
  if (result.code !== 0) throw new Error('Cloudflare login ไม่สำเร็จ');

  console.log('\n[2/4] เตรียม Cloudflare KV');
  for (const item of GOOGLE_HEALTH_KV_BINDINGS) {
    const current = await readExistingConfig();
    if (current?.kv_namespaces?.some(row => row.binding === item.binding && /^[0-9a-f]{32}$/i.test(String(row.id || '')))) { console.log(`✓ ${item.binding} มีอยู่แล้ว`); continue; }
    const create = await runWrangler(['kv', 'namespace', 'create', `${workerName}-${item.suffix}`, '--binding', item.binding, '--update-config', '--config', configPath]);
    if (create.code !== 0) throw new Error(`สร้าง KV ${item.binding} ไม่สำเร็จ`);
  }

  console.log('\n[3/4] ตั้ง Google OAuth Secrets และ Deploy Worker');
  const secrets = {
    GOOGLE_HEALTH_CLIENT_ID: clientId,
    GOOGLE_HEALTH_CLIENT_SECRET: clientSecret.trim()
  };
  if (!existingEncryption) secrets.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  const secretsPath = resolve(tmpdir(), `trail-runner-coach-google-health-${process.pid}.json`);
  await writeFile(secretsPath, JSON.stringify(secrets), { encoding: 'utf8', mode: 0o600 });
  await chmod(secretsPath, 0o600).catch(() => {});
  let deploy;
  try { deploy = await runWrangler(['deploy', '--config', configPath, '--secrets-file', secretsPath]); }
  finally { await unlink(secretsPath).catch(() => {}); }
  if (deploy.code !== 0) throw new Error('Deploy Wearable Worker ไม่สำเร็จ');

  let workerUrl = parseWranglerWorkerUrl(`${deploy.stdout}\n${deploy.stderr}`);
  if (!workerUrl) workerUrl = normalizeHttpsOrigin(await ask('กรุณาวาง Worker URL ที่ Cloudflare แสดง'));
  const receipt = buildGoogleHealthSetupReceipt({ workerUrl, appOrigin, workerName });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

  console.log('\n[4/4] Setup สำเร็จ');
  console.log(`Authorized redirect URI: ${receipt.callbackUrl}`);
  console.log(`สร้างไฟล์ผลลัพธ์: ${receiptPath}`);
  console.log('\nกลับไป Google Cloud OAuth Client แล้วตรวจว่า Authorized redirect URI ตรงกับค่าด้านบน จากนั้น Import ไฟล์ผลลัพธ์และกด Connect Google Health ในแอป\n');
}
function ensureNode22() { if (Number(process.versions.node.split('.')[0]) < 22) throw new Error(`ต้องใช้ Node.js 22 ขึ้นไป (ปัจจุบัน ${process.versions.node})`); }
async function readExistingConfig() { if (!existsSync(configPath)) return null; try { return JSON.parse(await readFile(configPath, 'utf8')); } catch { throw new Error(`อ่าน ${configPath} ไม่ได้`); } }
async function ask(label, defaultValue = '') { const suffix = defaultValue ? ` [${defaultValue}]` : ''; const value = (await rl.question(`${label}${suffix}: `)).trim(); return value || defaultValue; }
async function askHidden(label) {
  if (!input.isTTY || !output.isTTY) return (await rl.question(`${label}: `)).trim();
  rl.pause(); readline.emitKeypressEvents(input); input.setRawMode(true); output.write(`${label}: `);
  return new Promise((resolvePromise, reject) => { let value = ''; const cleanup = () => { input.off('keypress', onKeypress); input.setRawMode(false); rl.resume(); output.write('\n'); }; const onKeypress = (char, key = {}) => { if (key.ctrl && key.name === 'c') { cleanup(); reject(new Error('ยกเลิกโดยผู้ใช้')); return; } if (key.name === 'return' || key.name === 'enter') { cleanup(); resolvePromise(value.trim()); return; } if (key.name === 'backspace') { if (value) { value = value.slice(0, -1); output.write('\b \b'); } return; } if (char && !key.ctrl && !key.meta && char >= ' ') { value += char; output.write('•'); } }; input.on('keypress', onKeypress); });
}
async function runWrangler(args, { quietFailure = false } = {}) {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const child = spawn(executable, ['--yes', 'wrangler@4.103.0', ...args], { cwd: workerDir, env: process.env, shell: false, stdio: ['inherit', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', chunk => { const text = chunk.toString(); stdout += text; output.write(text); });
  child.stderr.on('data', chunk => { const text = chunk.toString(); stderr += text; if (!quietFailure) process.stderr.write(text); });
  const code = await new Promise((resolvePromise, reject) => { child.on('error', reject); child.on('close', resolvePromise); });
  return { code, stdout, stderr };
}
