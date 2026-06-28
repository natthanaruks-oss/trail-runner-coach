import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('app registers the AI Coach route', async () => {
  const source = await readFile(
    new URL('../public/js/app.js', import.meta.url),
    'utf8'
  );

  assert.match(source, /import \{ renderAiCoach \} from '\.\/views\/ai-coach\.js';/);
  assert.match(source, /'ai-coach': renderAiCoach/);
});

test('Trail Coach links to AI explanation without replacing the Local Coach', async () => {
  const source = await readFile(
    new URL('../public/js/views/coach.js', import.meta.url),
    'utf8'
  );

  assert.match(source, /href="#\/ai-coach"/);
  assert.match(source, /buildTrailCoachIntelligence/);
});

test('AI Coach frontend never contains an OpenAI API key', async () => {
  const [view, adapter, snapshot] = await Promise.all([
    readFile(new URL('../public/js/views/ai-coach.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/adapters/ai-coach.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/core/ai-coach-snapshot.js', import.meta.url), 'utf8')
  ]);

  const combined = `${view}\n${adapter}\n${snapshot}`;
  assert.doesNotMatch(combined, /sk-[A-Za-z0-9]/);
  assert.doesNotMatch(combined, /OPENAI_API_KEY/);
});
