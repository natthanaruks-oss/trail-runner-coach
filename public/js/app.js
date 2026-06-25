import * as store from './core/store.js';
import { STORES } from './core/constants.js';
import { createId } from './core/id.js';
import { localDateKey, nowIso } from './core/date.js';
import { migrateLegacyLocalStorage } from './adapters/legacy.js';
import { reconcileStoredActivities } from './adapters/activity-import.js';
import { renderDashboard } from './views/dashboard.js';
import { renderPlan } from './views/plan.js';
import { renderCheckin } from './views/checkin.js';
import { renderRehab } from './views/rehab.js';
import { renderPain } from './views/pain.js';
import { renderMore } from './views/more.js';
import { renderNutrition } from './views/nutrition.js';
import { renderGear } from './views/gear.js';
import { renderMotivation } from './views/motivation.js';
import { renderData, manualActivityRecord } from './views/data.js';
import { renderSettings } from './views/settings.js';
import { renderBody } from './views/body.js';
import { renderRaces } from './views/races.js';
import { renderTraining } from './views/training.js';
import { renderFuel } from './views/fuel.js';
import { renderLog } from './views/log.js';
import { renderScores } from './views/scores.js';
import { renderProgress } from './views/progress.js';
import { renderConnections, refreshConnectionsSyncUi } from './views/connections.js';
import { renderCloudBackup } from './views/cloud-backup.js';
import { initializeSyncLifecycle } from './adapters/sync-manager.js';
import { initializeCloudBackupLifecycle } from './adapters/cloud-backup.js';
import { installReceiver as installAppleHealthReceiver } from './adapters/apple-health.js';
import { modalTemplate, fieldNumber, escapeHtml } from './views/components.js';
import { applyShellLanguage, getLanguage, localizeDom, localizedField, localizedName, translateWithPhrases } from './core/i18n.js';

const view = document.querySelector('#view');
const modal = document.querySelector('#modal');
const modalContent = document.querySelector('#modal-content');
const toastElement = document.querySelector('#toast');
const scheduleFrame = globalThis.requestAnimationFrame?.bind(globalThis) || (callback => setTimeout(callback, 0));

const routes = {
  today: renderDashboard,
  plan: renderPlan,
  checkin: renderCheckin,
  rehab: renderRehab,
  pain: renderPain,
  more: renderMore,
  nutrition: renderNutrition,
  gear: renderGear,
  motivation: renderMotivation,
  data: renderData,
  settings: renderSettings,
  body: renderBody,
  races: renderRaces,
  train: renderTraining,
  fuel: renderFuel,
  log: renderLog,
  scores: renderScores,
  progress: renderProgress,
  connections: renderConnections,
  'cloud-backup': renderCloudBackup
};

const app = {
  store,
  ui: {},
  render,
  navigate(route) { location.hash = `#/${route}`; },
  toast,
  openWorkoutModal,
  openManualActivityModal,
  openQuickAdd,
  closeModal,
  openModal,
  get language() { return getLanguage(store.getState().settings); },
  t(value) { return translateWithPhrases(value, getLanguage(store.getState().settings)); },
  localize(root = document) { localizeDom(root, getLanguage(store.getState().settings)); },
  name(record, thaiKey = 'nameTh', englishKey = 'nameEn') { return localizedName(record, getLanguage(store.getState().settings), thaiKey, englishKey); },
  field(record, field = 'title') { return localizedField(record, getLanguage(store.getState().settings), field); }
};

