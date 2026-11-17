import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { GitRepo } from '../src/git.mjs';
import { scanRepository } from '../src/deps.mjs';
import { buildReviewData } from '../src/collect.mjs';
import { clearScanCache, readScanCache } from '../src/cache.mjs';
import { cleanup, commitAll, makeTempRepo, write } from './helpers.mjs';

test('scan cache reuses unchanged files and reparses touched ones', () => {
  const dir = makeTempRepo();
  try {
    write(dir, 'src/a.ts', 'export const a = 1;\n');
    write(dir, 'src/b.ts', 'import { a } from "./a";\nexport const b = a + 1;\n');
    commitAll(dir, 'init');
    const repo = new GitRepo(dir);
    clearScanCache(dir);

    const cold = scanRepository(repo, { includeUntracked: true });
    assert.equal(cold.files.get('src/b.ts').imports.length, 1);
    const cached = readScanCache(dir);
    assert.ok(cached.files['src/b.ts'], 'cache should record parsed entries');

    const warm = scanRepository(repo, { includeUntracked: true });
    assert.deepEqual(
      warm.files.get('src/b.ts').imports,
      cold.files.get('src/b.ts').imports,
    );

    write(dir, 'src/b.ts', 'import { a } from "./a";\nimport "./extra";\nexport const b = a + 1;\n');
    const touched = scanRepository(repo, { includeUntracked: true });
    assert.equal(touched.files.get('src/b.ts').imports.length, 2);
  } finally {
    cleanup(dir);
  }
});

test('impacted nodes carry the chain that led to them and default depth is 3', () => {
  const dir = makeTempRepo();
  try {
    write(dir, 'src/a.ts', 'export const a = 1;\n');
    write(dir, 'src/b.ts', 'import { a } from "./a";\nexport const b = a;\n');
    write(dir, 'src/c.ts', 'import { b } from "./b";\nexport const c = b;\n');
    write(dir, 'src/d.ts', 'import { c } from "./c";\nexport const d = c;\n');
    commitAll(dir, 'init');
    write(dir, 'src/a.ts', 'export const a = 2;\n');

    const data = buildReviewData(new GitRepo(dir), { worktree: true });
    const byPath = new Map(data.nodes.map((node) => [node.path, node]));
    assert.equal(byPath.get('src/b.ts').depth, 1);
    assert.equal(byPath.get('src/d.ts').depth, 3, 'default depth should reach three levels');
    assert.deepEqual(byPath.get('src/d.ts').impactChain, ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts']);
  } finally {
    cleanup(dir);
  }
});
