import { STORES } from '../core/constants.js';
import { createId } from '../core/id.js';
import { localDateKey, nowIso } from '../core/date.js';
import { parseActivityFile } from '../adapters/importer.js';
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

  container.innerHTML = `
    ${pageHeader('ข้อมูล & Wearables', 'Apple Health เป็นแหล่งหลัก และทุกข้อมูลถูกแปลงเข้า Normalized Health Schema ก่อนคำนวณ', 'Local-first data hub')}
    <section class="grid two">
      ${sourceCard('Apple Health', appleBridge ? 'พร้อม Sync' : 'ต้องเปิดผ่าน iOS Companion', appleBridge ? 'green' : 'yellow', 'Sleep, RHR, HRV, Steps, Energy, Workout และ Body metrics')}
      ${sourceCard('กรอกเอง', 'พร้อมใช้', 'green', 'Pain, Fatigue, Stress, Soreness และ Session RPE')}
      ${sourceCard('GPX / TCX / CSV', 'พร้อมใช้', 'green', 'นำเข้ากิจกรรมและ Vertical จากแพลตฟอร์มนาฬิกา')}
      ${sourceCard('Garmin / Suunto', 'ภายหลัง', 'neutral', 'Provider adapter ใช้ schema เดียวกับ Apple Health')}
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

    <section class="section"><div class="section-head"><h2>กิจกรรมล่าสุด</h2><span>${state.activities.length} รายการทั้งหมด</span></div><div class="list">${recent.length ? recent.map(activity => `<article class="list-item"><div style="font-size:22px">${activity.terrain === 'trail' ? '⛰' : '🏃'}</div><div class="grow"><strong>${escapeHtml(activity.name || activity.type)}</strong><small>${escapeHtml(activity.date)} · ${formatNumber(activity.distanceKm, 1)} km · +${formatNumber(activity.elevationGainM)} m · ${formatNumber(activity.durationMin)} นาที · RPE ${activity.rpe ?? 'Auto'} · ${escapeHtml(activity.source)}</small></div><button class="button secondary" data-delete-activity="${activity.id}" style="padding:7px 9px;min-height:34px">ลบ</button></article>`).join('') : emptyState('ยังไม่มีกิจกรรม')}</div></section>
    <div class="callout">Apple Health ให้ Recovery และกิจกรรมเป็นฐานหลัก ส่วน GPX/TCX ใช้เติม Vertical/Route เมื่อ HealthKit ต้นทางไม่ได้ส่งค่ามาครบ ระบบจะไม่ถือว่าข้อมูลศูนย์คือ Vertical จริงเสมอไป</div>`;

  const syncButton = container.querySelector('[data-action="apple-sync"]');
  syncButton?.addEventListener('click', async () => {
    const status = container.querySelector('#apple-sync-status');
    const days = Number(container.querySelector('#apple-sync-days').value) || 90;
    syncButton.disabled = true;
    syncButton.textContent = 'กำลังขอสิทธิ์และอ่าน Apple Health…';
    status.textContent = 'กรุณาอนุญาตข้อมูลที่จำเป็นบน iPhone และรอให้ระบบสรุปข้อมูล';
    try {
      const payload = await requestAppleHealthSync({ days });
      const result = await importAppleHealthPayload(app.store, payload);
      app.toast(`Sync แล้ว: ${result.checkins} วัน · ${result.activities} กิจกรรม`);
      app.render();
    } catch (error) {
      status.textContent = error.message || 'Apple Health sync ไม่สำเร็จ';
      app.toast(status.textContent);
      syncButton.disabled = false;
      syncButton.textContent = 'ลอง Sync Apple Health อีกครั้ง';
    }
  });

  const activityFile = container.querySelector('#activity-file');
  container.querySelector('[data-action="choose-file"]').addEventListener('click', () => activityFile.click());
  activityFile.addEventListener('change', async () => {
    const file = activityFile.files?.[0]; if (!file) return;
    try {
      const parsed = await parseActivityFile(file);
      const existingIds = new Set(state.activities.map(item => item.externalId).filter(Boolean));
      const fresh = parsed.filter(item => !existingIds.has(item.externalId));
      if (!fresh.length) { app.toast('ไฟล์นี้เคยนำเข้าแล้ว'); return; }
      await app.store.upsertMany(STORES.ACTIVITIES, fresh);
      app.toast(`นำเข้า ${fresh.length} กิจกรรมแล้ว`); app.render();
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
      if (isLegacyBackup(parsed)) await importLegacyBackup(parsed, app.store.getState().settings, { source: 'backup-file' });
      else await app.store.db.importSnapshot(parsed, { replace: false });
      await app.store.refreshAll();
      app.toast(isLegacyBackup(parsed) ? 'Import ข้อมูลรุ่นเดิมแล้ว' : 'Import backup แล้ว');
      app.render();
    } catch (error) { app.toast(error.message || 'Backup ไม่ถูกต้อง'); }
  });
  container.querySelectorAll('[data-delete-activity]').forEach(button => button.addEventListener('click', async () => { await app.store.deleteRecord(STORES.ACTIVITIES, button.dataset.deleteActivity); app.render(); }));
}

function sourceCard(name, status, color, detail) { return `<article class="card flat"><div style="display:flex;justify-content:space-between;gap:8px"><strong>${escapeHtml(name)}</strong><span class="status ${color}">${escapeHtml(status)}</span></div><div class="submetric">${escapeHtml(detail)}</div></article>`; }
function downloadBlob(content, filename, type) { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function formatTimestamp(value) { try { return new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); } catch { return value; } }

export function manualActivityRecord(formData) {
  const getNum = key => formData.get(key) === '' ? null : Number(formData.get(key));
  return { id: createId('activity'), externalId: null, date: formData.get('date') || localDateKey(), startTime: null, name: formData.get('name') || 'Manual activity', type: formData.get('type') || 'Run', durationMin: getNum('durationMin') || 0, distanceKm: getNum('distanceKm') || 0, elevationGainM: getNum('elevationGainM') || 0, elevationLossM: getNum('elevationLossM') || 0, avgHr: getNum('avgHr'), maxHr: getNum('maxHr'), rpe: getNum('rpe'), terrain: formData.get('terrain') || 'road', isNight: formData.has('isNight'), source: 'manual', importedAt: nowIso() };
}
