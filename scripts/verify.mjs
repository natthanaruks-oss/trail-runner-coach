import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const root = resolve('.');
const required = [
  'public/index.html',
  'public/js/app.js',
  'public/js/core/db.js',
  'public/js/core/races.js',
  'public/js/views/races.js',
  'public/manifest.webmanifest',
  'wrangler.jsonc',
  'ios/TrailRunnerCoach/project.yml'
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

console.log('Repository verification passed.');

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
