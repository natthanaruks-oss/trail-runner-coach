const CACHE_PREFIX = 'trc_ai_coach_explanation_v1:';
const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function getAiCoachConfig(settings = {}) {
  const value = settings?.integrations?.aiCoach || {};
  return {
    baseUrl: normalizeHttpsUrl(value.baseUrl || ''),
    accessToken: String(value.accessToken || '').trim(),
    configuredAt: value.configuredAt || null,
    lastSuccessAt: value.lastSuccessAt || null,
    lastError: value.lastError || ''
  };
}

export function isAiCoachConfigured(settings = {}) {
  const config = getAiCoachConfig(settings);
  return Boolean(config.baseUrl && config.accessToken.length >= 24);
}

export async function requestAiCoachExplanation({
  settings,
  snapshot,
  force = false,
  fetchImpl = globalThis.fetch
}) {
  if (!snapshot?.digest || !snapshot?.decision?.actionCode) {
    throw new Error('AI Coach snapshot ไม่ครบ');
  }

  const config = getAiCoachConfig(settings);
  if (!config.baseUrl || config.accessToken.length < 24) {
    throw new Error('ยังไม่ได้ตั้งค่า AI Coach Worker');
  }

  if (!force) {
    const cached = readCache(snapshot.digest);
    if (cached) return { ...cached, cacheHit: true };
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('Browser นี้ไม่รองรับการเชื่อมต่อ AI Coach');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  let response;
  try {
    response = await fetchImpl(`${config.baseUrl}/v1/explain`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ snapshot }),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('AI Coach ใช้เวลานานเกินไป กรุณาลองใหม่');
    }
    throw new Error(error?.message || 'เชื่อมต่อ AI Coach ไม่สำเร็จ');
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `AI Coach HTTP ${response.status}`);
  }

  const validated = validateAiCoachPayload(payload, snapshot);
  writeCache(snapshot.digest, validated);
  return { ...validated, cacheHit: false };
}

export function validateAiCoachPayload(payload, snapshot) {
  const explanation = payload?.explanation;
  if (!explanation || typeof explanation !== 'object') {
    throw new Error('AI Coach response ไม่ถูกต้อง');
  }

  if (explanation.actionCodeEcho !== snapshot.decision.actionCode) {
    throw new Error('AI Coach พยายามเปลี่ยนคำตัดสินของ Local Coach');
  }

  if (explanation.statusEcho !== snapshot.decision.status) {
    throw new Error('AI Coach ส่งสถานะไม่ตรงกับ Local Coach');
  }

  if (Boolean(explanation.safetyLockEcho) !== Boolean(snapshot.decision.hardStop)) {
    throw new Error('AI Coach ส่ง Safety Lock ไม่ตรงกับ Local Coach');
  }

  const clean = {
    actionCodeEcho: explanation.actionCodeEcho,
    statusEcho: explanation.statusEcho,
    safetyLockEcho: Boolean(explanation.safetyLockEcho),
    headline: cleanText(explanation.headline, 140),
    summary: cleanText(explanation.summary, 700),
    todayPlan: cleanText(explanation.todayPlan, 360),
    why: cleanArray(explanation.why, 4, 220),
    watchFor: cleanArray(explanation.watchFor, 3, 220),
    checkAfter: cleanText(explanation.checkAfter, 300),
    safetyNote: cleanText(explanation.safetyNote, 300)
  };

  if (!clean.headline || !clean.summary || !clean.todayPlan) {
    throw new Error('AI Coach response ขาดข้อความสำคัญ');
  }

  return {
    version: String(payload.version || 'ai_coach_explanation_v1'),
    model: String(payload.model || ''),
    generatedAt: payload.generatedAt || new Date().toISOString(),
    snapshotDigest: snapshot.digest,
    explanation: clean
  };
}

export function normalizeHttpsUrl(value) {
  const text = String(value || '').trim().replace(/\/+$/, '');
  if (!text) return '';

  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error('AI Coach Worker URL ไม่ถูกต้อง');
  }

  if (url.protocol !== 'https:') {
    throw new Error('AI Coach Worker ต้องใช้ HTTPS');
  }

  return url.origin;
}

export function clearAiCoachCache() {
  const storage = globalThis.localStorage;
  if (!storage) return;

  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key?.startsWith(CACHE_PREFIX)) storage.removeItem(key);
  }
}

function readCache(digest) {
  const storage = globalThis.localStorage;
  if (!storage) return null;

  try {
    const value = JSON.parse(storage.getItem(`${CACHE_PREFIX}${digest}`) || 'null');
    if (!value?.cachedAt || Date.now() - Date.parse(value.cachedAt) > CACHE_MAX_AGE_MS) {
      storage.removeItem(`${CACHE_PREFIX}${digest}`);
      return null;
    }
    return value.payload || null;
  } catch {
    return null;
  }
}

function writeCache(digest, payload) {
  const storage = globalThis.localStorage;
  if (!storage) return;

  try {
    storage.setItem(
      `${CACHE_PREFIX}${digest}`,
      JSON.stringify({
        cachedAt: new Date().toISOString(),
        payload
      })
    );
  } catch {
    // Cache failure must never block coaching.
  }
}

function cleanText(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function cleanArray(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => cleanText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}
