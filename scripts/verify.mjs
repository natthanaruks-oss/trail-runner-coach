import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const root = resolve('.');
const required = [
  'public/index.html',
  'public/js/app.js',
  'public/js/core/db.js',
  'public/js/core/races.js',
  'public/js/core/nutrition.js',
  'public/js/core/activity-dedup.js',
  'public/js/core/i18n.js',
  'public/js/views/races.js',
  'public/js/views/fuel.js',
  'public/js/views/training.js',
  'public/js/views/log.js',
  'public/js/views/scores.js',
  'public/js/views/progress.js',
  'public/js/core/progress.js',
  'public/js/core/apple-health-auto-pull.js',
  'public/js/core/unified-insights.js',
  'public/js/core/personal-trends.js',
  'public/js/core/trail-coach.js',
  'public/js/core/auto-readiness.js',
  'public/js/core/plan-reconciliation.js',
  'public/js/views/health.js',
  'public/js/views/coach.js',
  'public/js/data/food-catalog.js',
  'public/js/data/training-library.js',
  'public/js/data/thai-food-dataset.js',
  'public/data/thai-prepared-foods.json',
  'public/js/views/connections.js',
  'public/js/views/connections-home.js',
  'public/js/adapters/provider-sync.js',
  'public/js/adapters/activity-import.js',
  'public/js/adapters/sync-manager.js',
  'public/js/adapters/google-health.js',
  'public/js/engines/calibration.js',
  'public/manifest.webmanifest',
  'wrangler.jsonc',
  'ios/TrailRunnerCoach/project.yml',
  'docs/FEATURE_PARITY.md',
  'docs/STRAVA_SETUP_WIZARD.md',
  'docs/ACTIVITY_DEDUP.md',
  'docs/SYNC_LIFECYCLE.md',
  'docs/SCORE_CALIBRATION.md',
  'docs/PROGRESS_DASHBOARD.md',
  'docs/PERSONAL_TRENDS_V2.7.md',
  'docs/TRAIL_COACH_INTELLIGENCE_V2.8.md',
  'docs/AUTO_READINESS_PLAN_RECONCILIATION_V2.8.1.md',
  'scripts/setup-strava.mjs',
  'scripts/setup-google-health.mjs',
  'scripts/lib/google-health-setup.mjs',
  'scripts/lib/strava-setup.mjs',
  'workers/wearable-sync/src/index.js',
  'public/js/core/cloud-backup-crypto.js',
  'public/js/adapters/cloud-backup.js',
  'public/js/views/cloud-backup.js',
  'workers/cloud-backup/src/index.js',
  'workers/cloud-backup/wrangler.example.jsonc',
  'scripts/setup-cloud-backup.mjs',
  'scripts/lib/cloud-backup-setup.mjs',
  'docs/ENCRYPTED_CLOUD_BACKUP.md',
  'docs/GOOGLE_HEALTH_FITBIT.md',
  'public/js/views/apple-health-shortcut.js',
  'workers/apple-health-shortcut/src/index.js',
  'workers/apple-health-shortcut/wrangler.example.jsonc',
  'scripts/setup-apple-health-shortcut.mjs',
  'scripts/lib/apple-health-shortcut-setup.mjs',
  'docs/APPLE_HEALTH_SHORTCUTS_BRIDGE.md',
  'examples/apple-health-shortcut-payload.example.json'
];

for (const path of required) {
  await readFile(resolve(root, path));
}

const forbiddenSourcePatterns = [
  /window\.RTC70AppleHealth/,
  /rtc70HealthKit/,
  /"name"\s*:\s*"rtc70-adaptive-trail-coach"/,
  /const CACHE = 'rtc70-/
];

for (const file of await walk(root)) {
  if (/node_modules|package-lock\.json|\.zip$|scripts\/verify\.mjs$/.test(file)) continue;
  if (!/\.(js|mjs|html|json|jsonc|md|swift|plist|yml|webmanifest)$/.test(file)) continue;
  const text = await readFile(file, 'utf8');
  for (const pattern of forbiddenSourcePatterns) {
    if (pattern.test(text)) throw new Error(`Forbidden legacy identifier ${pattern} in ${relative(root, file)}`);
  }
}

