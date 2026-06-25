const CLOUD_PROVIDERS = ['garmin', 'suunto', 'strava', 'google_health'];
const GOOGLE_HEALTH_TYPES = Object.freeze({
  exercise: { apiName: 'exercise', filterField: 'exercise.interval.civil_start_time', pageSize: 25 },
  sleep: { apiName: 'sleep', filterField: 'sleep.interval.civil_end_time', pageSize: 25 },
  dailyRestingHeartRate: { apiName: 'daily-resting-heart-rate', filterField: 'dailyRestingHeartRate.date', pageSize: 1000 },
  dailyHeartRateVariability: { apiName: 'daily-heart-rate-variability', filterField: 'dailyHeartRateVariability.date', pageSize: 1000 },
  steps: { apiName: 'steps', filterField: 'steps.interval.civil_start_time', pageSize: 10000 },
  activeEnergyBurned: { apiName: 'active-energy-burned', filterField: 'active_energy_burned.interval.civil_start_time', pageSize: 10000 },
  activeMinutes: { apiName: 'active-minutes', filterField: 'active_minutes.interval.civil_start_time', pageSize: 10000 },
  distance: { apiName: 'distance', filterField: 'distance.interval.civil_start_time', pageSize: 10000 },
  weight: { apiName: 'weight', filterField: 'weight.sample_time.civil_time', pageSize: 10000 },
  bodyFat: { apiName: 'body-fat', filterField: 'body_fat.sample_time.civil_time', pageSize: 10000 }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), env);
    try {
      if (url.pathname === '/health') return json({ ok: true, service: 'trail-runner-coach-wearable-sync', version: '2.1.0', providers: CLOUD_PROVIDERS }, 200, env);
      if (url.pathname === '/setup/status' && request.method === 'GET') return setupStatus(request, env);
      if (url.pathname.match(/^\/oauth\/(garmin|suunto|strava|google_health)\/start$/) && request.method === 'GET') return oauthStart(request, env);
      if (url.pathname.match(/^\/oauth\/(garmin|suunto|strava|google_health)\/callback$/) && request.method === 'GET') return oauthCallback(request, env);
      if (url.pathname === '/api/connections' && request.method === 'GET') return getConnections(request, env);
      if (url.pathname.match(/^\/api\/connections\/(garmin|suunto|strava|google_health)$/) && request.method === 'DELETE') return disconnect(request, env);
      if (url.pathname.match(/^\/api\/sync\/(garmin|suunto|strava|google_health)$/) && request.method === 'POST') return syncProvider(request, env);
      if (url.pathname === '/webhooks/strava') return stravaWebhook(request, env);
      if (url.pathname === '/webhooks/garmin' || url.pathname === '/webhooks/suunto') return json({ ok: true, accepted: true }, 202, env);
      return json({ ok: false, code: 'not_found' }, 404, env);
    } catch (error) {
      console.error(error);
      const headers = error.retryAfterSeconds ? { 'retry-after': String(error.retryAfterSeconds) } : {};
      return json({ ok: false, code: error.code || 'internal_error', message: error.message || 'Unexpected error' }, error.status || 500, env, headers);
    }
  }
};

function setupStatus(request, env) {
  const origin = new URL(request.url).origin;
  const encryptionKey = Boolean(env.TOKEN_ENCRYPTION_KEY);
  const strava = {
    clientId: Boolean(env.STRAVA_CLIENT_ID),
    clientSecret: Boolean(env.STRAVA_CLIENT_SECRET),
    encryptionKey,
    verifyToken: Boolean(env.STRAVA_VERIFY_TOKEN)
  };
  strava.ready = Object.values(strava).every(Boolean);
  const googleHealth = {
    clientId: Boolean(env.GOOGLE_HEALTH_CLIENT_ID),
    clientSecret: Boolean(env.GOOGLE_HEALTH_CLIENT_SECRET),
    encryptionKey
  };
  googleHealth.ready = Object.values(googleHealth).every(Boolean);
  const kv = {
    oauthState: Boolean(env.OAUTH_STATE),
    wearableTokens: Boolean(env.WEARABLE_TOKENS),
    wearableEvents: Boolean(env.WEARABLE_EVENTS)
  };
  const appOrigin = Boolean(env.APP_ORIGIN);
  const kvReady = Object.values(kv).every(Boolean);
  return json({
    ok: true,
    service: 'trail-runner-coach-wearable-sync',
    version: '2.1.0',
    appOrigin,
    appOriginValue: appOrigin ? env.APP_ORIGIN : null,
    kv,
    providers: { strava, google_health: googleHealth },
    ready: appOrigin && kvReady && encryptionKey && (strava.ready || googleHealth.ready),
    callbackUrl: `${origin}/oauth/strava/callback`,
    webhookUrl: `${origin}/webhooks/strava`,
    googleHealthCallbackUrl: `${origin}/oauth/google_health/callback`
  }, 200, env);
}

