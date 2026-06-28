import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('AI Coach Worker uses Workers AI and contains no OpenAI API call', async () => {
  const source = await readFile(
    new URL(
      '../workers/ai-coach/src/index.js',
      import.meta.url
    ),
    'utf8'
  );

  assert.match(source, /env\.AI\.run/);
  assert.match(
    source,
    /@cf\/qwen\/qwen3-30b-a3b-fp8/
  );
  assert.doesNotMatch(
    source,
    /api\.openai\.com|OPENAI_API_KEY|OPENAI_MODEL/
  );
});

test('setup wizard no longer asks for an OpenAI key', async () => {
  const [setup, helper] = await Promise.all([
    readFile(
      new URL(
        '../scripts/setup-ai-coach.mjs',
        import.meta.url
      ),
      'utf8'
    ),
    readFile(
      new URL(
        '../scripts/lib/ai-coach-setup.mjs',
        import.meta.url
      ),
      'utf8'
    )
  ]);

  const combined = `${setup}\n${helper}`;
  assert.doesNotMatch(
    combined,
    /askHidden|OPENAI_API_KEY|process\.env\.OPENAI/
  );
  assert.match(combined, /binding:\s*'AI'/);
  assert.match(combined, /AI_COACH_ACCESS_TOKEN/);
});
