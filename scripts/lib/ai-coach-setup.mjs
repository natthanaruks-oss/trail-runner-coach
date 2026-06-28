const DEFAULT_WORKERS_AI_MODEL =
  '@cf/qwen/qwen3-30b-a3b-fp8';

export function normalizeHttpsOrigin(value) {
  const text = String(value || '').trim().replace(/\/+$/, '');
  let url;

  try {
    url = new URL(text);
  } catch {
    throw new Error('URL ไม่ถูกต้อง');
  }

  if (url.protocol !== 'https:') {
    throw new Error('ต้องใช้ HTTPS');
  }

  return url.origin;
}

export function normalizeWorkerName(value) {
  const text = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(text)) {
    throw new Error(
      'Worker name ต้องยาว 3–63 ตัว และใช้ a-z, 0-9, -'
    );
  }

  return text;
}

export function normalizeModel(
  value = DEFAULT_WORKERS_AI_MODEL
) {
  const text = String(value || '').trim();

  if (!/^@cf\/[a-z0-9._/-]{3,120}$/i.test(text)) {
    throw new Error('Workers AI model ID ไม่ถูกต้อง');
  }

  return text;
}

export function buildWorkerConfig({
  appOrigin,
  workerName,
  model = DEFAULT_WORKERS_AI_MODEL
}) {
  return {
    $schema:
      '../../node_modules/wrangler/config-schema.json',
    name: normalizeWorkerName(workerName),
    main: 'src/index.js',
    compatibility_date: '2026-06-28',
    ai: {
      binding: 'AI'
    },
    vars: {
      APP_ORIGIN: normalizeHttpsOrigin(appOrigin),
      WORKERS_AI_MODEL: normalizeModel(model)
    }
  };
}

export function buildSetupReceipt({
  workerUrl,
  workerName,
  model,
  accessToken
}) {
  return {
    kind: 'trail-runner-coach-ai-coach-v1',
    provider: 'cloudflare-workers-ai',
    baseUrl: normalizeHttpsOrigin(workerUrl),
    workerName: normalizeWorkerName(workerName),
    model: normalizeModel(model),
    accessToken: String(accessToken || ''),
    configuredAt: new Date().toISOString()
  };
}

export function parseWranglerWorkerUrl(text) {
  const matches = String(text || '').match(
    /https:\/\/[a-z0-9.-]+\.workers\.dev/gi
  );

  return matches?.at(-1) || '';
}

export { DEFAULT_WORKERS_AI_MODEL };
