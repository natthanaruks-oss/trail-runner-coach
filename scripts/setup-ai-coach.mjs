#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  chmod,
  mkdir,
  readFile,
  unlink,
  writeFile
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSetupReceipt,
  buildWorkerConfig,
  DEFAULT_WORKERS_AI_MODEL,
  normalizeHttpsOrigin,
  normalizeModel,
  normalizeWorkerName,
  parseWranglerWorkerUrl
} from './lib/ai-coach-setup.mjs';

const root = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..'
);
const workerDir = resolve(root, 'workers/ai-coach');
const configPath = resolve(workerDir, 'wrangler.jsonc');
const receiptPath = resolve(
  root,
  'ai-coach-setup-result.local.json'
);
const headersPath = resolve(root, 'public/_headers');
const rl = createInterface({ input, output });

main()
  .catch(error => {
    console.error(`\nSetup ไม่สำเร็จ: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());

async function main() {
  ensureNode22();

  console.log(
    '\nTrail Runner Coach — Cloudflare Workers AI Setup'
  );
  console.log(
    'ไม่ต้องใช้ OpenAI API Key ระบบจะใช้ Workers AI Binding และสร้าง Access Token สำหรับแอป\n'
  );

  const appOrigin = normalizeHttpsOrigin(
    await ask(
      'Trail Runner Coach Web App URL',
      'https://trail-runner-coaches.natthanaruk-s.workers.dev'
    )
  );

  const workerName = normalizeWorkerName(
    await ask(
      'Cloudflare Worker name',
      'trail-runner-coach-ai'
    )
  );

  const model = normalizeModel(
    await ask(
      'Workers AI model',
      DEFAULT_WORKERS_AI_MODEL
    )
  );

  await mkdir(workerDir, { recursive: true });

  await writeFile(
    configPath,
    `${JSON.stringify(
      buildWorkerConfig({
        appOrigin,
        workerName,
        model
      }),
      null,
      2
    )}\n`,
    'utf8'
  );

  console.log('\n[1/3] ตรวจ Cloudflare API Token');
  const whoami = await runWrangler(
    ['whoami'],
    { quietFailure: true }
  );

  if (whoami.code !== 0) {
    throw new Error(
      'Wrangler ยังไม่เห็น CLOUDFLARE_API_TOKEN กรุณา export Token ใน Terminal เดียวกันก่อนรัน Setup'
    );
  }

  console.log(
    '\n[2/3] ตั้ง Access Token และ Deploy Workers AI'
  );

  const accessToken = randomBytes(36).toString('base64url');
  const secretsPath = resolve(
    tmpdir(),
    `trail-runner-coach-ai-${process.pid}.json`
  );

  await writeFile(
    secretsPath,
    JSON.stringify({
      AI_COACH_ACCESS_TOKEN: accessToken
    }),
    { encoding: 'utf8', mode: 0o600 }
  );

  await chmod(secretsPath, 0o600).catch(() => {});

  let deploy;

  try {
    deploy = await runWrangler([
      'deploy',
      '--config',
      configPath,
      '--secrets-file',
      secretsPath
    ]);
  } finally {
    await unlink(secretsPath).catch(() => {});
  }

  if (deploy.code !== 0) {
    throw new Error(
      'Deploy Cloudflare Workers AI ไม่สำเร็จ'
    );
  }

  let workerUrl = parseWranglerWorkerUrl(
    `${deploy.stdout}\n${deploy.stderr}`
  );

  if (!workerUrl) {
    workerUrl = normalizeHttpsOrigin(
      await ask(
        'กรุณาวาง Worker URL ที่ Cloudflare แสดง'
      )
    );
  }

  const receipt = buildSetupReceipt({
    workerUrl,
    workerName,
    model,
    accessToken
  });

  await writeFile(
    receiptPath,
    `${JSON.stringify(receipt, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 }
  );

  await chmod(receiptPath, 0o600).catch(() => {});
  await allowWorkerInCsp(workerUrl);

  console.log('\n[3/3] Setup สำเร็จ');
  console.log('Provider: Cloudflare Workers AI');
  console.log(`Worker URL: ${receipt.baseUrl}`);
  console.log(`Model: ${receipt.model}`);
  console.log(`Receipt: ${receiptPath}`);
  console.log(
    '\nไม่ต้องใช้ OpenAI API Key\nReceipt มี Access Token: ห้าม Commit และห้ามส่งให้ผู้อื่น นำเข้าในหน้า AI Coach แล้วลบไฟล์ได้\n'
  );
}

function ensureNode22() {
  const major = Number(process.versions.node.split('.')[0]);

  if (major < 22) {
    throw new Error(
      `ต้องใช้ Node.js 22 ขึ้นไป (ปัจจุบัน ${process.versions.node})`
    );
  }
}

async function ask(label, defaultValue = '') {
  const suffix = defaultValue
    ? ` [${defaultValue}]`
    : '';

  const value = (
    await rl.question(`${label}${suffix}: `)
  ).trim();

  return value || defaultValue;
}

async function allowWorkerInCsp(workerUrl) {
  if (!existsSync(headersPath)) return;

  const text = await readFile(headersPath, 'utf8');
  const origin = normalizeHttpsOrigin(workerUrl);

  if (text.includes(origin)) return;

  const marker = "connect-src 'self'";

  if (!text.includes(marker)) {
    throw new Error(
      'ไม่พบ connect-src ใน public/_headers'
    );
  }

  await writeFile(
    headersPath,
    text.replace(marker, `${marker} ${origin}`),
    'utf8'
  );
}

async function runWrangler(
  args,
  { quietFailure = false } = {}
) {
  const executable =
    process.platform === 'win32'
      ? 'npx.cmd'
      : 'npx';

  const child = spawn(
    executable,
    ['wrangler', ...args],
    {
      cwd: workerDir,
      env: process.env,
      shell: false,
      stdio: ['inherit', 'pipe', 'pipe']
    }
  );

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', chunk => {
    const text = chunk.toString();
    stdout += text;
    output.write(text);
  });

  child.stderr.on('data', chunk => {
    const text = chunk.toString();
    stderr += text;

    if (!quietFailure) {
      process.stderr.write(text);
    }
  });

  const code = await new Promise(
    (resolvePromise, reject) => {
      child.on('error', reject);
      child.on('close', resolvePromise);
    }
  );

  return { code, stdout, stderr };
}
