import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('app exposes roadmap without adding primary navigation',async()=>{const s=await readFile(new URL('../public/js/app.js',import.meta.url),'utf8');assert.match(s,/roadmap: renderRaceRoadmap/);assert.doesNotMatch(s,/data-route="roadmap"/);});
test('dashboard renders race mission card',async()=>{const s=await readFile(new URL('../public/js/views/dashboard.js',import.meta.url),'utf8');assert.match(s,/renderRaceMissionCard/);});
test('AI cache key uses full snapshot digest',async()=>{const s=await readFile(new URL('../public/js/core/home-coach-runtime.js',import.meta.url),'utf8');assert.match(s,/hc4-\$\{String\(snapshot\.digest/);});
test('AI snapshot includes horizon and change context',async()=>{const s=await readFile(new URL('../public/js/core/ai-coach-snapshot.js',import.meta.url),'utf8');assert.match(s,/contextVersion: 4/);assert.match(s,/horizon: compactHorizonForAi/);assert.match(s,/changeContext:/);});
test('version is 4.0.0',async()=>{const [c,p]=await Promise.all([readFile(new URL('../public/js/core/constants.js',import.meta.url),'utf8'),readFile(new URL('../package.json',import.meta.url),'utf8')]);assert.match(c,/APP_VERSION = '4\.0\.0'/);assert.equal(JSON.parse(p).version,'4.0.0');});
