import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Today shows one consolidated coach surface', async () => {
  const source = await readFile(
    new URL('../public/js/views/dashboard.js', import.meta.url),
    'utf8'
  );

  assert.match(
    source,
    /import \{ buildMorningCoach \} from '\.\.\/core\/morning-coach\.js';/
  );
  assert.match(source, /const morningCoach = buildMorningCoach\(/);
  assert.match(source, /โค้ชเช้า · ความพร้อมวันนี้/);
  assert.doesNotMatch(
    source,
    /\$\{renderMorningCoach\(\{\s*morningCoach\s*,\s*trailCoach\s*,\s*today\s*,\s*en\s*\}\)\}/
  );
});

test('Morning Coach remains local and exposes no secret', async () => {
  const source = await readFile(
    new URL('../public/js/core/morning-coach.js', import.meta.url),
    'utf8'
  );

  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(
    source,
    /OPENAI_API_KEY|ANTHROPIC_API_KEY|CLOUDFLARE_API_TOKEN/
  );
});
