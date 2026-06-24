import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const root = resolve('.');
const required = [
  'public/index.html',
  'public/js/app.js',
  'public/js/core/db.js',
  'public/js/core/races.js',
  'public/js/core/nutrition.js',
  'public/js/views/races.js',
  'public/js/views/fuel.js',
  'public/js/views/training.js',
  'public/js/views/log.js',
  'public/js/data/food-catalog.js',
  'public/js/data/training-library.js',
  'public/manifest.webmanifest',
  'wrangler.jsonc',
  'ios/TrailRunnerCoach/project.yml',
  'docs/FEATURE_PARITY.md'
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
if (packageJson.version !== '1.1.0') throw new Error(`Expected package version 1.1.0, received ${packageJson.version}`);
const serviceWorker = await readFile(resolve(root, 'public/service-worker.js'), 'utf8');
if (!serviceWorker.includes('trail-runner-coach-v1.1.0')) throw new Error('Service-worker cache version was not bumped to 1.1.0');
const constants = await readFile(resolve(root, 'public/js/core/constants.js'), 'utf8');
if (!constants.includes("APP_VERSION = '1.1.0'") || !constants.includes('DB_VERSION = 4')) throw new Error('Application or database version is incorrect');
const foodCatalog = await readFile(resolve(root, 'public/js/data/food-catalog.js'), 'utf8');
const foodCount = (foodCatalog.match(/"id":"legacy-food-/g) || []).length;
if (foodCount < 400) throw new Error(`Legacy food catalog is unexpectedly small: ${foodCount}`);

console.log(`Repository verification passed (${foodCount} bundled foods).`);

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