async function start() {
  try {
    await store.initializeStore();
    await migrateLegacyLocalStorage(store.getState().settings);
    await store.refreshAll();
    await reconcileStoredActivities(store);
    installAppleHealthReceiver();
    if (window.history && 'scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    bindGlobalEvents();
    applyShellLanguage(getLanguage(store.getState().settings));
    render();
    initializeSyncLifecycle(store);
    initializeCloudBackupLifecycle(store);
    registerServiceWorker();
  } catch (error) {
    console.error(error);
    view.innerHTML = `<div class="card"><h2>เปิดแอปไม่สำเร็จ</h2><p style="color:var(--muted)">${escapeHtml(error.message)}</p><p>ลองเปิดใน Safari/Chrome รุ่นปัจจุบันและอนุญาตพื้นที่เก็บข้อมูลของเว็บไซต์</p></div>`;
  }
}

function currentRoute() {
  const route = location.hash.replace(/^#\//, '').split('?')[0] || 'today';
  return routes[route] ? route : 'today';
}

const routeScrollPositions = new Map();
let renderedRoute = null;

function render(options = {}) {
  const route = currentRoute();
  const routeChanged = renderedRoute !== null && route !== renderedRoute;
  const currentScroll = window.scrollY || document.documentElement.scrollTop || 0;
  if (routeChanged && renderedRoute) routeScrollPositions.set(renderedRoute, currentScroll);
  const targetScroll = routeChanged ? (routeScrollPositions.get(route) || 0) : currentScroll;
  const activeNav = route === 'rehab' ? 'train' : route === 'nutrition' ? 'fuel' : ['pain','body','data','connections','cloud-backup','settings','races','gear','motivation','more','checkin','progress'].includes(route) ? 'log' : route === 'scores' ? 'today' : route;
  document.querySelectorAll('[data-route]').forEach(link => link.classList.toggle('active', link.dataset.route === activeNav));
  view.setAttribute('aria-busy', 'true');
  routes[route](view, store.getState(), app);
  const language = getLanguage(store.getState().settings);
  applyShellLanguage(language);
  localizeDom(view, language);
  renderedRoute = route;
  scheduleFrame(() => {
    window.scrollTo({ top: options.scrollTop ? 0 : targetScroll, behavior: 'instant' });
    view.removeAttribute('aria-busy');
  });
}

function bindGlobalEvents() {
  window.addEventListener('hashchange', render);
  window.addEventListener('trail-runner-coach:sync-state', () => {
    if (currentRoute() === 'connections') refreshConnectionsSyncUi(view, store.getState(), app);
  });
  window.addEventListener('trail-runner-coach:cloud-backup-state', () => {
    if (currentRoute() === 'cloud-backup') render();
  });
  document.querySelector('#quick-add').addEventListener('click', openQuickAdd);
  document.querySelector('#language-toggle')?.addEventListener('click', async () => {
    const current = getLanguage(store.getState().settings);
    const next = current === 'en' ? 'th' : 'en';
    closeModal();
    await store.saveSettings({ language: next });
    applyShellLanguage(next);
    render();
    toast(next === 'en' ? 'Language changed to English' : 'เปลี่ยนเป็นภาษาไทยแล้ว');
  });
  modal.addEventListener('click', event => {
    if (event.target === modal || event.target.closest('[data-close-modal]')) closeModal();
  });
  modal.addEventListener('cancel', event => { event.preventDefault(); closeModal(); });
}

function openModal(title, body) {
  modalContent.innerHTML = modalTemplate(title, body);
  localizeDom(modalContent, getLanguage(store.getState().settings));
  if (!modal.open) modal.showModal();
}
function closeModal() {
  if (modal.open) modal.close();
  modalContent.innerHTML = '';
}

function openQuickAdd() {
  openModal('เพิ่มข้อมูล', `<div class="grid two">
    <button class="button primary" data-quick="checkin">♡ Readiness</button>
    <button class="button secondary" data-quick="food">🍚 อาหาร</button>
    <button class="button secondary" data-quick="activity">🏃 Activity</button>
    <button class="button secondary" data-quick="pain">🩹 Pain Log</button>
    <button class="button secondary" data-quick="sleep">😴 Sleep / RHR</button>
    <button class="button secondary" data-quick="data">⌁ Import file</button>
  </div>`);
  modalContent.querySelectorAll('[data-quick]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.quick;
    closeModal();
    if (action === 'activity') openManualActivityModal();
    else if (action === 'food') { app.ui.fuelTab = 'food'; app.ui.foodDate = localDateKey(); navigateAfterClose('fuel'); }
    else if (action === 'sleep') { app.ui.logTab = 'sleep'; navigateAfterClose('log'); }
    else navigateAfterClose(action);
  }));
}
function navigateAfterClose(route) { app.navigate(route); }

