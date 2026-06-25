import { SOURCE_TYPES } from './constants.js';

export const ACTIVITY_DEDUP_SCHEMA_VERSION = 1;

const AUTO_SOURCES = new Set([
  SOURCE_TYPES.APPLE_HEALTH,
  SOURCE_TYPES.GARMIN,
  SOURCE_TYPES.SUUNTO,
  SOURCE_TYPES.STRAVA,
  SOURCE_TYPES.GPX,
  SOURCE_TYPES.TCX,
  SOURCE_TYPES.CSV
]);

const SOURCE_PRIORITY = Object.freeze({
  manual: 100,
  garmin: 92,
  suunto: 90,
  gpx: 88,
  tcx: 86,
  apple_health: 84,
  strava: 82,
  csv: 65,
  legacy: 45,
  hybrid: 40
});

const FIELD_PRIORITY = Object.freeze({
  distanceKm: ['garmin', 'suunto', 'gpx', 'tcx', 'strava', 'apple_health', 'csv', 'legacy'],
  elevationGainM: ['gpx', 'tcx', 'garmin', 'suunto', 'strava', 'apple_health', 'csv', 'legacy'],
  elevationLossM: ['gpx', 'tcx', 'garmin', 'suunto', 'strava', 'apple_health', 'csv', 'legacy'],
  avgHr: ['garmin', 'apple_health', 'suunto', 'strava', 'tcx', 'gpx', 'csv', 'legacy'],
  maxHr: ['garmin', 'apple_health', 'suunto', 'strava', 'tcx', 'gpx', 'csv', 'legacy'],
  activeEnergyKcal: ['apple_health', 'garmin', 'suunto', 'strava', 'csv', 'legacy'],
  durationMin: ['garmin', 'suunto', 'apple_health', 'strava', 'gpx', 'tcx', 'csv', 'legacy'],
  rpe: ['manual', 'strava', 'garmin', 'suunto', 'apple_health', 'csv', 'legacy']
});

export function normalizeActivityIdentity(activity = {}) {
  const record = structuredClone(activity);
  const source = normalizeSource(record.source);
  const sources = unique([
    ...(Array.isArray(record.sources) ? record.sources : []),
    ...(source && source !== SOURCE_TYPES.HYBRID ? [source] : [])
  ].map(normalizeSource).filter(Boolean));

  const externalRefs = normalizeExternalRefs(record, source);
  const primarySource = normalizeSource(record.primarySource)
    || choosePrimarySource(sources, record)
    || source
    || SOURCE_TYPES.MANUAL;

  record.source = sources.length > 1 ? SOURCE_TYPES.HYBRID : (sources[0] || source || SOURCE_TYPES.MANUAL);
  record.primarySource = primarySource;
  record.sources = sources.length ? sources : [primarySource];
  record.externalRefs = externalRefs;
  record.canonicalFingerprint = activityFingerprint(record);
  record.dedup = {
    ...record.dedup,
    schemaVersion: ACTIVITY_DEDUP_SCHEMA_VERSION,
    status: record.dedup?.status || 'canonical',
    canonicalFingerprint: record.canonicalFingerprint,
    mergedCount: Math.max(1, Number(record.dedup?.mergedCount) || externalRefs.length || 1)
  };
  return record;
}

export function activityFingerprint(activity = {}) {
  const start = parseTime(activity.startTime);
  const roundedStart = Number.isFinite(start) ? Math.round(start / 300000) * 300000 : null;
  const duration = roundTo(Number(activity.durationMin) || 0, 2);
  const distance = roundTo(Number(activity.distanceKm) || 0, 0.1);
  return [
    activity.date || dateFromTime(activity.startTime) || 'unknown-date',
    roundedStart == null ? 'no-start' : new Date(roundedStart).toISOString(),
    typeGroup(activity),
    duration,
    distance
  ].join('|');
}