const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (packageJson.version !== '2.8.2') throw new Error(`Expected package version 2.8.2, received ${packageJson.version}`);
const serviceWorker = await readFile(resolve(root, 'public/service-worker.js'), 'utf8');
if (!serviceWorker.includes('trail-runner-coach-v2.8.2')) throw new Error('Service-worker cache version was not bumped to 2.8.2');
const constants = await readFile(resolve(root, 'public/js/core/constants.js'), 'utf8');
if (!constants.includes("APP_VERSION = '2.8.2'") || !constants.includes('DB_VERSION = 4')) throw new Error('Application or database version is incorrect');
const dedupEngine = await readFile(resolve(root, 'public/js/core/activity-dedup.js'), 'utf8');
if (!dedupEngine.includes('scoreActivityMatch') || !dedupEngine.includes('externalRefs')) throw new Error('Activity deduplication engine is incomplete');
const activityImport = await readFile(resolve(root, 'public/js/adapters/activity-import.js'), 'utf8');
if (!activityImport.includes('reconcileStoredActivities') || !activityImport.includes('resolveActivityDuplicate')) throw new Error('Activity import reconciliation is incomplete');
const syncManager = await readFile(resolve(root, 'public/js/adapters/sync-manager.js'), 'utf8');
if (!syncManager.includes('retryQueuedSyncs') || !syncManager.includes('runAutoSync') || !syncManager.includes('MAX_RETRY_ATTEMPTS')) throw new Error('Auto sync and retry manager is incomplete');
const calibrationEngine = await readFile(resolve(root, 'public/js/engines/calibration.js'), 'utf8');
if (!calibrationEngine.includes('buildCalibrationProfile') || !calibrationEngine.includes('applyReadinessCalibration') || !calibrationEngine.includes('CALIBRATION_PERSONALIZED_DAYS')) throw new Error('Personal score calibration engine is incomplete');


const progressEngine = await readFile(resolve(root, 'public/js/core/progress.js'), 'utf8');
if (!progressEngine.includes('buildProgressDashboard') || !progressEngine.includes('buildComparisons') || !progressEngine.includes('buildCoverage')) throw new Error('Progress dashboard engine is incomplete');
const progressView = await readFile(resolve(root, 'public/js/views/progress.js'), 'utf8');
if (!progressView.includes('data-progress-preset') || !progressView.includes('scoreLineChart') || !progressView.includes('Calories balance')) throw new Error('Progress dashboard view is incomplete');

const healthInsights = await readFile(resolve(root, 'public/js/core/health-insights.js'), 'utf8');
if (!healthInsights.includes('selectAppleHealthInsights') || !healthInsights.includes('usesAppleActiveEnergy') || !healthInsights.includes('metricDates') || !healthInsights.includes('hasMixedMetricDates')) throw new Error('Apple Health insight selector is incomplete');
const dashboardView = await readFile(resolve(root, 'public/js/views/dashboard.js'), 'utf8');
if (!dashboardView.includes('สถานะการฝึกวันนี้') || !dashboardView.includes('data-dashboard-health-sync') || dashboardView.includes('activity.source')) throw new Error('Unified dashboard is incomplete or exposes provider labels');

const unifiedInsights = await readFile(resolve(root, 'public/js/core/unified-insights.js'), 'utf8');
if (!unifiedInsights.includes('buildUnifiedInsights') || !unifiedInsights.includes('buildLoadBalance') || !unifiedInsights.includes('buildEnergyScore')) throw new Error('Unified insight model is incomplete');
const healthView = await readFile(resolve(root, 'public/js/views/health.js'), 'utf8');
if (!healthView.includes('renderHealth') || !healthView.includes('Recovery signals') || !healthView.includes('Fitness, fatigue & form') || !healthView.includes('Data & sync settings')) throw new Error('Personal trend health detail view is incomplete');
const personalTrends = await readFile(resolve(root, 'public/js/core/personal-trends.js'), 'utf8');
if (!personalTrends.includes('buildPersonalTrends') || !personalTrends.includes('buildSleepDebt') || !personalTrends.includes('buildFitnessFatigueForm')) throw new Error('Personal trends engine is incomplete');
const trailCoach = await readFile(resolve(root, 'public/js/core/trail-coach.js'), 'utf8');
if (!trailCoach.includes('buildTrailCoachIntelligence') || !trailCoach.includes('buildRaceReadiness') || !trailCoach.includes('buildLongRunReadiness') || !trailCoach.includes('buildElevationAwareLoad') || !trailCoach.includes('pain?.hardStop')) throw new Error('Trail coach intelligence is incomplete or missing the pain safety gate');
const coachView = await readFile(resolve(root, 'public/js/views/coach.js'), 'utf8');
if (!coachView.includes('Trail Coach') || !coachView.includes('Six-week progression') || !coachView.includes('Race-readiness contributors')) throw new Error('Trail coach detail view is incomplete');
if (!dashboardView.includes('Trail-specific readiness') || !dashboardView.includes('#/coach')) throw new Error('Dashboard does not expose Trail Coach progressive disclosure');

