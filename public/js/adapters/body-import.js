import { STORES } from '../core/constants.js';

export function parseBodyCompositionImport(value) {
  if (!value || !['trail-runner-coach-body-composition','rtc70-body-composition'].includes(value.schema) || !Array.isArray(value.records)) {
    throw new Error('ไฟล์ Body Composition ไม่ถูกต้อง');
  }
  const records = value.records.map(normalizeRecord).filter(Boolean);
  if (!records.length) throw new Error('ไม่พบข้อมูล Body Composition ในไฟล์');
  return {
    records,
    profilePatch: value.profilePatch && typeof value.profilePatch === 'object' ? value.profilePatch : null,
    sourceDocument: value.sourceDocument || null
  };
}

export async function importBodyComposition(appStore, value) {
  const parsed = parseBodyCompositionImport(value);
  await appStore.upsertMany(STORES.BODY_COMPOSITION, parsed.records);
  if (parsed.profilePatch) await appStore.saveSettings(parsed.profilePatch);
  return parsed;
}

function normalizeRecord(record) {
  if (!record || !record.id || !record.date) return null;
  return {
    ...record,
    id: String(record.id),
    date: String(record.date),
    source: record.source || 'manual_body_import'
  };
}