async function oauthStart(request, env) {
  requireBindings(env, ['OAUTH_STATE', 'WEARABLE_TOKENS', 'TOKEN_ENCRYPTION_KEY', 'APP_ORIGIN']);
  const url = new URL(request.url);
  const provider = pathProvider(url.pathname);
  const deviceToken = url.searchParams.get('device_token');
  if (!deviceToken || deviceToken.length < 40) return json({ ok: false, message: 'Invalid device token' }, 400, env);
  const returnTo = safeReturnTo(url.searchParams.get('return_to'), env.APP_ORIGIN);
  const config = providerConfig(provider, env, url.origin);
  const state = randomHex(24);
  const deviceHash = await sha256(deviceToken);
  await env.OAUTH_STATE.put(`oauth:${state}`, JSON.stringify({ provider, deviceHash, returnTo, createdAt: Date.now() }), { expirationTtl: 600 });
  const authorize = new URL(config.authorizeUrl);
  authorize.searchParams.set('client_id', config.clientId);
  authorize.searchParams.set('redirect_uri', config.redirectUri);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('state', state);
  if (config.scope) authorize.searchParams.set('scope', config.scope);
  if (provider === 'strava') authorize.searchParams.set('approval_prompt', 'auto');
  if (provider === 'google_health') {
    authorize.searchParams.set('access_type', 'offline');
    authorize.searchParams.set('prompt', 'consent');
    authorize.searchParams.set('include_granted_scopes', 'true');
  }
  return Response.redirect(authorize.toString(), 302);
}

async function oauthCallback(request, env) {
  requireBindings(env, ['OAUTH_STATE', 'WEARABLE_TOKENS', 'TOKEN_ENCRYPTION_KEY', 'APP_ORIGIN']);
  const url = new URL(request.url);
  const provider = pathProvider(url.pathname);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const stored = state ? await env.OAUTH_STATE.get(`oauth:${state}`, 'json') : null;
  if (!stored || stored.provider !== provider) return redirectResult(env.APP_ORIGIN, provider, null, 'invalid_state');
  await env.OAUTH_STATE.delete(`oauth:${state}`);
  if (!code) return redirectResult(stored.returnTo, provider, null, url.searchParams.get('error') || 'missing_code');
  const config = providerConfig(provider, env, url.origin);
  const token = await exchangeCode(provider, config, code);
  const encrypted = await encryptJson(token, env.TOKEN_ENCRYPTION_KEY);
  await env.WEARABLE_TOKENS.put(`token:${provider}:${stored.deviceHash}`, encrypted);
  const providerUserId = providerIdentity(provider, token);
  if (providerUserId) await env.WEARABLE_TOKENS.put(`provider-user:${provider}:${providerUserId}`, stored.deviceHash);
  return redirectResult(stored.returnTo, provider, true, null);
}

async function getConnections(request, env) {
  const deviceHash = await authorizeDevice(request, env);
  const providers = {};
  for (const provider of CLOUD_PROVIDERS) {
    const token = await env.WEARABLE_TOKENS.get(`token:${provider}:${deviceHash}`);
    providers[provider] = { connected: Boolean(token) };
  }
  return json({ ok: true, providers }, 200, env);
}

async function disconnect(request, env) {
  const deviceHash = await authorizeDevice(request, env);
  const provider = pathProvider(new URL(request.url).pathname);
  await env.WEARABLE_TOKENS.delete(`token:${provider}:${deviceHash}`);
  return json({ ok: true, provider, connected: false }, 200, env);
}

