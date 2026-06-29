import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('dashboard renders and binds the Home Coach Surface', async () => {
  const source = await readFile(
    new URL('../public/js/views/dashboard.js', import.meta.url),
    'utf8'
  );

  assert.match(source, /renderHomeCoachSurface/);
  assert.match(source, /bindHomeCoachSurface/);
  assert.match(source, /buildAiCoachSnapshot/);
});

test('sync-state rerenders the Today route after wearable or workout sync', async () => {
  const source = await readFile(
    new URL('../public/js/app.js', import.meta.url),
    'utf8'
  );

  assert.match(
    source,
    /reactiveRoutes[\s\S]*'today'/
  );
});

test('PWA cache and app version are upgraded to 3.1.0', async () => {
  const [constants, worker, pkg] = await Promise.all([
    readFile(
      new URL('../public/js/core/constants.js', import.meta.url),
      'utf8'
    ),
    readFile(
      new URL('../public/service-worker.js', import.meta.url),
      'utf8'
    ),
    readFile(
      new URL('../package.json', import.meta.url),
      'utf8'
    )
  ]);

  assert.match(constants, /APP_VERSION\s*=\s*'3\.1\.0'/);
  assert.match(worker, /trail-runner-coach-v3\.1\.0/);
  assert.equal(JSON.parse(pkg).version, '3.1.0');
});
