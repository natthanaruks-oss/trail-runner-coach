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
    throw new Error('Worker name ต้องยาว 3–63 ตัว และใช้ a-z, 0-9, -');
  }

  return text;
}

export function normalizeModel(value) {
  const text = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{2,80}$/i.test(text)) {
    throw new Error('OpenAI model ID ไม่ถูกต้อง');
  }
  return text;
}

export function buildWorkerConfig({
  appOrigin,
  workerName,
  model = 'gpt-5.4-mini'
}) {
  return {
    $schema: '../../node_modules/wrangler/config-schema.json',
    name: normalizeWorkerName(workerName),
    main: 'src/index.js',
    compatibility_date: '2026-06-28',
    vars: {
      APP_ORIGIN: normalizeHttpsOrigin(appOrigin),
      OPENAI_MODEL: normalizeModel(model)
    },
    secrets: {
      required: ['OPENAI_API_KEY', 'AI_COACH_ACCESS_TOKEN']
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
