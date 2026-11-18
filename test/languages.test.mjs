import test from 'node:test';
import assert from 'node:assert/strict';
import { GitRepo } from '../src/git.mjs';
import { buildReviewData } from '../src/collect.mjs';
import { extractImports } from '../src/deps.mjs';
import { registryFor } from '../src/languages.mjs';
import { cleanup, commitAll, makeTempRepo, write } from './helpers.mjs';

const registry = registryFor([]);

test('extracts imports for the extra built-in languages', () => {
  const kotlin = extractImports(
    'App.kt',
    'package com.acme\nimport com.acme.util.Helper\nimport kotlin.collections.List\n',
    registry,
  );
  assert.deepEqual(kotlin.map((item) => item.spec), ['com.acme.util.Helper', 'kotlin.collections.List']);

  const csharp = extractImports(
    'App.cs',
    'using System;\nusing Acme.Services;\nnamespace Acme { class App {} }\n',
    registry,
  );
  assert.deepEqual(csharp.map((item) => item.spec), ['System', 'Acme.Services']);

  const rust = extractImports('lib.rs', 'mod util;\nuse crate::core::helper::Thing;\n', registry);
  assert.deepEqual(rust.map((item) => [item.spec, item.kind]), [
    ['util', 'mod'],
    ['crate::core::helper::Thing', 'use'],
  ]);

  const ruby = extractImports('app.rb', "require_relative './utils/helper'\nrequire 'json'\n", registry);
  assert.deepEqual(ruby.map((item) => [item.spec, item.kind]), [
    ['./utils/helper', 'relative'],
    ['json', 'plain'],
  ]);
});

function impactedByChanging(dir, target) {
  const data = buildReviewData(new GitRepo(dir), { worktree: true, impactDepth: 3 });
  const byPath = new Map(data.nodes.map((node) => [node.path, node]));
  const edges = data.edges.map((edge) => `${edge.source}->${edge.target}`);
  return { byPath, edges, data };
}

test('resolves Kotlin and C# package imports into dependency edges', () => {
  const dir = makeTempRepo();
  try {
    write(dir, 'src/main/kotlin/com/acme/App.kt', 'package com.acme\nimport com.acme.util.Helper\nclass App(val helper: Helper)\n');
    write(dir, 'src/main/kotlin/com/acme/util/Helper.kt', 'package com.acme.util\nclass Helper\n');
    write(dir, 'src/App.cs', 'using Acme.Services;\nnamespace Acme { class App { private Helper helper; } }\n');
    write(dir, 'src/Services/Helper.cs', 'namespace Acme.Services { class Helper {} }\n');
    commitAll(dir, 'init');

    write(dir, 'src/main/kotlin/com/acme/util/Helper.kt', 'package com.acme.util\nclass Helper { fun ping() = 1 }\n');
    write(dir, 'src/Services/Helper.cs', 'namespace Acme.Services { class Helper { public int Ping() => 1; } }\n');

    const { byPath, edges } = impactedByChanging(dir);
    assert.ok(edges.includes('src/main/kotlin/com/acme/App.kt->src/main/kotlin/com/acme/util/Helper.kt'));
    assert.equal(byPath.get('src/main/kotlin/com/acme/App.kt').status, 'impacted_only');
    assert.ok(edges.includes('src/App.cs->src/Services/Helper.cs'));
  } finally {
    cleanup(dir);
  }
});

test('resolves Rust mod/use and Ruby require_relative', () => {
  const dir = makeTempRepo();
  try {
    write(dir, 'src/lib.rs', 'mod util;\n');
    write(dir, 'src/util.rs', 'use crate::core::helper::Thing;\npub fn touch(t: Thing) {}\n');
    write(dir, 'src/core/helper.rs', 'pub struct Thing;\n');
    write(dir, 'lib/app.rb', "require_relative './utils/helper'\nApp = 1\n");
    write(dir, 'lib/utils/helper.rb', "HELPER = 1\n");
    commitAll(dir, 'init');

    write(dir, 'src/core/helper.rs', 'pub struct Thing;\nimpl Thing { pub fn new() -> Self { Thing } }\n');
    write(dir, 'lib/utils/helper.rb', "HELPER = 2\n");

    const { byPath, edges } = impactedByChanging(dir);
    assert.ok(edges.includes('src/util.rs->src/core/helper.rs'));
    assert.ok(edges.includes('src/lib.rs->src/util.rs'));
    assert.equal(byPath.get('src/util.rs').depth, 1);
    assert.equal(byPath.get('src/lib.rs').status, 'impacted_only');
    assert.ok(edges.includes('lib/app.rb->lib/utils/helper.rb'));
  } finally {
    cleanup(dir);
  }
});

test('project-level .diff-viz/languages.json adds a custom language', () => {
  const dir = makeTempRepo();
  try {
    write(
      dir,
      '.diff-viz/languages.json',
      JSON.stringify({
        languages: [
          {
            id: 'foo',
            label: 'Foo',
            extensions: ['.foo'],
            strategy: 'package',
            packagePattern: '^package ([\\w.]+)',
            importPatterns: ['^use ([\\w.]+)'],
          },
        ],
      }),
    );
    write(dir, 'a.foo', 'package demo\nuse demo.lib.Thing\n');
    write(dir, 'lib/Thing.foo', 'package demo.lib\nclass Thing\n');
    commitAll(dir, 'init');

    write(dir, 'lib/Thing.foo', 'package demo.lib\nclass Thing { v = 2 }\n');

    const { byPath, edges } = impactedByChanging(dir);
    assert.ok(edges.includes('a.foo->lib/Thing.foo'), `edges: ${edges.join(', ')}`);
    assert.equal(byPath.get('a.foo').status, 'impacted_only');
  } finally {
    cleanup(dir);
  }
});
