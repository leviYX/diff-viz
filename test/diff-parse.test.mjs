import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTodosFromAddedLines, parseUnifiedDiff } from '../src/diff-parse.mjs';

const SAMPLE = `diff --git a/src/auth.ts b/src/auth.ts
index 1111111..2222222 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,4 +1,6 @@
 import { verify } from './verify';
 
-export function login(token: string) {
-  return verify(token);
+export function login(token: string) {
+  // TODO: rotate refresh token in Redis
+  return verify(token);
 }
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,3 @@
+// FIXME: handle empty input
+export const created = true;
+export const other = false;
diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index 4444444..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export const legacy = 1;
-export const legacyTwo = 2;
`;

test('parses modified, added and deleted files with stats', () => {
  const { files } = parseUnifiedDiff(SAMPLE);
  assert.equal(files.length, 3);
  const modified = files.find((file) => file.path === 'src/auth.ts');
  assert.equal(modified.status, 'modified');
  assert.deepEqual(
    { additions: modified.additions, deletions: modified.deletions },
    { additions: 3, deletions: 2 },
  );
  assert.equal(modified.hunks.length, 1);
  assert.ok(modified.patch.includes('@@ -1,4 +1,6 @@'));

  const added = files.find((file) => file.path === 'src/new.ts');
  assert.equal(added.status, 'added');
  assert.equal(added.additions, 3);
  assert.equal(added.deletions, 0);

  const deleted = files.find((file) => file.path === 'src/old.ts');
  assert.equal(deleted.status, 'deleted');
  assert.equal(deleted.deletions, 2);
});

test('extracts TODO and FIXME markers from added lines only', () => {
  const { files } = parseUnifiedDiff(SAMPLE);
  const modified = files.find((file) => file.path === 'src/auth.ts');
  const todos = extractTodosFromAddedLines('src/auth.ts', modified.addedLines);
  assert.equal(todos.length, 1);
  assert.equal(todos[0].text, 'TODO: rotate refresh token in Redis');
  assert.equal(todos[0].source, 'code_comment');
  assert.equal(todos[0].line, 4);

  const added = files.find((file) => file.path === 'src/new.ts');
  const fixmes = extractTodosFromAddedLines('src/new.ts', added.addedLines);
  assert.equal(fixmes.length, 1);
  assert.equal(fixmes[0].severity, 'high');
  assert.equal(fixmes[0].line, 1);
});

test('handles rename-only sections and quoted paths', () => {
  const diff = `diff --git "a/src/\\346\\227\\247.ts" "b/src/new name.ts"
similarity index 100%
rename from src/\u65e7.ts
rename to "src/new name.ts"
diff --git a/docs/read me.md b/docs/read me.md
--- a/docs/read me.md
+++ b/docs/read me.md
@@ -1 +1 @@
-old
+new
`;
  const { files } = parseUnifiedDiff(diff);
  const renamed = files.find((file) => file.renamed);
  assert.ok(renamed);
  assert.equal(renamed.oldPath, 'src/\u65e7.ts');
  assert.equal(renamed.path, 'src/new name.ts');
  assert.equal(renamed.status, 'modified');
  assert.equal(renamed.additions, 0);

  const spaced = files.find((file) => file.path === 'docs/read me.md');
  assert.ok(spaced);
  assert.equal(spaced.additions, 1);
  assert.equal(spaced.deletions, 1);
});