const autoReadiness = await readFile(resolve(root, 'public/js/core/auto-readiness.js'), 'utf8');
if (!autoReadiness.includes('buildAutoReadinessContext') || !autoReadiness.includes('buildReadinessDraft') || !autoReadiness.includes('syncReadinessAndPlan')) throw new Error('Automatic readiness integration is incomplete');
const planReconciliation = await readFile(resolve(root, 'public/js/core/plan-reconciliation.js'), 'utf8');
if (!planReconciliation.includes('scorePlanActivityMatch') || !planReconciliation.includes('reconcilePlanWorkouts') || !planReconciliation.includes('AUTO_MATCH_THRESHOLD') || !planReconciliation.includes('buildActivityBundles') || !planReconciliation.includes('isSplitSession') || !planReconciliation.includes('specificityPct') || !planReconciliation.includes('actualActivityIds')) throw new Error('Multi-session plan reconciliation engine is incomplete');
const checkinView = await readFile(resolve(root, 'public/js/views/checkin.js'), 'utf8');
if (!checkinView.includes('Automatic recovery data') || !checkinView.includes('data-readiness-sync') || checkinView.includes('แหล่งข้อมูล</label>')) throw new Error('Automatic readiness check-in UX is incomplete or exposes provider selection');
const planView = await readFile(resolve(root, 'public/js/views/plan.js'), 'utf8');
if (!planView.includes('Plan ↔ actual reconciliation') || !planView.includes('data-plan-reconcile') || !planView.includes('actualDistanceKm') || !planView.includes('split-session-summary') || !planView.includes('continuousCompletionPct')) throw new Error('Plan versus actual multi-session UX is incomplete');

const appleAutoPull = await readFile(resolve(root, 'public/js/core/apple-health-auto-pull.js'), 'utf8');
if (!appleAutoPull.includes('shouldAutoPullAppleHealth') || !appleAutoPull.includes('autoPullAppleHealth')) throw new Error('Apple Health automatic pull is incomplete');

const googleHealthAdapter = await readFile(resolve(root, 'public/js/adapters/google-health.js'), 'utf8');
if (!googleHealthAdapter.includes('importGoogleHealthPayload') || !googleHealthAdapter.includes("source: 'google_health'")) throw new Error('Google Health app adapter is incomplete');
const wearableWorker = await readFile(resolve(root, 'workers/wearable-sync/src/index.js'), 'utf8');
if (!wearableWorker.includes('fetchGoogleHealthPayload') || !wearableWorker.includes('health.googleapis.com/v4') || !wearableWorker.includes('google_health')) throw new Error('Google Health Worker adapter is incomplete');
const googleSetup = await readFile(resolve(root, 'scripts/setup-google-health.mjs'), 'utf8');
if (!googleSetup.includes('GOOGLE_HEALTH_CLIENT_ID') || !googleSetup.includes('google-health-setup-result.json')) throw new Error('Google Health setup wizard is incomplete');

const appleShortcutAdapter = await readFile(resolve(root, 'public/js/adapters/apple-health.js'), 'utf8');
if (!appleShortcutAdapter.includes('fetchAppleHealthShortcutPayload') || !appleShortcutAdapter.includes('shortcuts_bridge')) throw new Error('Apple Health Shortcuts app adapter is incomplete');
const appleShortcutWorker = await readFile(resolve(root, 'workers/apple-health-shortcut/src/index.js'), 'utf8');
if (!appleShortcutWorker.includes('APPLE_HEALTH_ENCRYPTION_KEY') || !appleShortcutWorker.includes('AES-GCM') || !appleShortcutWorker.includes('/v1/import')) throw new Error('Apple Health Shortcuts Worker is incomplete');
const appleShortcutSetup = await readFile(resolve(root, 'scripts/setup-apple-health-shortcut.mjs'), 'utf8');
if (!appleShortcutSetup.includes('apple-health-shortcut-setup-result.local.json') || !appleShortcutSetup.includes('APPLE_HEALTH_BRIDGE_TOKEN')) throw new Error('Apple Health Shortcuts setup wizard is incomplete');

const backupCrypto = await readFile(resolve(root, 'public/js/core/cloud-backup-crypto.js'), 'utf8');
if (!backupCrypto.includes('AES-GCM') || !backupCrypto.includes('PBKDF2') || !backupCrypto.includes('decryptSnapshot')) throw new Error('Encrypted cloud backup crypto is incomplete');
const backupAdapter = await readFile(resolve(root, 'public/js/adapters/cloud-backup.js'), 'utf8');
if (!backupAdapter.includes('backupNow') || !backupAdapter.includes('initializeCloudBackupLifecycle') || !backupAdapter.includes('applyRecoveryKit')) throw new Error('Encrypted cloud backup adapter is incomplete');
const backupWorker = await readFile(resolve(root, 'workers/cloud-backup/src/index.js'), 'utf8');
if (!backupWorker.includes('BACKUP_VAULTS') || !backupWorker.includes('BACKUP_BLOBS') || !backupWorker.includes('zeroKnowledge')) throw new Error('Cloud backup Worker is incomplete');

const foodCatalog = await readFile(resolve(root, 'public/js/data/food-catalog.js'), 'utf8');
const foodCount = (foodCatalog.match(/"id":"legacy-food-/g) || []).length;
if (foodCount < 400) throw new Error(`Legacy food catalog is unexpectedly small: ${foodCount}`);

const preparedFoods = JSON.parse(await readFile(resolve(root, 'public/data/thai-prepared-foods.json'), 'utf8'));
if (preparedFoods.length !== 1375) throw new Error(`Expected 1375 prepared foods, received ${preparedFoods.length}`);
console.log(`Repository verification passed (${foodCount} legacy + ${preparedFoods.length} prepared foods).`);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