async function syncProvider(request, env) {
  const deviceHash = await authorizeDevice(request, env);
  const url = new URL(request.url);
  const provider = pathProvider(url.pathname);
  const encrypted = await env.WEARABLE_TOKENS.get(`token:${provider}:${deviceHash}`);
  if (!encrypted) return json({ ok: false, code: 'not_connected', message: `${provider} ยังไม่เชื่อมต่อ` }, 409, env);
  let token = await decryptJson(encrypted, env.TOKEN_ENCRYPTION_KEY);
  token = await refreshTokenIfNeeded(provider, token, env, url.origin);
  await env.WEARABLE_TOKENS.put(`token:${provider}:${deviceHash}`, await encryptJson(token, env.TOKEN_ENCRYPTION_KEY));
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get('days')) || 90));
  if (provider === 'strava') return json({ ok: true, provider, activities: await fetchStravaActivities(token, days) }, 200, env);
  if (provider === 'google_health') return json({ ok: true, provider, ...(await fetchGoogleHealthPayload(token, days)) }, 200, env);
  return json({
    ok: false,
    code: 'provider_adapter_pending',
    message: `${provider} OAuth boundary พร้อมแล้ว แต่ endpoint ดึงข้อมูลต้องเปิดตามสิทธิ์ API ที่ provider อนุมัติให้บัญชีนี้`
  }, 501, env);
}

async function stravaWebhook(request, env) {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token && token === env.STRAVA_VERIFY_TOKEN) return json({ 'hub.challenge': challenge }, 200, env);
    return json({ ok: false }, 403, env);
  }
  if (request.method === 'POST') {
    const event = await request.json().catch(() => ({}));
    if (env.WEARABLE_EVENTS) await env.WEARABLE_EVENTS.put(`strava:${Date.now()}:${randomHex(6)}`, JSON.stringify(event), { expirationTtl: 86400 * 7 });
    return json({ ok: true }, 200, env);
  }
  return json({ ok: false }, 405, env);
}

async function exchangeCode(provider, config, code) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri
  });
  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(response.status, `${provider} token exchange failed (${response.status}): ${payload.error_description || payload.message || payload.error || 'unknown'}`, payload.error || 'token_exchange_failed');
  return normalizeTokenPayload(payload);
}

async function refreshTokenIfNeeded(provider, token, env, origin) {
  const expiresAt = Number(token.expires_at || token.expiresAt || 0);
  if (!token.refresh_token || !expiresAt || expiresAt > Math.floor(Date.now() / 1000) + 300) return token;
  const config = providerConfig(provider, env, origin);
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: token.refresh_token,
    grant_type: 'refresh_token'
  });
  const response = await fetch(config.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(response.status, `${provider} token refresh failed (${response.status})`, payload.error || 'token_refresh_failed');
  return normalizeTokenPayload({ ...token, ...payload, refresh_token: payload.refresh_token || token.refresh_token });
}

function normalizeTokenPayload(payload) {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = Number(payload.expires_in || 0);
  return {
    ...payload,
    obtained_at: now,
    expires_at: Number(payload.expires_at || payload.expiresAt || (expiresIn ? now + expiresIn : 0)) || null
  };
}

