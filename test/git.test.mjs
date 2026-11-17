import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ensureGitExcluded, isIgnored } from '../src/git.mjs';
import { cleanup, commitAll, makeTempRepo, run, write } from './helpers.mjs';

test('ensureGitExcluded hides generated files without touching .gitignore', () => {
  const dir = makeTempRepo();
  try {
    write(dir, 'a.ts', 'export const a = 1;\n');
    commitAll(dir, 'init');

    const first = ensureGitExcluded(dir, '.diff-review-data.json');
    assert.equal(first.changed, true);
    assert.equal(isIgnored(dir, '.diff-review-data.json'), true);

    write(dir, '.diff-review-data.json', '{"meta":{}}');
    assert.equal(run(dir, 'git', ['status', '--porcelain']).trim(), '');
    assert.equal(fs.existsSync(path.join(dir, '.gitignore')), false);

    const second = ensureGitExcluded(dir, '.diff-review-data.json');
    assert.equal(second.changed, false);

    const exclude = fs.readFileSync(path.join(dir, '.git/info/exclude'), 'utf8');
    assert.equal(exclude.split('\n').filter((line) => line.trim() === '/.diff-review-data.json').length, 1);
  } finally {
    cleanup(dir);
  }
});
