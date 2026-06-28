#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorkerConfig, normalizeHttpsOrigin, normalizeWorkerName } from './lib/apple-health-shortcut-setup.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workerDir = resolve(root, 'workers/apple-health-shortcut');
const configPath = resolve(workerDir, 'wrangler.jsonc');
const workerName = normalizeWorkerName(process.env.APPLE_HEALTH_WORKER_NAME || 'trail-runner-coach-apple-health-sync');
const appOrigin = normalizeHttpsOrigin(process.env.APP_ORIGIN || 'https://trail-runner-coachs.natthanaruk-s.workers.dev');
const namespaceTitle = process.env.APPLE_HEALTH_KV_TITLE || `${workerName}-apple-health-data`;

main().catch(error => {
  console.error(`\nDeploy ไม่สำเร็จ: ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  ensureNode22();
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    throw new Error('ยังไม่มี CLOUDFLARE_API_TOKEN ใน Terminal — ใส่ Token แบบซ่อนค่าก่อน แล้วรันคำสั่งนี้ใหม่');
  }

  console.log('\nTrail Runner Coach — Deploy Apple Health Worker v1.1');
  console.log('อัปเดตเฉพาะ Code Parser สำหรับ Health Auto Export โดยไม่เปลี่ยน Bridge Token, Encryption Key หรือ KV เดิม\n');

  let result = await runWrangler(['whoami']);
  if (result.code !== 0) throw new Error('Cloudflare API Token ใช้งานไม่ได้');

  const existing = await readConfig();
  let kvId = existing?.kv_namespaces?.find(row => row?.binding === 'APPLE_HEALTH_DATA' && /^[0-9a-f]{32}$/i.test(String(row.id || '')))?.id || '';
  if (!kvId) {
    console.log(`[1/2] ค้นหา KV เดิม: ${namespaceTitle}`);
    result = await runWrangler(['kv', 'namespace', 'list']);
    if (result.code !== 0) throw new Error('อ่านรายการ Cloudflare KV ไม่สำเร็จ');
    const namespaces = parseJsonArray(result.stdout);
    const match = namespaces.find(row => String(row.title || row.name || '') === namespaceTitle)
      || namespaces.find(row => String(row.title || row.name || '').includes(workerName) && String(row.title || row.name || '').includes('apple-health-data'));
    kvId = String(match?.id || '');
    if (!/^[0-9a-f]{32}$/i.test(kvId)) {
      const available = namespaces.map(row => row.title || row.name).filter(Boolean).slice(0, 20).join(', ');
      throw new Error(`ไม่พบ KV เดิมชื่อ ${namespaceTitle}${available ? ` (พบ: ${available})` : ''}`);
    }
  } else {
    console.log('[1/2] พบ KV ID ใน Config เดิมแล้ว');
  }

  const config = buildWorkerConfig({
    appOrigin,
    workerName,
    existingConfig: {
      ...(existing || {}),
      kv_namespaces: [{ binding: 'APPLE_HEALTH_DATA', id: kvId }]
    }
  });
  await mkdir(workerDir, { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  console.log('[2/2] Deploy Worker โดยรักษา Secrets เดิม');
  result = await runWrangler(['deploy', '--config', configPath]);
  if (result.code !== 0) throw new Error('Deploy Apple Health Worker ไม่สำเร็จ');

  console.log('\nDeploy สำเร็จ');
  console.log(`Worker: ${workerName}`);
  console.log(`Import URL: https://${workerName}.natthanaruk-s.workers.dev/v1/import`);
  console.log('Bridge Token, Encryption Key, KV และข้อมูลเดิมไม่ได้ถูกสร้างใหม่หรือเปลี่ยนค่า\n');
}

function ensureNode22() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) throw new Error(`ต้องใช้ Node.js 22 ขึ้นไป (ปัจจุบัน ${process.versions.node})`);
}

async function readConfig() {
  if (!existsSync(configPath)) return null;
  try { return JSON.parse(await readFile(configPath, 'utf8')); }
  catch { return null; }
}

function parseJsonArray(output) {
  const text = String(output || '').trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start >= 0 && end >= start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch {}
  }
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/([0-9a-f]{32})\s+(.+?)\s*$/i);
    if (match) rows.push({ id: match[1], title: match[2].trim() });
  }
  return rows;
}

async function runWrangler(args) {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const child = spawn(executable, ['--yes', 'wrangler@4.103.0', ...args], {
    cwd: workerDir,
    env: process.env,
    shell: false,
    stdio: ['inherit', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { const text = chunk.toString(); stdout += text; process.stdout.write(text); });
  child.stderr.on('data', chunk => { const text = chunk.toString(); stderr += text; process.stderr.write(text); });
  const code = await new Promise((resolvePromise, reject) => {
    child.on('error', reject);
    child.on('close', resolvePromise);
  });
  return { code, stdout, stderr };
}
