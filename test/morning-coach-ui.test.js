import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Today dashboard renders the local Morning Coach card', async () => {
  const source = await readFile(
    new URL('../public/js/views/dashboard.js', import.meta.url),
    'utf8'
  );

  assert.match(
    source,
    /import \{ buildMorningCoach \} from '\.\.\/core\/morning-coach\.js';/
  );
  assert.match(source, /const morningCoach = buildMorningCoach\(/);
  assert.match(source, /\$\{renderMorningCoach\(\{ morningCoach, trailCoach, today, en \}\)\}/);
  assert.match(source, /data-morning-coach="v1"/);
  assert.match(source, /href="#\/coach"/);
});

test('Morning Coach does not add remote AI or expose an API key', async () => {
  const engine = await readFile(
    new URL('../public/js/core/morning-coach.js', import.meta.url),
    'utf8'
  );

  assert.doesNotMatch(engine, /\bfetch\s*\(/);
  assert.doesNotMatch(engine, /OPENAI_API_KEY|ANTHROPIC_API_KEY|CLOUDFLARE_API_TOKEN/);
});
