import {
  isAiCoachConfigured,
  requestAiCoachExplanation
} from '../adapters/ai-coach.js';

const AUTO_REFRESH_DELAY_MS = 2400;
const timers = new WeakMap();

export function buildAiCoachExplanationKey(snapshot = {}) {
  // v4: every material snapshot revision gets a new key. This prevents a
  // changed activity/readiness/race horizon from reusing an older response.
  return `hc4-${String(snapshot.digest || fnv1a(stableStringify(snapshot)))}`;
}

export function getHomeCoachRuntime(app, snapshot) {
  const key = buildAiCoachExplanationKey(snapshot);
  const runtime = app?.ui?.homeAiCoach || {};
  const matches = runtime.explanationKey === key;

  return {
    key,
    result: matches ? runtime.result || null : null,
    error: matches ? runtime.error || '' : '',
    status: matches ? runtime.status || 'idle' : 'idle',
    pending: runtime.pendingKey === key,
    staleData:
      matches &&
      Boolean(runtime.result) &&
      runtime.sourceDigest !== snapshot.digest,
    generatedAt: matches
      ? runtime.result?.generatedAt || runtime.generatedAt || null
      : null
  };
}

export function scheduleHomeCoachExplanation({
  app,
  snapshot,
  force = false,
  delayMs = AUTO_REFRESH_DELAY_MS,
  request = requestAiCoachExplanation
}) {
  if (!app?.ui || !app?.store || !snapshot?.digest) {
    return { scheduled: false, reason: 'missing_context' };
  }

  const settings = app.store.getState().settings;
  if (!isAiCoachConfigured(settings)) {
    return { scheduled: false, reason: 'not_configured' };
  }

  const key = buildAiCoachExplanationKey(snapshot);
  const current = app.ui.homeAiCoach || {};

  if (!force && current.explanationKey === key && current.result) {
    return { scheduled: false, reason: 'current_result' };
  }

  if (!force && current.pendingKey === key) {
    return { scheduled: false, reason: 'already_pending' };
  }

  const previousTimer = timers.get(app);
  if (previousTimer) clearTimeout(previousTimer);

  const sequence = Number(current.sequence || 0) + 1;
  app.ui.homeAiCoach = {
    ...current,
    sequence,
    explanationKey: current.explanationKey || '',
    pendingKey: key,
    sourceDigest: snapshot.digest,
    status: delayMs > 0 ? 'scheduled' : 'loading',
    error: ''
  };

  const timer = setTimeout(async () => {
    timers.delete(app);

    const before = app.ui.homeAiCoach || {};
    if (before.sequence !== sequence || before.pendingKey !== key) return;

    app.ui.homeAiCoach = {
      ...before,
      status: 'loading',
      error: ''
    };
    safeRender(app);

    try {
      const result = await request({
        settings: app.store.getState().settings,
        snapshot,
        force
      });

      const latest = app.ui.homeAiCoach || {};
      if (latest.sequence !== sequence || latest.pendingKey !== key) {
        return;
      }

      app.ui.homeAiCoach = {
        ...latest,
        explanationKey: key,
        pendingKey: '',
        sourceDigest: snapshot.digest,
        result,
        generatedAt: result.generatedAt || new Date().toISOString(),
        status: 'ready',
        error: ''
      };

      await saveAiStatus(app, {
        lastSuccessAt: new Date().toISOString(),
        lastError: ''
      });
    } catch (error) {
      const latest = app.ui.homeAiCoach || {};
      if (latest.sequence !== sequence || latest.pendingKey !== key) {
        return;
      }

      app.ui.homeAiCoach = {
        ...latest,
        explanationKey: key,
        pendingKey: '',
        sourceDigest: snapshot.digest,
        result: null,
        status: 'error',
        error: error?.message || 'AI Coach ไม่สำเร็จ'
      };

      await saveAiStatus(app, {
        lastError: error?.message || 'AI Coach ไม่สำเร็จ'
      });
    }

    safeRender(app);
  }, Math.max(0, Number(delayMs) || 0));

  timers.set(app, timer);

  return {
    scheduled: true,
    key,
    sequence,
    delayMs: Math.max(0, Number(delayMs) || 0)
  };
}

export function cancelHomeCoachExplanation(app) {
  const timer = timers.get(app);
  if (timer) clearTimeout(timer);
  timers.delete(app);

  if (app?.ui?.homeAiCoach) {
    app.ui.homeAiCoach = {
      ...app.ui.homeAiCoach,
      pendingKey: '',
      status: app.ui.homeAiCoach.result ? 'ready' : 'idle'
    };
  }
}

async function saveAiStatus(app, value) {
  try {
    await app.store.saveSettings({
      integrations: {
        aiCoach: value
      }
    });
  } catch {
    // A status timestamp must never block the recommendation.
  }
}

function safeRender(app) {
  try {
    app.render();
  } catch {
    // Rendering is best-effort after async work.
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(
        key =>
          `${JSON.stringify(key)}:${stableStringify(value[key])}`
      )
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function fnv1a(text) {
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

function numberOrNull(value) {
  return value !== null &&
    value !== undefined &&
    value !== '' &&
    Number.isFinite(Number(value))
    ? Number(value)
    : null;
}