export function scoreActivityMatch(left, right) {
  const a = normalizeActivityIdentity(left);
  const b = normalizeActivityIdentity(right);
  const exactRef = findSharedExternalRef(a, b);
  if (exactRef) return { score: 100, decision: 'exact', reasons: ['same_external_reference'], exactRef };
  if (wasKeptSeparate(a, b)) return { score: 0, decision: 'none', reasons: ['user_kept_separate'] };

  const aSource = a.primarySource || a.source;
  const bSource = b.primarySource || b.source;
  if (!isAutoDedupSource(aSource) || !isAutoDedupSource(bSource) || aSource === bSource) {
    return { score: 0, decision: 'none', reasons: ['source_not_eligible'] };
  }

  const reasons = [];
  let score = 0;
  const aStart = parseTime(a.startTime);
  const bStart = parseTime(b.startTime);
  const hasBothStarts = Number.isFinite(aStart) && Number.isFinite(bStart);

  if (hasBothStarts) {
    const deltaMin = Math.abs(aStart - bStart) / 60000;
    if (deltaMin <= 3) { score += 52; reasons.push('start_within_3m'); }
    else if (deltaMin <= 8) { score += 46; reasons.push('start_within_8m'); }
    else if (deltaMin <= 15) { score += 34; reasons.push('start_within_15m'); }
    else if (deltaMin <= 30) { score += 16; reasons.push('start_within_30m'); }
    else return { score: 0, decision: 'none', reasons: ['start_too_far_apart'] };
  } else {
    const sameDate = comparableDate(a) && comparableDate(a) === comparableDate(b);
    if (!sameDate) return { score: 0, decision: 'none', reasons: ['different_date'] };
    score += 4;
    reasons.push('same_date_without_both_start_times');
  }

  const typeScore = compareType(a, b);
  score += typeScore.score;
  reasons.push(typeScore.reason);
  if (typeScore.incompatible) return { score: Math.max(0, score), decision: 'none', reasons };

  score += numericSimilarity(a.durationMin, b.durationMin, {
    excellent: 0.04, good: 0.10, fair: 0.20, points: [24, 19, 9], key: 'duration', reasons
  });
  score += numericSimilarity(a.distanceKm, b.distanceKm, {
    excellent: 0.03, good: 0.08, fair: 0.16, points: [18, 14, 7], key: 'distance', reasons, zeroMissing: true
  });
  score += numericSimilarity(a.avgHr, b.avgHr, {
    excellent: 0.035, good: 0.08, fair: 0.15, points: [6, 4, 2], key: 'average_hr', reasons, zeroMissing: true
  });

  const autoThreshold = hasBothStarts ? 72 : 88;
  const reviewThreshold = hasBothStarts ? 58 : 72;
  const decision = score >= autoThreshold ? 'merge' : score >= reviewThreshold ? 'review' : 'none';
  return { score: Math.min(100, Math.max(0, Math.round(score))), decision, reasons };
}

export function mergeDuplicateActivities(existing, incoming, match = { score: 100, reasons: ['exact'] }, options = {}) {
  const left = normalizeActivityIdentity(existing);
  const right = normalizeActivityIdentity(incoming);
  const exactUpdate = match.decision === 'exact' || options.exactUpdate;
  const preferIncoming = exactUpdate
    && left.sources.length === 1
    && right.sources.length === 1
    && left.sources[0] === right.sources[0];
  const sources = unique([...left.sources, ...right.sources]);
  const primarySource = choosePrimarySource(sources, completenessWinner(left, right));
  const merged = {
    ...left,
    id: left.id,
    date: chooseDate(left, right),
    startTime: chooseTime(left.startTime, right.startTime, preferIncoming),
    endTime: chooseTime(left.endTime, right.endTime, preferIncoming),
    name: chooseName(left, right, preferIncoming),
    type: chooseType(left, right, preferIncoming),
    durationMin: chooseNumericField('durationMin', left, right, preferIncoming),
    distanceKm: chooseNumericField('distanceKm', left, right, preferIncoming),
    elevationGainM: chooseNumericField('elevationGainM', left, right, preferIncoming),
    elevationLossM: chooseNumericField('elevationLossM', left, right, preferIncoming),
    avgHr: chooseNumericField('avgHr', left, right, preferIncoming),
    maxHr: chooseNumericField('maxHr', left, right, preferIncoming),
    maxHrReference: chooseNonEmpty(right.maxHrReference, left.maxHrReference),
    activeEnergyKcal: chooseNumericField('activeEnergyKcal', left, right, preferIncoming),
    rpe: chooseNumericField('rpe', left, right, preferIncoming),
    terrain: chooseTerrain(left.terrain, right.terrain),
    isNight: Boolean(left.isNight || right.isNight),
    note: chooseNonEmpty(left.note, right.note),
    source: sources.length > 1 ? SOURCE_TYPES.HYBRID : sources[0],
    primarySource,
    sources,
    externalId: left.externalId || right.externalId || null,
    externalRefs: mergeExternalRefs(left.externalRefs, right.externalRefs),
    importedAt: chooseLatestIso(left.importedAt, right.importedAt),
    updatedAt: chooseLatestIso(left.updatedAt, right.updatedAt, new Date().toISOString()),
    dedup: {
      schemaVersion: ACTIVITY_DEDUP_SCHEMA_VERSION,
      status: 'canonical',
      mergedAt: new Date().toISOString(),
      mergedCount: Math.max(2, Number(left.dedup?.mergedCount || 1) + (exactUpdate ? 0 : Number(right.dedup?.mergedCount || 1))),
      lastMatchScore: Number(match.score) || 0,
      lastMatchReasons: match.reasons || [],
      mergedRecordIds: unique([...(left.dedup?.mergedRecordIds || []), ...(right.dedup?.mergedRecordIds || []), right.id].filter(id => id && id !== left.id))
    }
  };
  merged.canonicalFingerprint = activityFingerprint(merged);
  merged.dedup.canonicalFingerprint = merged.canonicalFingerprint;
  return merged;
}

