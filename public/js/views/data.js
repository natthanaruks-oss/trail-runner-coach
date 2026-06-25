import { STORES } from '../core/constants.js';
import { createId } from '../core/id.js';
import { localDateKey, nowIso } from '../core/date.js';
import { parseActivityFile } from '../adapters/importer.js';
import { importActivitiesWithDedup, reconcileStoredActivities, resolveActivityDuplicate } from '../adapters/activity-import.js';
import { dedupStatusSummary } from '../core/activity-dedup.js';
import { importLegacyBackup, isLegacyBackup } from '../adapters/legacy.js';
import {
  importAppleHealthPayload,
  isAppleHealthBridgeAvailable,
  requestAppleHealthSync
} from '../adapters/apple-health.js';
import { pageHeader, escapeHtml, formatNumber, emptyState } from './components.js';

export function renderData(container, state, app) {
  const recent = [...state.activities].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 30);
  const appleBridge = isAppleHealthBridgeAvailable();
  const appleSync = state.metadata.find(item => item.id === 'apple_health_sync');
  const appleActivities = state.activities.filter(item => item.source === 'apple_health').length;
  const appleDays = state.checkins.filter(item => item.source === 'apple_health' || item.source === 'hybrid').length;
  const integrity = dedupStatusSummary(state.activities);
  const dedupMeta = state.metadata.find(item => item.id === 'activity_dedup_v1');
  const reviewActivities = state.activities.filter(item => item.dedup?.status === 'review');

  container.innerHTML = `
    ${pageHeader('ข้อมูล & Wearables', 'Apple Health เป็นแหล่งหลัก และทุกข้อมูลถูกแปลงเข้า Normalized Health Schema ก่อนคำนวณ', 'Local-first data hub')}
    <section class="grid two">
      ${sourceCard('Apple Health', appleBridge ? 'พร้อม Sync' : 'ต้องเปิดผ่าน iOS Companion', appleBridge ? 'green' : 'yellow', 'Sleep, RHR, HRV, Steps, Energy, Workout และ Body metrics')}
      ${sourceCard('กรอกเอง', 'พร้อมใช้', 'green', 'Pain, Fatigue, Stress, Soreness และ Session RPE')}
      ${sourceCard('GPX / TCX / CSV', 'พร้อมใช้', 'green', 'นำเข้ากิจกรรมและ Vertical จากแพลตฟอร์มนาฬิกา')}
      ${sourceCard('Garmin / Suunto / Strava', state.settings?.integrations?.syncBaseUrl ? 'พร้อมตั้งค่า OAuth' : 'ต้องใช้ Sync Worker', 'neutral', 'Cloud OAuth ผ่าน Worker และแปลงเข้าสู่ schema เดียวกับ Apple Health')}
    </section>
    <div class="grid two" style="margin-top:12px"><button class="button secondary full" data-action="open-connections">จัดการ Apple Health, Google Health/Fitbit, Garmin, Suunto และ Strava</button><button class="button primary full" data-action="open-cloud-backup">Encrypted Cloud Backup</button></div>

    <section class="section">
      <div class="section-head"><h2>Activity Integrity</h2><span>Cross-provider deduplication</span></div>
      <article class="card flat">
        <div class="grid three">
          <div><div class="card-title">กิจกรรมทั้งหมด</div><div class="metric">${integrity.total}</div></div>
          <div><div class="card-title">รวมหลายแหล่งแล้ว</div><div class="metric">${integrity.hybrid}</div></div>
          <div><div class="card-title">รอตรวจสอบ</div><div class="metric">${integrity.review}</div></div>
        </div>
        <div class="submetric" style="margin-top:10px">ระบบเทียบเวลาเริ่ม ระยะเวลา ระยะทาง ประเภทกิจกรรม และ HR ก่อนรวม Apple Health, Strava, Garmin, Suunto หรือไฟล์ GPX/TCX ให้เป็นกิจกรรมเดียว</div>
        <div class="button-row" style="margin-top:12px"><button class="button secondary" data-action="reconcile-activities">ตรวจและรวมข้อมูลซ้ำอีกครั้ง</button></div>
        <div id="dedup-status" class="submetric">${dedupMeta?.lastRunAt ? `ตรวจล่าสุด ${formatTimestamp(dedupMeta.lastRunAt)}` : 'ระบบจะตรวจอัตโนมัติเมื่อเปิดแอปและเมื่อ Sync'}</div>
        ${reviewActivities.length ? `<div class="list" style="margin-top:14px">${reviewActivities.map(activity => reviewDuplicateRow(activity, state.activities)).join('')}</div>` : ''}
      </article>
    </section>

    <section class="section">
      <div class="section-head"><h2>Apple Health Sync</h2><span>${appleSync?.lastSyncAt ? `ล่าสุด ${formatTimestamp(appleSync.lastSyncAt)}` : 'ยังไม่เคย Sync'}</span></div>
      <article class="card flat">
        <div class="grid two">
          <div><div class="card-title">Recovery days</div><div class="metric">${appleDays}</div><div class="submetric">Sleep / RHR / HRV ที่นำเข้าแล้ว</div></div>
          <div><div class="card-title">Workouts</div><div class="metric">${appleActivities}</div><div class="submetric">กิจกรรมจาก HealthKit</div></div>
        </div>
        <hr>
        <div class="form-grid">
          <div class="field"><label for="apple-sync-days">ช่วงข้อมูล</label><select id="apple-sync-days"><option value="30">30 วัน</option><option value="90" selected>90 วัน</option><option value="180">180 วัน</option><option value="365">365 วัน</option></select></div>
          <div class="field"><label>Bridge status</label><div class="status ${appleBridge ? 'green' : 'yellow'}" style="min-height:44px;border-radius:12px">${appleBridge ? 'iOS Companion detected' : 'Browser mode'}</div></div>
        </div>
        <button class="button primary full" data-action="apple-sync" style="margin-top:14px" ${appleBridge ? '' : 'disabled'}>${appleBridge ? 'Sync จาก Apple Health ตอนนี้' : 'เปิดผ่าน Trail Runner Coach iOS Companion เพื่อ Sync'}</button>
        <div id="apple-sync-status" class="submetric">${appleBridge ? 'ข้อมูลจะอยู่ใน IndexedDB ของอุปกรณ์นี้ ไม่อัปโหลดไป Server' : 'Safari/PWA อ่าน HealthKit โดยตรงไม่ได้ ตัว Companion จะเป็น native bridge ให้เว็บในแอปเท่านั้น'}</div>
      </article>
    </section>

    <section class="section"><div class="section-head"><h2>นำเข้ากิจกรรม</h2><span>ใช้เสริมเมื่อ Apple Health ไม่มี Vertical/Route ครบ</span></div>
      <article class="card flat"><input id="activity-file" type="file" accept=".gpx,.tcx,.csv,.json" hidden><div class="button-row"><button class="button primary" data-action="choose-file">เลือก GPX / TCX / CSV / JSON</button><button class="button secondary" data-action="manual-activity">กรอกกิจกรรมเอง</button></div><div class="submetric" style="margin-top:10px">ระบบอ่านระยะ เวลา Elevation และ HR เท่าที่มีในไฟล์ แล้วใช้ RPE/HR ประกอบ Strain</div></article>
    </section>

    <section class="section"><div class="section-head"><h2>Backup</h2><span>แนะนำหลังบันทึกข้อมูลสำคัญ</span></div>
      <article class="card flat"><div class="button-row"><button class="button primary" data-action="export-backup">Export JSON</button><button class="button secondary" data-action="import-backup">Import JSON</button><input id="backup-file" type="file" accept=".json" hidden></div><div class="submetric">Backup รวม Settings, Check-in, Activities, Pain, Workout, Rehab, Gear, InBody, อาหาร, เมนูส่วนตัว, น้ำดื่ม, สถานะบันทึกครบวัน และ Sync metadata</div></article>
    </section>

    <section class="section"><div class="section-head"><h2>กิจกรรมล่าสุด</h2><span>${state.activities.length} รายการทั้งหมด</span></div><div class="list">${recent.length ? recent.map(activity => `<article class="list-item"><div style="font-size:22px">${activity.terrain === 'trail' ? '⛰' : '🏃'}</div><div class="grow"><strong>${escapeHtml(activity.name || activity.type)}</strong><small>${escapeHtml(activity.date)} · ${formatNumber(activity.distanceKm, 1)} km · +${formatNumber(activity.elevationGainM)} m · ${formatNumber(activity.durationMin)} นาที · RPE ${activity.rpe ?? 'Auto'} · ${escapeHtml(formatActivitySources(activity))}</small></div><button class="button secondary" data-delete-activity="${activity.id}" style="padding:7px 9px;min-height:34px">ลบ</button></article>`).join('') : emptyState('ยังไม่มีกิจกรรม')}</div></section>
    <div class="callout">Apple Health ให้ Recovery และกิจกรรมเป็นฐานหลัก ส่วน GPX/TCX ใช้เติม Vertical/Route เมื่อ HealthKit ต้นทางไม่ได้ส่งค่ามาครบ ระบบจะไม่ถือว่าข้อมูลศูนย์คือ Vertical จริงเสมอไป</div>`;

  container.querySelector('[data-action="open-connections"]')?.addEventListener('click', () => app.navigate('connections'));
  container.querySelector('[data-action="open-cloud-backup"]')?.addEventListener('click', () => app.navigate('cloud-backup'));
  container.querySelector('[data-action="reconcile-activities"]')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    const status = container.querySelector('#dedup-status');
    button.disabled = true;
    status.textContent = 'กำลังตรวจเวลา ระยะ และแหล่งข้อมูลของทุกกิจกรรม…';
    app.localize(status);
    try {
      const result = await reconcileStoredActivities(app.store, { force: true });
      app.toast(`ตรวจเสร็จ: รวมซ้ำ ${result.merged || 0} · รอตรวจ ${result.review || 0}`);
      app.render();
    } catch (error) {
      status.textContent = error.message || 'ตรวจข้อมูลซ้ำไม่สำเร็จ';
      app.localize(status);
      button.disabled = false;
    }
  });

  container.querySelectorAll('[data-dedup-merge]').forEach(button => button.addEventListener('click', async () => {
    try {
      await resolveActivityDuplicate(app.store, button.dataset.dedupMerge, button.dataset.canonicalId, 'merge');
      app.toast('รวมกิจกรรมซ้ำเป็นรายการเดียวแล้ว');
      app.render();
    } catch (error) { app.toast(error.message || 'รวมกิจกรรมไม่สำเร็จ'); }
  }));
  container.querySelectorAll('[data-dedup-keep]').forEach(button => button.addEventListener('click', async () => {
    try {
      await resolveActivityDuplicate(app.store, button.dataset.dedupKeep, button.dataset.canonicalId, 'keep');
      app.toast('เก็บเป็นคนละกิจกรรมแล้ว');
      app.render();
    } catch (error) { app.toast(error.message || 'บันทึกผลตรวจไม่สำเร็จ'); }
  }));

  const syncButton = container.querySelector('[data-action="apple-sync"]');
  syncButton?.addEventListener('click', async () => {
    const status = container.querySelector('#apple-sync-status');
    const days = Number(container.querySelector('#apple-sync-days').value) || 90;
    syncButton.disabled = true;
    syncButton.textContent = 'กำลังขอสิทธิ์และอ่าน Apple Health…';
    status.textContent = 'กรุณาอนุญาตข้อมูลที่จำเป็นบน iPhone และรอให้ระบบสรุปข้อมูล';
    app.localize(syncButton); app.localize(status);
    try {
      const payload = await requestAppleHealthSync({ days });
      const result = await importAppleHealthPayload(app.store, payload);
      const dedup = result.activityImport || {};
      app.toast(`Sync แล้ว: ${result.checkins} วัน · เพิ่ม ${dedup.added || 0} · รวมซ้ำ ${dedup.merged || 0} · อัปเดต ${dedup.updated || 0}`);
      app.render();
    } catch (error) {
      status.textContent = error.message || 'Apple Health sync ไม่สำเร็จ';
      app.localize(status);
      app.toast(status.textContent);
      syncButton.disabled = false;
      syncButton.textContent = 'ลอง Sync Apple Health อีกครั้ง';
      app.localize(syncButton);
    }
  });

  const activityFile = container.querySelector('#activity-file');
  container.querySelector('[data-action="choose-file"]').addEventListener('click', () => activityFile.click());
  activityFile.addEventListener('change', async () => {
    const file = activityFile.files?.[0]; if (!file) return;
    try {
      const parsed = await parseActivityFile(file);
      const result = await importActivitiesWithDedup(app.store, parsed, { source: file.name });
      app.toast(`นำเข้า: เพิ่ม ${result.added || 0} · รวมซ้ำ ${result.merged || 0} · อัปเดต ${result.updated || 0}${result.review ? ` · รอตรวจ ${result.review}` : ''}`);
      app.render();
    } catch (error) { app.toast(error.message || 'นำเข้าไม่สำเร็จ'); }
  });
  container.querySelector('[data-action="manual-activity"]').addEventListener('click', () => app.openManualActivityModal());
  container.querySelector('[data-action="export-backup"]').addEventListener('click', async () => {
    const snapshot = await app.store.db.exportSnapshot();
    downloadBlob(JSON.stringify(snapshot, null, 2), `trail-runner-coach-backup-${localDateKey()}.json`, 'application/json');
    app.toast('Export backup แล้ว');
  });
  const backupFile = container.querySelector('#backup-file');
  container.querySelector('[data-action="import-backup"]').addEventListener('click', () => backupFile.click());
  backupFile.addEventListener('change', async () => {
    const file = backupFile.files?.[0]; if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const currentCloudBackup = structuredClone(app.store.getState().settings?.integrations?.cloudBackup || null);
      if (isLegacyBackup(parsed)) await importLegacyBackup(parsed, app.store.getState().settings, { source: 'backup-file' });
      else await app.store.db.importSnapshot(parsed, { replace: false });
      await app.store.refreshAll();
      if (currentCloudBackup?.vaultId && currentCloudBackup?.accessToken) {
        await app.store.saveSettings({ integrations: { cloudBackup: currentCloudBackup } });
      }
      const dedup = await reconcileStoredActivities(app.store, { force: true });
      app.toast(`${isLegacyBackup(parsed) ? 'Import ข้อมูลรุ่นเดิมแล้ว' : 'Import backup แล้ว'} · รวมซ้ำ ${dedup.merged || 0}`);
      app.render();
    } catch (error) { app.toast(error.message || 'Backup ไม่ถูกต้อง'); }
  });
  container.querySelectorAll('[data-delete-activity]').forEach(button => button.addEventListener('click', async () => { await app.store.deleteRecord(STORES.ACTIVITIES, button.dataset.deleteActivity); app.render(); }));
}