async function fetchStravaActivities(token, days) {
  const after = Math.floor((Date.now() - days * 86400000) / 1000);
  const url = new URL('https://www.strava.com/api/v3/athlete/activities');
  url.searchParams.set('after', String(after));
  url.searchParams.set('per_page', '200');
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token.access_token}` } });
  const rows = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new HttpError(response.status, `Strava activity sync failed (${response.status})`, response.status === 429 ? 'rate_limited' : 'provider_error');
    const retryAfter = Number(response.headers.get('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterSeconds = retryAfter;
    throw error;
  }
  return rows.map(activity => ({
    id: `activity-strava-${activity.id}`,
    externalId: `strava:${activity.id}`,
    date: String(activity.start_date_local || activity.start_date || '').slice(0, 10),
    startTime: activity.start_date || null,
    name: activity.name || activity.sport_type || activity.type || 'Strava activity',
    type: activity.sport_type || activity.type || 'Run',
    durationMin: Math.round(Number(activity.moving_time || activity.elapsed_time || 0) / 60),
    distanceKm: +(Number(activity.distance || 0) / 1000).toFixed(2),
    elevationGainM: Math.round(Number(activity.total_elevation_gain || 0)),
    elevationLossM: 0,
    avgHr: activity.average_heartrate == null ? null : Number(activity.average_heartrate),
    maxHr: activity.max_heartrate == null ? null : Number(activity.max_heartrate),
    rpe: activity.perceived_exertion == null ? null : Number(activity.perceived_exertion),
    activeEnergyKcal: activity.calories == null ? null : Number(activity.calories),
    terrain: /trail|hike/i.test(`${activity.sport_type} ${activity.name}`) ? 'trail' : 'road',
    isNight: false,
    source: 'strava',
    importedAt: new Date().toISOString()
  }));
}

async function fetchGoogleHealthPayload(token, days) {
  const start = new Date(Date.now() - days * 86400000);
  const startIso = start.toISOString();
  const startDate = startIso.slice(0, 10);
  const raw = {};
  const warnings = [];
  let successfulTypes = 0;

  for (const [key, spec] of Object.entries(GOOGLE_HEALTH_TYPES)) {
    try {
      const fromValue = spec.filterField.includes('.date')
        ? startDate
        : /\.civil_(start|end)_time|\.civil_time/.test(spec.filterField)
          ? startIso.slice(0, 19)
          : startIso;
      raw[key] = await fetchGoogleHealthDataType(token, spec, fromValue);
      successfulTypes += 1;
    } catch (error) {
      if (error.status === 401) throw error;
      warnings.push({ dataType: spec.apiName, code: error.code || 'provider_error', message: error.message });
      raw[key] = [];
    }
  }
  if (!successfulTypes) throw new HttpError(502, 'Google Health API did not return any readable data type', 'google_health_no_data_types');
  return normalizeGoogleHealthApiData(raw, { days, warnings });
}

async function fetchGoogleHealthDataType(token, spec, fromValue) {
  const rows = [];
  let pageToken = '';
  do {
    const url = new URL(`https://health.googleapis.com/v4/users/me/dataTypes/${spec.apiName}/dataPoints`);
    url.searchParams.set('pageSize', String(spec.pageSize));
    if (fromValue) url.searchParams.set('filter', `${spec.filterField} >= "${fromValue}"`);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token.access_token}` } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
      const error = new HttpError(response.status, `Google Health ${spec.apiName} sync failed: ${detail}`, response.status === 429 ? 'rate_limited' : 'google_health_api_error');
      const retryAfter = Number(response.headers.get('retry-after'));
      if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterSeconds = retryAfter;
      throw error;
    }
    rows.push(...(payload.dataPoints || payload.data_points || []));
    pageToken = payload.nextPageToken || payload.next_page_token || '';
  } while (pageToken);
  return rows;
}

export function normalizeGoogleHealthApiData(raw = {}, options = {}) {
  const exportedAt = new Date().toISOString();
  const daily = new Map();
  const ensureDay = date => {
    const key = googleDate(date);
    if (!key) return null;
    if (!daily.has(key)) daily.set(key, { date: key, sourceDevice: 'Google Health / Fitbit' });
    return daily.get(key);
  };

  const activities = (raw.exercise || []).map((point, index) => {
    const value = pointValue(point, ['exercise', 'exerciseDataPoint']);
    const interval = value.interval || point.interval || {};
    const startTime = intervalTimestamp(interval, 'start');
    const endTime = intervalTimestamp(interval, 'end');
    const activityDate = intervalDate(interval, 'start') || intervalDate(interval, 'end');
    const summary = value.metricsSummary || value.metrics_summary || value.summary || {};
    const durationMin = durationMinutes(value.activeDuration || value.active_duration) || minutesBetween(startTime, endTime);
    const type = value.exerciseType || value.exercise_type || value.type || 'Workout';
    const name = value.displayName || value.display_name || value.title || value.name || humanize(type);
    const pointName = point.name || point.dataPointName || point.data_point_name || value.externalId || value.external_id || `${startTime || exportedAt}-${index}`;
    const distanceMm = firstNumberOrNull(summary.distanceMillimeters, summary.distance_millimeters, value.distanceMillimeters, value.distance_millimeters);
    const elevationGainMm = firstNumberOrNull(summary.elevationGainMillimeters, summary.elevation_gain_millimeters, value.elevationGainMillimeters, value.elevation_gain_millimeters);
    const elevationGainMeters = firstNumberOrNull(summary.elevationGainMeters, summary.elevation_gain_meters, value.elevationGainMeters, value.elevation_gain_meters);
    const elevationLossMm = firstNumberOrNull(summary.elevationLossMillimeters, summary.elevation_loss_millimeters, value.elevationLossMillimeters, value.elevation_loss_millimeters);
    const elevationLossMeters = firstNumberOrNull(summary.elevationLossMeters, summary.elevation_loss_meters, value.elevationLossMeters, value.elevation_loss_meters);
    return {
      id: `activity-google-health-${stableHash(pointName)}`,
      externalId: `google-health:${pointName}`,
      date: activityDate,
      startTime: startTime || null,
      endTime: endTime || null,
      name,
      type,
      durationMin: round(durationMin, 1),
      distanceKm: round((distanceMm || 0) / 1_000_000, 2),
      elevationGainM: round(elevationGainMm != null ? elevationGainMm / 1000 : elevationGainMeters || 0, 0),
      elevationLossM: round(elevationLossMm != null ? elevationLossMm / 1000 : elevationLossMeters || 0, 0),
      avgHr: nullableNumber(summary.averageHeartRateBeatsPerMinute, summary.average_heart_rate_beats_per_minute, summary.averageHeartRateBpm, summary.avgHeartRateBpm, summary.average_heart_rate_bpm),
      maxHr: nullableNumber(summary.maximumHeartRateBeatsPerMinute, summary.maxHeartRateBeatsPerMinute, summary.maximum_heart_rate_beats_per_minute, summary.maxHeartRateBpm, summary.max_heart_rate_bpm),
      rpe: nullableNumber(value.perceivedExertion, value.perceived_exertion),
      activeEnergyKcal: nullableNumber(summary.caloriesKcal, summary.calories_kcal, value.caloriesKcal, value.calories_kcal),
      cadence: nullableNumber(summary.averageCadence, summary.avgCadence, summary.average_cadence),
      terrain: /trail|hike|mountain/i.test(`${type} ${name}`) ? 'trail' : /strength/i.test(`${type} ${name}`) ? 'strength' : 'road',
      isNight: isNightTime(civilIntervalTimestamp(interval, 'start') || startTime),
      source: 'google_health',
      sourceDevice: sourceDevice(point, value),
      importedAt: exportedAt
    };
  }).filter(item => item.date && item.externalId);

  for (const point of raw.sleep || []) {
    const value = pointValue(point, ['sleep', 'sleepDataPoint']);
    const interval = value.interval || point.interval || {};
    if (value.metadata?.nap === true || value.metadata?.isNap === true || value.isNap === true) continue;
    const date = intervalDate(interval, 'end') || intervalDate(interval, 'start');
    const day = ensureDay(date);
    if (!day) continue;
    const startTime = intervalTimestamp(interval, 'start');
    const endTime = intervalTimestamp(interval, 'end');
    const minutes = firstNumberOrNull(value.summary?.minutesAsleep, value.summary?.minutes_asleep, value.minutesAsleep, value.minutes_asleep) ?? minutesBetween(startTime, endTime);
    day.sleepHours = round((day.sleepHours || 0) + Number(minutes || 0) / 60, 2);
    day.sourceDevice = mergeSourceDevice(day.sourceDevice, sourceDevice(point, value));
  }
  for (const point of raw.dailyRestingHeartRate || []) {
    const value = pointValue(point, ['dailyRestingHeartRate', 'daily_resting_heart_rate', 'dailyRestingHeartRateDataPoint']);
    const day = ensureDay(value.date || point.date);
    if (day) {
      day.restingHr = nullableNumber(value.beatsPerMinute, value.beats_per_minute, value.bpm, value.value);
      day.sourceDevice = mergeSourceDevice(day.sourceDevice, sourceDevice(point, value));
    }
  }
  for (const point of raw.dailyHeartRateVariability || []) {
    const value = pointValue(point, ['dailyHeartRateVariability', 'daily_heart_rate_variability', 'dailyHeartRateVariabilityDataPoint']);
    const day = ensureDay(value.date || point.date);
    if (day) {
      day.hrvMs = nullableNumber(
        value.averageHeartRateVariabilityMilliseconds,
        value.average_heart_rate_variability_milliseconds,
        value.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds,
        value.deep_sleep_root_mean_square_of_successive_differences_milliseconds,
        value.rmssdMillis,
        value.rmssd_millis,
        value.rootMeanSquareOfSuccessiveDifferencesMillis,
        value.sdnnMillis,
        value.value
      );
      day.sourceDevice = mergeSourceDevice(day.sourceDevice, sourceDevice(point, value));
    }
  }
  aggregateIntervalMetric(raw.steps, ['steps', 'stepsDataPoint'], ensureDay, value => nullableNumber(value.count, value.steps, value.value), 'steps');
  aggregateIntervalMetric(raw.activeEnergyBurned, ['activeEnergyBurned', 'active_energy_burned', 'activeEnergyBurnedDataPoint'], ensureDay, value => nullableNumber(value.kcal, value.caloriesKcal, value.calories_kcal, value.value), 'activeEnergyKcal');
  aggregateIntervalMetric(raw.activeMinutes, ['activeMinutes', 'active_minutes', 'activeMinutesDataPoint'], ensureDay, value => {
    const direct = nullableNumber(value.minutes, value.totalMinutes, value.total_minutes);
    if (direct != null) return direct;
    if (Array.isArray(value.activeMinutesByActivityLevel)) {
      return value.activeMinutesByActivityLevel.reduce((total, row) => total + Number(row?.activeMinutes || 0), 0);
    }
    if (Array.isArray(value.active_minutes_by_activity_level)) {
      return value.active_minutes_by_activity_level.reduce((total, row) => total + Number(row?.active_minutes || row?.activeMinutes || 0), 0);
    }
    return durationMinutes(value.duration || value.activeDuration || value.active_duration)
      || (firstNumber(value.moderateDurationSeconds, value.moderate_duration_seconds, 0) + firstNumber(value.vigorousDurationSeconds, value.vigorous_duration_seconds, 0)) / 60;
  }, 'exerciseMinutes');
  aggregateIntervalMetric(raw.distance, ['distance', 'distanceDataPoint'], ensureDay, value => {
    const millimeters = nullableNumber(value.millimeters, value.distanceMillimeters, value.distance_millimeters, value.value);
    return millimeters == null ? null : millimeters / 1_000_000;
  }, 'walkingRunningDistanceKm');

  const bodyByDate = new Map();
  for (const point of raw.weight || []) {
    const value = pointValue(point, ['weight', 'weightDataPoint']);
    const sample = observationSample(value, point);
    const measuredAt = observationTimestamp(sample);
    const date = observationDate(sample);
    if (!date) continue;
    const record = bodyByDate.get(date) || { date, measuredAt, source: 'google_health', sourceDevice: sourceDevice(point, value), importedAt: exportedAt };
    const grams = nullableNumber(value.weightGrams, value.weight_grams, value.grams, value.value);
    if (grams != null) record.weightKg = round(grams / 1000, 2);
    if (!record.measuredAt && measuredAt) record.measuredAt = measuredAt;
    record.sourceDevice = mergeSourceDevice(record.sourceDevice, sourceDevice(point, value));
    bodyByDate.set(date, record);
  }
  for (const point of raw.bodyFat || []) {
    const value = pointValue(point, ['bodyFat', 'body_fat', 'bodyFatDataPoint']);
    const sample = observationSample(value, point);
    const measuredAt = observationTimestamp(sample);
    const date = observationDate(sample);
    if (!date) continue;
    const record = bodyByDate.get(date) || { date, measuredAt, source: 'google_health', sourceDevice: sourceDevice(point, value), importedAt: exportedAt };
    record.percentBodyFat = nullableNumber(value.percentage, value.percent, value.bodyFatPercentage, value.body_fat_percentage, value.value);
    if (!record.measuredAt && measuredAt) record.measuredAt = measuredAt;
    record.sourceDevice = mergeSourceDevice(record.sourceDevice, sourceDevice(point, value));
    bodyByDate.set(date, record);
  }

  return {
    source: 'google_health',
    schemaVersion: 1,
    exportedAt,
    range: { days: Number(options.days || 90) },
    activities,
    dailyMetrics: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    bodyComposition: [...bodyByDate.values()].map((item, index) => ({ id: `google-health-body-${stableHash(`${item.date}-${index}`)}`, ...item })),
    warnings: options.warnings || []
  };
}

function aggregateIntervalMetric(points = [], keys, ensureDay, extractor, field) {
  for (const point of points || []) {
    const value = pointValue(point, keys);
    const interval = value.interval || point.interval || {};
    const date = intervalDate(interval, 'start') || intervalDate(interval, 'end');
    const day = ensureDay(date);
    const amount = extractor(value);
    if (!day || amount == null || !Number.isFinite(Number(amount))) continue;
    day[field] = round(Number(day[field] || 0) + Number(amount), field === 'walkingRunningDistanceKm' ? 2 : 1);
    day.sourceDevice = mergeSourceDevice(day.sourceDevice, sourceDevice(point, value));
  }
}

function pointValue(point, keys) {
  for (const key of keys) if (point?.[key] != null) return point[key];
  for (const key of keys) if (point?.value?.[key] != null) return point.value[key];
  return point?.value && typeof point.value === 'object' ? point.value : point || {};
}
function googleDate(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
  }
  if (value.date) return googleDate(value.date);
  const year = Number(value.year);
  const month = Number(value.month);
  const day = Number(value.day);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function civilDateTimeToIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  const date = googleDate(value.date || value);
  if (!date) return null;
  const time = value.time || {};
  const hour = Number(time.hours ?? time.hour ?? 0);
  const minute = Number(time.minutes ?? time.minute ?? 0);
  const second = Number(time.seconds ?? time.second ?? 0);
  const nanos = Number(time.nanos ?? time.nanoseconds ?? 0);
  const base = `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  return nanos > 0 ? `${base}.${String(nanos).padStart(9, '0').replace(/0+$/, '')}` : base;
}
function intervalPhysicalTime(interval, side) {
  return interval?.[`${side}Time`]
    || interval?.[`${side}_time`]
    || null;
}
function civilIntervalTimestamp(interval, side) {
  const cap = side === 'start' ? 'Start' : 'End';
  return civilDateTimeToIso(interval?.[`civil${cap}Time`] || interval?.[`civil_${side}_time`]);
}
function intervalTimestamp(interval, side) {
  return intervalPhysicalTime(interval, side) || civilIntervalTimestamp(interval, side) || null;
}
function intervalDate(interval, side) {
  const cap = side === 'start' ? 'Start' : 'End';
  return googleDate(interval?.[`civil${cap}Time`] || interval?.[`civil_${side}_time`])
    || googleDate(intervalPhysicalTime(interval, side));
}
function observationSample(value, point) {
  return value?.sampleTime || value?.sample_time || point?.sampleTime || point?.sample_time || null;
}
function observationTimestamp(sample) {
  if (!sample) return null;
  if (typeof sample === 'string') return sample;
  return sample.physicalTime || sample.physical_time || civilDateTimeToIso(sample.civilTime || sample.civil_time) || null;
}
function observationDate(sample) {
  if (!sample) return '';
  if (typeof sample === 'string') return googleDate(sample);
  return googleDate(sample.civilTime || sample.civil_time) || googleDate(sample.physicalTime || sample.physical_time);
}
function sourceDevice(point, value) {
  const dataSource = point?.dataSource || point?.data_source || value?.dataSource || value?.data_source || {};
  const device = dataSource.device || value?.metadata?.device || {};
  const application = dataSource.application || value?.metadata?.application || {};
  return device.displayName
    || device.display_name
    || application.displayName
    || application.display_name
    || application.packageName
    || application.package_name
    || dataSource.platform
    || value?.metadata?.dataOrigin?.displayName
    || point?.dataOrigin?.displayName
    || 'Google Health / Fitbit';
}
function mergeSourceDevice(existing, incoming) {
  const values = [existing, incoming].filter(Boolean).filter(value => value !== 'Google Health / Fitbit');
  return [...new Set(values)].join(' + ') || 'Google Health / Fitbit';
}
function minutesBetween(start, end) { const a = Date.parse(start); const b = Date.parse(end); return Number.isFinite(a) && Number.isFinite(b) && b > a ? (b - a) / 60000 : 0; }
function durationMinutes(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return value / 60;
  if (typeof value === 'string') {
    const match = value.match(/^(-?\d+(?:\.\d+)?)s$/);
    if (match) return Number(match[1]) / 60;
    const number = Number(value);
    return Number.isFinite(number) ? number / 60 : 0;
  }
  const seconds = Number(value.seconds || value.value || 0) + Number(value.nanos || 0) / 1e9;
  return seconds / 60;
}
function firstNumber(...values) { for (const value of values) { const number = Number(value); if (Number.isFinite(number)) return number; } return 0; }
function firstNumberOrNull(...values) { for (const value of values) { if (value === null || value === undefined || value === '') continue; const number = Number(value); if (Number.isFinite(number)) return number; } return null; }
function nullableNumber(...values) { return firstNumberOrNull(...values); }
function round(value, digits = 0) { const factor = 10 ** digits; return Math.round((Number(value) || 0) * factor) / factor; }
function isNightTime(value) { if (!value) return false; const civil = String(value).match(/T(\d{2}):/); const hour = civil ? Number(civil[1]) : new Date(value).getHours(); return hour >= 18 || hour < 5; }
function humanize(value) { return String(value || 'Workout').replace(/[_-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase()); }
function stableHash(value) { let hash = 2166136261; for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, '0'); }

