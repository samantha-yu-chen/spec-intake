import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SOURCE_TESTS, loadFixture, verifyFixture } from './fixture-adapter.ts';

describe('the v3 legacy fixture adapter', () => {
  it.each(Object.entries(SOURCE_TESTS))('executes named source test %s', async (_id, sourceTest) => {
    await expect(sourceTest()).resolves.toBeUndefined();
  });

  const fixtureDirectory = join(import.meta.dirname, '../fixtures/experiment');
  const fixtures = existsSync(fixtureDirectory)
    ? readdirSync(fixtureDirectory)
        .filter((name) => name.endsWith('.json'))
        .sort()
    : [];

  for (const name of fixtures) {
    it(`reproduces complete expected output for ${name}`, async () => {
      await expect(verifyFixture(loadFixture(join(fixtureDirectory, name)))).resolves.toBeUndefined();
    });
  }
});