function openWorkoutModal(session) {
  if (!session) return;
  const state = store.getState();
  const existing = state.workouts.find(item => item.planSessionId === session.id) || {};
  openModal('บันทึกผลการซ้อม', `
    <div class="callout" style="margin-bottom:13px"><strong>${escapeHtml(localizedField(session, getLanguage(state.settings), 'title') || session.t)}</strong><br>${escapeHtml(session.date)} · แผน ${session.km || 0} km · +${session.vert || 0} m</div>
    <form id="workout-form"><div class="form-grid">
      <div class="field"><label>สถานะ</label><select name="status"><option value="completed" ${existing.status==='completed'?'selected':''}>ทำแล้ว</option><option value="modified" ${existing.status==='modified'?'selected':''}>ปรับลด/เปลี่ยน</option><option value="skipped" ${existing.status==='skipped'?'selected':''}>พัก/ข้าม</option></select></div>
      <div class="field"><label>วันที่ทำจริง</label><input type="date" name="date" value="${escapeHtml(existing.date || session.date)}"></div>
      ${fieldNumber({name:'actualDistanceKm',label:'ระยะจริง (km)',value:existing.actualDistanceKm??session.km??'',min:0,max:200,step:.1})}
      ${fieldNumber({name:'actualElevationGainM',label:'Vertical gain (m)',value:existing.actualElevationGainM??session.vert??'',min:0,max:10000})}
      ${fieldNumber({name:'elevationLossM',label:'Vertical loss (m)',value:existing.elevationLossM??session.vert??'',min:0,max:10000})}
      ${fieldNumber({name:'durationMin',label:'ระยะเวลา (นาที)',value:existing.durationMin??'',min:0,max:2000})}
      ${fieldNumber({name:'rpe',label:'Session RPE 1–10',value:existing.rpe??'',min:1,max:10})}
      ${fieldNumber({name:'avgHr',label:'Average HR',value:existing.avgHr??'',min:30,max:230})}
      <div class="field"><label>Terrain</label><select name="terrain"><option value="trail">Trail</option><option value="road">Road</option><option value="treadmill">Treadmill</option><option value="strength">Strength</option></select></div>
      <label class="check-row field"><input type="checkbox" name="isNight" ${session.t==='Night'||existing.isNight?'checked':''}><span>Night run</span></label>
      <div class="field full"><label>หมายเหตุ</label><textarea name="note" rows="3">${escapeHtml(existing.note||'')}</textarea></div>
    </div><button class="button primary full" style="margin-top:14px">บันทึก</button></form>`);

  modalContent.querySelector('#workout-form').addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const num = key => data.get(key) === '' ? null : Number(data.get(key));
    const workout = {
      planSessionId: session.id,
      date: data.get('date') || session.date,
      status: data.get('status'),
      actualDistanceKm: num('actualDistanceKm'),
      actualElevationGainM: num('actualElevationGainM'),
      elevationLossM: num('elevationLossM'),
      durationMin: num('durationMin'),
      rpe: num('rpe'),
      avgHr: num('avgHr'),
      terrain: data.get('terrain'),
      isNight: data.has('isNight'),
      note: data.get('note') || '',
      source: 'manual',
      updatedAt: nowIso()
    };
    await store.upsertRecord(STORES.WORKOUTS, workout);
    const shouldCreateActivity = ['completed','modified'].includes(workout.status) && ((workout.durationMin || 0) > 0 || (workout.actualDistanceKm || 0) > 0);
    if (shouldCreateActivity) {
      const externalId = `plan:${session.id}`;
      const existingActivity = store.getState().activities.find(item => item.externalId === externalId);
      await store.upsertRecord(STORES.ACTIVITIES, {
        id: existingActivity?.id || createId('activity'),
        externalId,
        date: workout.date,
        startTime: null,
        name: localizedField(session, getLanguage(state.settings), 'title') || session.t,
        type: session.t,
        durationMin: workout.durationMin || estimateDuration(workout.actualDistanceKm ?? session.km, session.t),
        distanceKm: workout.actualDistanceKm ?? session.km ?? 0,
        elevationGainM: workout.actualElevationGainM ?? session.vert ?? 0,
        elevationLossM: workout.elevationLossM ?? workout.actualElevationGainM ?? session.vert ?? 0,
        avgHr: workout.avgHr,
        maxHr: null,
        rpe: workout.rpe,
        terrain: workout.terrain,
        isNight: workout.isNight,
        source: 'manual',
        importedAt: nowIso()
      });
    }
    closeModal();
    toast('บันทึกผลการซ้อมแล้ว');
    render();
  });
}

function openManualActivityModal() {
  openModal('กรอกกิจกรรมเอง', `<form id="manual-activity-form"><div class="form-grid">
    <div class="field"><label>วันที่</label><input type="date" name="date" value="${localDateKey()}"></div>
    <div class="field"><label>ชื่อกิจกรรม</label><input name="name" value="Trail run"></div>
    <div class="field"><label>ประเภท</label><select name="type"><option>Run</option><option>Trail Run</option><option>Hike</option><option>Strength</option><option>Rehab</option><option>Bike</option></select></div>
    <div class="field"><label>Terrain</label><select name="terrain"><option value="trail">Trail</option><option value="road">Road</option><option value="treadmill">Treadmill</option><option value="strength">Strength</option></select></div>
    ${fieldNumber({name:'durationMin',label:'ระยะเวลา (นาที)',min:0,max:2000})}
    ${fieldNumber({name:'distanceKm',label:'ระยะ (km)',min:0,max:200,step:.1})}
    ${fieldNumber({name:'elevationGainM',label:'Elevation gain (m)',min:0,max:10000})}
    ${fieldNumber({name:'elevationLossM',label:'Elevation loss (m)',min:0,max:10000})}
    ${fieldNumber({name:'avgHr',label:'Average HR',min:30,max:230})}
    ${fieldNumber({name:'maxHr',label:'Maximum HR',min:30,max:240})}
    ${fieldNumber({name:'rpe',label:'Session RPE 1–10',min:1,max:10})}
    <label class="check-row field"><input type="checkbox" name="isNight"><span>Night run</span></label>
  </div><button class="button primary full" style="margin-top:14px">บันทึกกิจกรรม</button></form>`);
  modalContent.querySelector('#manual-activity-form').addEventListener('submit', async event => {
    event.preventDefault();
    const record = manualActivityRecord(new FormData(event.currentTarget));
    await store.upsertRecord(STORES.ACTIVITIES, record);
    closeModal(); toast('เพิ่มกิจกรรมแล้ว'); render();
  });
}

function estimateDuration(distance, type) {
  const km = Number(distance) || 0;
  if (!km) return /Strength|Rehab/.test(type) ? 45 : 30;
  return Math.round(km * (/Long|B2B|Hill|Night|Trail/.test(type) ? 11 : 8));
}

let toastTimer;
function toast(message) {
  toastElement.textContent = translateWithPhrases(message, getLanguage(store.getState().settings));
  toastElement.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastElement.classList.remove('show'), 2600);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('/service-worker.js').catch(error => console.warn('Service worker registration failed', error));
  }
}

start();