function reviewDuplicateRow(activity, activities) {
  const candidate = activities.find(item => item.id === activity.dedup?.possibleDuplicateOf);
  if (!candidate) return '';
  const score = Number(activity.dedup?.reviewScore) || 0;
  return `<article class="list-item dedup-review-row">
    <div class="grow"><strong>${escapeHtml(activity.name || activity.type || 'Activity')}</strong><small>${escapeHtml(activity.date)} · ${formatNumber(activity.distanceKm, 1)} km · ${escapeHtml(formatActivitySources(activity))}</small><small>อาจซ้ำกับ ${escapeHtml(candidate.name || candidate.type || 'Activity')} · ความมั่นใจ ${score}%</small></div>
    <div class="button-row"><button class="button primary compact" data-dedup-merge="${escapeHtml(activity.id)}" data-canonical-id="${escapeHtml(candidate.id)}">รวม</button><button class="button secondary compact" data-dedup-keep="${escapeHtml(activity.id)}" data-canonical-id="${escapeHtml(candidate.id)}">แยกไว้</button></div>
  </article>`;
}

function formatActivitySources(activity) {
  const sources = Array.isArray(activity.sources) && activity.sources.length ? activity.sources : [activity.source];
  return sources.filter(Boolean).join(' + ');
}

function sourceCard(name, status, color, detail) { return `<article class="card flat"><div style="display:flex;justify-content:space-between;gap:8px"><strong>${escapeHtml(name)}</strong><span class="status ${color}">${escapeHtml(status)}</span></div><div class="submetric">${escapeHtml(detail)}</div></article>`; }
function downloadBlob(content, filename, type) { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function formatTimestamp(value) { try { return new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); } catch { return value; } }

export function manualActivityRecord(formData) {
  const getNum = key => formData.get(key) === '' ? null : Number(formData.get(key));
  return { id: createId('activity'), externalId: null, date: formData.get('date') || localDateKey(), startTime: null, name: formData.get('name') || 'Manual activity', type: formData.get('type') || 'Run', durationMin: getNum('durationMin') || 0, distanceKm: getNum('distanceKm') || 0, elevationGainM: getNum('elevationGainM') || 0, elevationLossM: getNum('elevationLossM') || 0, avgHr: getNum('avgHr'), maxHr: getNum('maxHr'), rpe: getNum('rpe'), terrain: formData.get('terrain') || 'road', isNight: formData.has('isNight'), source: 'manual', importedAt: nowIso() };
}
