import { STORES } from '../core/constants.js';
import { nowIso } from '../core/date.js';
import {
  ACTIVITY_DEDUP_SCHEMA_VERSION,
  prepareActivityImport,
  reconcileActivityDuplicates,
  mergeDuplicateActivities
} from '../core/activity-dedup.js';

const MIGRATION_META_ID = `activity_dedup_v${ACTIVITY_DEDUP_SCHEMA_VERSION}`;

export async function importActivitiesWithDedup(appStore, incomingActivities, context = {}) {
  const existing = appStore.getState().activities || [];
  const result = prepareActivityImport(existing, incomingActivities, context);
  if (result.changedRecords.length) await appStore.db.bulkPut(STORES.ACTIVITIES, result.changedRecords);
  if (result.removedIds.length) await appStore.db.bulkRemove(STORES.ACTIVITIES, result.removedIds);

  const timestamp = nowIso();
  await appStore.db.put(STORES.META, {
    id: 'activity_dedup_last_import',
    schemaVersion: ACTIVITY_DEDUP_SCHEMA_VERSION,
    provider: context.provider || context.source || 'unknown',
    lastRunAt: timestamp,
    summary: result.summary,
    reviewItems: result.decisions.filter(item => item.decision === 'review').slice(0, 50)
  });
  await appStore.refreshAll();
  return { ...result.summary, decisions: result.decisions };
}

export async function reconcileStoredActivities(appStore, { force = false } = {}) {
  const state = appStore.getState();
  const marker = state.metadata?.find(item => item.id === MIGRATION_META_ID);
  const activities = state.activities || [];
  const needsNormalization = activities.some(item => !Array.isArray(item.sources) || !item.canonicalFingerprint || !item.dedup);
  if (marker && !force && !needsNormalization) return { skipped: true, ...marker.summary };

  const result = reconcileActivityDuplicates(activities);
  const changed = result.summary.merged > 0 || result.summary.review > 0 || result.removedIds.length > 0
    || (state.activities || []).some(item => !item.sources || !item.canonicalFingerprint || !item.dedup);

  if (changed) await appStore.db.replaceAll(STORES.ACTIVITIES, result.records);
  const timestamp = nowIso();
  const metadata = {
    id: MIGRATION_META_ID,
    schemaVersion: ACTIVITY_DEDUP_SCHEMA_VERSION,
    status: 'completed',
    lastRunAt: timestamp,
    forced: force,
    summary: result.summary,
    reviewItems: result.decisions.filter(item => item.decision === 'review').slice(0, 100)
  };
  await appStore.db.put(STORES.META, metadata);
  await appStore.refreshAll();
  return { skipped: false, changed, ...result.summary, decisions: result.decisions };
}


export async function resolveActivityDuplicate(appStore, duplicateId, canonicalId, action) {
  const state = appStore.getState();
  const duplicate = state.activities.find(item => item.id === duplicateId);
  const canonical = state.activities.find(item => item.id === canonicalId);
  if (!duplicate) throw new Error('ไม่พบกิจกรรมที่รอตรวจสอบ');

  if (action === 'keep') {
    const updated = {
      ...duplicate,
      dedup: {
        ...duplicate.dedup,
        status: 'kept_separate',
        resolvedAt: nowIso(),
        possibleDuplicateOf: null,
        keptSeparateFrom: [...new Set([...(duplicate.dedup?.keptSeparateFrom || []), canonicalId].filter(Boolean))]
      }
    };
    await appStore.db.put(STORES.ACTIVITIES, updated);
    await appStore.refreshAll();
    return { action: 'keep', duplicateId };
  }

  if (action !== 'merge' || !canonical) throw new Error('ไม่พบกิจกรรมหลักสำหรับรวมข้อมูล');
  const merged = mergeDuplicateActivities(canonical, duplicate, {
    score: Number(duplicate.dedup?.reviewScore) || 100,
    decision: 'merge',
    reasons: [...(duplicate.dedup?.reviewReasons || []), 'user_confirmed']
  });
  await appStore.db.put(STORES.ACTIVITIES, merged);
  await appStore.db.remove(STORES.ACTIVITIES, duplicate.id);
  await appStore.db.put(STORES.META, {
    id: 'activity_dedup_last_resolution',
    schemaVersion: ACTIVITY_DEDUP_SCHEMA_VERSION,
    resolvedAt: nowIso(),
    action: 'merge',
    canonicalId: merged.id,
    duplicateId
  });
  await appStore.refreshAll();
  return { action: 'merge', canonicalId: merged.id, duplicateId };
}