export function prepareActivityImport(existingActivities = [], incomingActivities = [], options = {}) {
  const working = existingActivities.map(normalizeActivityIdentity);
  const removedIds = new Set();
  const changedIds = new Set();
  const summary = { incoming: incomingActivities.length, added: 0, updated: 0, merged: 0, review: 0, skipped: 0, removed: 0 };
  const decisions = [];

  for (const rawIncoming of incomingActivities) {
    if (!rawIncoming?.id && !rawIncoming?.externalId) { summary.skipped += 1; continue; }
    const incoming = normalizeActivityIdentity(ensureUniqueId(rawIncoming, working));

    const exactIndex = working.findIndex(item => findSharedExternalRef(item, incoming));
    if (exactIndex >= 0) {
      const match = { score: 100, decision: 'exact', reasons: ['same_external_reference'] };
      working[exactIndex] = mergeDuplicateActivities(working[exactIndex], incoming, match, { exactUpdate: true });
      changedIds.add(working[exactIndex].id);
      summary.updated += 1;
      decisions.push({ incomingId: incoming.id, canonicalId: working[exactIndex].id, ...match });
      continue;
    }

    let best = null;
    for (let index = 0; index < working.length; index += 1) {
      const candidate = working[index];
      if (removedIds.has(candidate.id)) continue;
      const match = scoreActivityMatch(candidate, incoming);
      if (!best || match.score > best.match.score) best = { index, candidate, match };
    }

    if (best?.match.decision === 'merge') {
      const canonical = mergeDuplicateActivities(best.candidate, incoming, best.match);
      working[best.index] = canonical;
      changedIds.add(canonical.id);
      if (incoming.id !== canonical.id) removedIds.add(incoming.id);
      summary.merged += 1;
      decisions.push({ incomingId: incoming.id, canonicalId: canonical.id, ...best.match });
      continue;
    }

    if (best?.match.decision === 'review') {
      incoming.dedup = {
        ...incoming.dedup,
        status: 'review',
        possibleDuplicateOf: best.candidate.id,
        reviewScore: best.match.score,
        reviewReasons: best.match.reasons
      };
      summary.review += 1;
      decisions.push({ incomingId: incoming.id, canonicalId: best.candidate.id, ...best.match });
    }

    working.push(incoming);
    changedIds.add(incoming.id);
    summary.added += 1;
  }

  summary.removed = removedIds.size;
  return {
    records: working.filter(item => !removedIds.has(item.id)),
    changedRecords: working.filter(item => changedIds.has(item.id) && !removedIds.has(item.id)),
    removedIds: [...removedIds],
    summary,
    decisions
  };
}

export function reconcileActivityDuplicates(activities = []) {
  const sorted = [...activities].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const result = prepareActivityImport([], sorted, { reconciliation: true });
  const originalIds = new Set(activities.map(item => item.id));
  const finalIds = new Set(result.records.map(item => item.id));
  const removedIds = [...originalIds].filter(id => !finalIds.has(id));
  return {
    ...result,
    removedIds,
    summary: { ...result.summary, incoming: activities.length, removed: removedIds.length }
  };
}