function providerConfig(provider, env, origin) {
  const upper = provider.toUpperCase();
  const defaults = provider === 'strava' ? {
    authorizeUrl: 'https://www.strava.com/oauth/authorize',
    tokenUrl: 'https://www.strava.com/oauth/token',
    scope: 'read,activity:read_all'
  } : provider === 'google_health' ? {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: [
      'openid', 'email', 'profile',
      'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
      'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
      'https://www.googleapis.com/auth/googlehealth.sleep.readonly'
    ].join(' ')
  } : {};
  const config = {
    clientId: env[`${upper}_CLIENT_ID`],
    clientSecret: env[`${upper}_CLIENT_SECRET`],
    authorizeUrl: env[`${upper}_AUTHORIZE_URL`] || defaults.authorizeUrl,
    tokenUrl: env[`${upper}_TOKEN_URL`] || defaults.tokenUrl,
    scope: env[`${upper}_SCOPES`] || defaults.scope || '',
    redirectUri: `${origin}/oauth/${provider}/callback`
  };
  for (const [key, value] of Object.entries(config)) if (['clientId', 'clientSecret', 'authorizeUrl', 'tokenUrl'].includes(key) && !value) throw new Error(`${provider} ${key} is not configured`);
  return config;
}

async function authorizeDevice(request, env) {
  requireBindings(env, ['WEARABLE_TOKENS', 'TOKEN_ENCRYPTION_KEY']);
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token || token.length < 40) throw new HttpError(401, 'Missing device authorization');
  return sha256(token);
}
function pathProvider(pathname) { return pathname.split('/').find(part => CLOUD_PROVIDERS.includes(part)); }
function providerIdentity(provider, token) {
  if (provider === 'strava') return token.athlete?.id;
  if (provider === 'google_health' && token.id_token) return decodeJwtPayload(token.id_token)?.sub || null;
  return token.user_id || token.userId || token.account_id || null;
}
function decodeJwtPayload(token) { try { const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(atob(payload)); } catch { return null; } }
function safeReturnTo(value, appOrigin) { try { const url = new URL(value || appOrigin); if (url.origin !== new URL(appOrigin).origin) return appOrigin; return url.toString(); } catch { return appOrigin; } }
function redirectResult(returnTo, provider, connected, error) { const target = new URL(returnTo || '/'); const separator = target.hash.includes('?') ? '&' : '?'; target.hash = `${target.hash || '#/connections'}${separator}provider=${encodeURIComponent(provider)}${connected ? '&connected=1' : ''}${error ? `&error=${encodeURIComponent(error)}` : ''}`; return Response.redirect(target.toString(), 302); }
function requireBindings(env, names) { for (const name of names) if (!env[name]) throw new Error(`Missing Worker binding/secret: ${name}`); }
function randomHex(bytes) { const data = new Uint8Array(bytes); crypto.getRandomValues(data); return [...data].map(value => value.toString(16).padStart(2, '0')).join(''); }
async function sha256(value) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return bytesToHex(new Uint8Array(digest)); }
function bytesToHex(bytes) { return [...bytes].map(value => value.toString(16).padStart(2, '0')).join(''); }
function base64ToBytes(value) { const binary = atob(value); return Uint8Array.from(binary, char => char.charCodeAt(0)); }
function bytesToBase64(bytes) { let binary = ''; bytes.forEach(byte => { binary += String.fromCharCode(byte); }); return btoa(binary); }
async function encryptionKey(secret) { const raw = secret.length === 44 ? base64ToBytes(secret) : new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))); return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); }
async function encryptJson(value, secret) { const iv = crypto.getRandomValues(new Uint8Array(12)); const key = await encryptionKey(secret); const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value)))); return JSON.stringify({ iv: bytesToBase64(iv), data: bytesToBase64(encrypted) }); }
async function decryptJson(value, secret) { const parsed = JSON.parse(value); const key = await encryptionKey(secret); const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(parsed.iv) }, key, base64ToBytes(parsed.data)); return JSON.parse(new TextDecoder().decode(decrypted)); }
function cors(response, env) { const headers = new Headers(response.headers); headers.set('access-control-allow-origin', env.APP_ORIGIN || '*'); headers.set('access-control-allow-headers', 'authorization,content-type'); headers.set('access-control-allow-methods', 'GET,POST,DELETE,OPTIONS'); return new Response(response.body, { status: response.status, headers }); }
function json(body, status, env, extraHeaders = {}) { return cors(Response.json(body, { status, headers: extraHeaders }), env); }
class HttpError extends Error {
  constructor(status, message, code = null) { super(message); this.status = status; this.code = code; this.retryAfterSeconds = null; }
}
