import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GitRepo } from '../src/git.mjs';
import { buildReviewData } from '../src/collect.mjs';
import { startHub } from '../src/hub.mjs';
import { cleanup, commitAll, makeTempRepo, write } from './helpers.mjs';

test('hub registers projects, serves data, lists commits and builds historical reviews', async () => {
  const repoDir = makeTempRepo();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-viz-hub-'));
  write(repoDir, 'src/main/java/com/acme/App.java', 'package com.acme;\n\nimport com.acme.util.Helper;\n\npublic class App { private final Helper helper = new Helper(); }\n');
  write(repoDir, 'src/main/java/com/acme/util/Helper.java', 'package com.acme.util;\n\npublic class Helper {}\n');
  commitAll(repoDir, 'initial java service');
  write(repoDir, 'src/main/java/com/acme/App.java', 'package com.acme;\n\nimport com.acme.util.Helper;\n\npublic class App { private final Helper helper = new Helper(); public String ping() { return "pong"; } }\n');

  const repo = new GitRepo(repoDir);
  const data = buildReviewData(repo, { worktree: true });
  const server = await startHub({ port: 0, host: '127.0.0.1', open: false, quiet: true, home });
  try {
    const imported = await fetch(`${server.url}api/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ root: repoDir, data }),
    }).then((response) => response.json());
    assert.ok(imported.reviewId);

    const hub = await fetch(`${server.url}api/hub`).then((response) => response.json());
    assert.equal(hub.projects.length, 1);
    const projectId = hub.projects[0].id;

    const commits = await fetch(`${server.url}api/commits?project=${projectId}`).then((response) =>
      response.json(),
    );
    assert.equal(commits.commits.length, 1);
    assert.equal(commits.commits[0].subject, 'initial java service');

    const reviewResponse = await fetch(`${server.url}api/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, scope: 'commit', commit: commits.commits[0].sha }),
    }).then((response) => response.json());
    assert.ok(reviewResponse.reviewId.includes('commit'));

    const review = await fetch(`${server.url}api/data?review=${reviewResponse.reviewId}`).then((response) =>
      response.json(),
    );
    assert.ok(review.nodes.some((node) => node.path.endsWith('App.java')));
    assert.ok(review.edges.some((edge) => edge.target.endsWith('Helper.java')));

    const state = await fetch(`${server.url}api/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reviewId: reviewResponse.reviewId,
        nodeId: 'src/main/java/com/acme/App.java',
        reviewed: true,
      }),
    }).then((response) => response.json());
    assert.equal(state.ok, true);

    const updated = await fetch(`${server.url}api/data?review=${reviewResponse.reviewId}`).then((response) =>
      response.json(),
    );
    assert.equal(
      updated.nodes.find((node) => node.path === 'src/main/java/com/acme/App.java').reviewed,
      true,
    );
  } finally {
    await server.close();
    cleanup(repoDir);
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('projects can be added by path, validated, deduplicated and removed', async () => {
  const repoDir = makeTempRepo();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-viz-hub-'));
  const plainDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-viz-plain-'));
  write(repoDir, 'app.ts', 'export const app = 1;\n');
  commitAll(repoDir, 'init');
  fs.mkdirSync(path.join(repoDir, 'src'));

  const server = await startHub({ port: 0, host: '127.0.0.1', open: false, quiet: true, home });
  try {
    const add = (root) =>
      fetch(`${server.url}api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root }),
      });

    const added = await add(repoDir).then((response) => response.json());
    assert.equal(added.ok, true);
    assert.equal(added.project.root, fs.realpathSync(repoDir));
    assert.equal(added.project.name, path.basename(repoDir));

    // a subdirectory resolves to the repository root and keeps the same id
    const nested = await add(path.join(repoDir, 'src')).then((response) => response.json());
    assert.equal(nested.project.id, added.project.id);

    const hub = await fetch(`${server.url}api/hub`).then((response) => response.json());
    assert.equal(hub.projects.length, 1);

    const missing = await add(path.join(os.tmpdir(), 'diff-viz-definitely-missing'));
    assert.equal(missing.status, 500);
    assert.match((await missing.json()).error, /目录不存在/);

    const notRepo = await add(plainDir);
    assert.equal(notRepo.status, 500);
    assert.match((await notRepo.json()).error, /不是 Git 仓库/);

    const removed = await fetch(`${server.url}api/projects?id=${added.project.id}`, {
      method: 'DELETE',
    }).then((response) => response.json());
    assert.equal(removed.ok, true);

    const empty = await fetch(`${server.url}api/hub`).then((response) => response.json());
    assert.equal(empty.projects.length, 0);

    const missingDelete = await fetch(`${server.url}api/projects?id=nope`, { method: 'DELETE' });
    assert.equal(missingDelete.status, 404);
  } finally {
    await server.close();
    cleanup(repoDir);
    cleanup(plainDir);
    fs.rmSync(home, { recursive: true, force: true });
  }
});