export function dedupStatusSummary(activities = []) {
  return {
    total: activities.length,
    hybrid: activities.filter(item => (item.sources || []).length > 1 || item.source === SOURCE_TYPES.HYBRID).length,
    review: activities.filter(item => item.dedup?.status === 'review').length,
    providers: unique(activities.flatMap(item => item.sources || [item.source]).filter(Boolean)).sort()
  };
}

function normalizeExternalRefs(record, source) {
  const refs = Array.isArray(record.externalRefs) ? record.externalRefs : [];
  if (record.externalId && source && source !== SOURCE_TYPES.HYBRID) refs.push({ source, externalId: String(record.externalId) });
  return mergeExternalRefs([], refs);
}

function mergeExternalRefs(left = [], right = []) {
  const out = [];
  const seen = new Set();
  for (const ref of [...left, ...right]) {
    if (!ref?.externalId) continue;
    const source = normalizeSource(ref.source) || 'unknown';
    const key = `${source}:${String(ref.externalId)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ source, externalId: String(ref.externalId) });
  }
  return out;
}

function findSharedExternalRef(a, b) {
  const left = new Set((a.externalRefs || []).map(ref => `${normalizeSource(ref.source)}:${ref.externalId}`));
  return (b.externalRefs || []).find(ref => left.has(`${normalizeSource(ref.source)}:${ref.externalId}`)) || null;
}

function wasKeptSeparate(a, b) {
  const left = new Set(a.dedup?.keptSeparateFrom || []);
  const right = new Set(b.dedup?.keptSeparateFrom || []);
  return left.has(b.id) || right.has(a.id);
}

function isAutoDedupSource(source) {
  return AUTO_SOURCES.has(normalizeSource(source));
}

function normalizeSource(value) {
  return String(value || '').trim().toLowerCase().replace(/[- ]/g, '_');
}

function typeGroup(activity = {}) {
  const value = `${activity.type || ''} ${activity.name || ''}`.toLowerCase();
  if (/trail|run|jog|treadmill/.test(value)) return 'run';
  if (/hike|walk|trek/.test(value)) return 'walk_hike';
  if (/ride|cycling|bike/.test(value)) return 'cycle';
  if (/strength|weight|functional|gym/.test(value)) return 'strength';
  if (/swim/.test(value)) return 'swim';
  if (/yoga|pilates|mobility|rehab/.test(value)) return 'mobility';
  return 'other';
}

function compareType(a, b) {
  const left = typeGroup(a);
  const right = typeGroup(b);
  if (left === right) return { score: 10, reason: 'same_activity_group', incompatible: false };
  const compatible = new Set(['run:walk_hike', 'walk_hike:run']);
  if (compatible.has(`${left}:${right}`)) return { score: 2, reason: 'compatible_activity_group', incompatible: false };
  return { score: -35, reason: 'incompatible_activity_group', incompatible: true };
}

function numericSimilarity(left, right, config) {
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b) || (config.zeroMissing && (!(a > 0) || !(b > 0)))) return 0;
  const denominator = Math.max(Math.abs(a), Math.abs(b), 1);
  const relative = Math.abs(a - b) / denominator;
  if (relative <= config.excellent) { config.reasons.push(`${config.key}_very_close`); return config.points[0]; }
  if (relative <= config.good) { config.reasons.push(`${config.key}_close`); return config.points[1]; }
  if (relative <= config.fair) { config.reasons.push(`${config.key}_similar`); return config.points[2]; }
  config.reasons.push(`${config.key}_different`);
  return relative > 0.35 ? -12 : -4;
}

function chooseNumericField(field, left, right, exactUpdate) {
  const leftValue = finiteOrNull(left[field]);
  const rightValue = finiteOrNull(right[field]);
  if (rightValue == null) return leftValue;
  if (leftValue == null || (leftValue === 0 && rightValue > 0)) return rightValue;
  if (exactUpdate) return rightValue;
  const order = FIELD_PRIORITY[field] || [];
  const leftRank = fieldRank(order, left.primarySource || left.source);
  const rightRank = fieldRank(order, right.primarySource || right.source);
  if (rightRank < leftRank) return rightValue;
  if (leftRank < rightRank) return leftValue;
  return completenessScore(right) >= completenessScore(left) ? rightValue : leftValue;
}

function fieldRank(order, source) {
  const index = order.indexOf(normalizeSource(source));
  return index < 0 ? 999 : index;
}

function choosePrimarySource(sources, reference = {}) {
  const candidates = sources.filter(source => source !== SOURCE_TYPES.HYBRID);
  return candidates.sort((a, b) => {
    const priority = (SOURCE_PRIORITY[b] || 0) - (SOURCE_PRIORITY[a] || 0);
    if (priority) return priority;
    return completenessScore(reference) ? 0 : String(a).localeCompare(String(b));
  })[0] || null;
}

function completenessWinner(left, right) {
  return completenessScore(right) > completenessScore(left) ? right : left;
}

function completenessScore(record = {}) {
  const fields = ['startTime', 'durationMin', 'distanceKm', 'elevationGainM', 'elevationLossM', 'avgHr', 'maxHr', 'activeEnergyKcal', 'rpe'];
  return fields.reduce((score, field) => score + (record[field] !== null && record[field] !== undefined && record[field] !== '' && record[field] !== 0 ? 1 : 0), 0);
}

function chooseDate(left, right) {
  if (left.date && right.date && left.date === right.date) return left.date;
  return dateFromTime(left.startTime) || left.date || dateFromTime(right.startTime) || right.date;
}

function chooseTime(left, right, exactUpdate) {
  if (exactUpdate && right) return right;
  if (!left) return right || null;
  if (!right) return left || null;
  return parseTime(left) <= parseTime(right) ? left : right;
}

function chooseName(left, right, preferIncoming) {
  if (preferIncoming && right.name) return right.name;
  const leftGeneric = isGenericName(left.name, left.type);
  const rightGeneric = isGenericName(right.name, right.type);
  if (leftGeneric && !rightGeneric) return right.name;
  if (!leftGeneric && rightGeneric) return left.name;
  return sourcePriority(right.primarySource || right.source) > sourcePriority(left.primarySource || left.source)
    ? (right.name || left.name)
    : (left.name || right.name);
}

function chooseType(left, right, preferIncoming) {
  if (preferIncoming && right.type) return right.type;
  return sourcePriority(right.primarySource || right.source) > sourcePriority(left.primarySource || left.source)
    ? (right.type || left.type)
    : (left.type || right.type);
}

function chooseTerrain(left, right) {
  if (left === 'trail' || right === 'trail') return 'trail';
  if (left === 'strength' || right === 'strength') return 'strength';
  if (left === 'treadmill' || right === 'treadmill') return 'treadmill';
  return left || right || 'road';
}

function sourcePriority(source) {
  return SOURCE_PRIORITY[normalizeSource(source)] || 0;
}

function isGenericName(name, type) {
  const normalized = String(name || '').trim().toLowerCase();
  if (!normalized) return true;
  return ['workout', 'activity', 'run', 'walk', 'hike', 'apple health workout', String(type || '').toLowerCase()].includes(normalized);
}

function ensureUniqueId(record, existing) {
  const copy = structuredClone(record);
  const used = new Set(existing.map(item => item.id));
  if (copy.id && !used.has(copy.id)) return copy;
  const base = copy.id || `activity-${hashString(`${copy.source}:${copy.externalId || copy.startTime || Date.now()}`)}`;
  let candidate = base;
  let suffix = 1;
  while (used.has(candidate)) candidate = `${base}-${suffix++}`;
  copy.id = candidate;
  return copy;
}

function comparableDate(activity) {
  return activity.date || dateFromTime(activity.startTime);
}

function dateFromTime(value) {
  const time = parseTime(value);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
}

function parseTime(value) {
  if (!value) return NaN;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : NaN;
}

function sortKey(activity) {
  return `${activity.startTime || `${activity.date || '9999-99-99'}T23:59:59`}|${activity.id || ''}`;
}

function roundTo(value, step) {
  if (!(step > 0)) return value;
  const decimals = String(step).includes('.') ? String(step).split('.')[1].length : 0;
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function chooseNonEmpty(primary, fallback) {
  return primary !== null && primary !== undefined && primary !== '' ? primary : fallback;
}

function chooseLatestIso(...values) {
  return values.filter(Boolean).sort().at(-1) || null;
}

function unique(values) {
  return [...new Set(values)];
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
