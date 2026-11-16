import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, commitAll, makeTempRepo, run, write } from './helpers.mjs';

const bin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'diff-viz.mjs');

test('CLI generates JSON-only output and merges annotations', () => {
  const dir = makeTempRepo();
  try {
    write(dir, 'src/a.ts', "export const a = 1;\n");
    commitAll(dir, 'init');
    write(dir, 'src/a.ts', "export const a = 2; // TODO: check\n");
    write(dir, 'src/untracked.ts', 'export const extra = true;\n');

    const dataPath = path.join(dir, '.diff-review-data.json');
    const output = run(dir, process.execPath, [
      bin,
      '--json-only',
      '--quiet',
      '--data',
      dataPath,
      '--no-open',
    ]);
    const result = JSON.parse(output);
    assert.equal(result.ok, true);
    assert.equal(result.meta.stats.changedFiles, 2);
    assert.ok(fs.existsSync(dataPath));

    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    assert.ok(data.nodes.some((node) => node.path === 'src/untracked.ts' && node.status === 'added'));
    assert.ok(data.nodes.find((node) => node.path === 'src/a.ts').todos.length === 1);

    const annotationsPath = path.join(dir, 'annotations.json');
    fs.writeFileSync(
      annotationsPath,
      JSON.stringify({
        overallSummary: 'CLI 注解测试',
        nodes: {
          'src/a.ts': { summary: '改了常量', impactAnalysis: '无下游依赖', todos: ['人工确认常量'] },
        },
      }),
      'utf8',
    );
    run(dir, process.execPath, [bin, 'annotate', '--data', dataPath, '--annotations', annotationsPath]);
    const annotated = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    assert.equal(annotated.meta.overallSummary, 'CLI 注解测试');
    assert.equal(annotated.nodes.find((node) => node.path === 'src/a.ts').summary, '改了常量');
    assert.ok(annotated.nodes.find((node) => node.path === 'src/a.ts').todos.some((todo) => todo.source === 'agent'));
  } finally {
    cleanup(dir);
  }
});

test('CLI auto scope falls back to the last commit when clean', () => {
  const dir = makeTempRepo();
  try {
    write(dir, 'README.md', 'hello\n');
    write(dir, 'src/a.ts', 'export const a = 1;\n');
    commitAll(dir, 'first');
    write(dir, 'src/a.ts', 'export const a = 2;\n');
    commitAll(dir, 'second');

    const dataPath = path.join(dir, 'review.json');
    run(dir, process.execPath, [bin, '--json-only', '--quiet', '--data', dataPath, '--no-open']);
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    assert.equal(data.meta.mode, 'rev');
    assert.match(data.meta.rangeLabel, /最近提交/);
    assert.ok(data.nodes.some((node) => node.path === 'src/a.ts'));
    assert.ok(!data.nodes.some((node) => node.path === 'README.md'));
  } finally {
    cleanup(dir);
  }
});
