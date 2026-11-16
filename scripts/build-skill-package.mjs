#!/usr/bin/env node
/**
 * Build a self-contained skill package that can be dropped into
 * `~/.cursor/skills/` or `.cursor/skills/` without npm install.
 *
 * The runtime has no dependencies, so only bin/src/dist plus the skill docs
 * are needed. node_modules, tests, web sources and screenshots are excluded.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(root, 'release');
const skillDir = path.join(releaseDir, 'diff-viz');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

fs.rmSync(releaseDir, { recursive: true, force: true });
fs.mkdirSync(skillDir, { recursive: true });

for (const entry of ['bin', 'src', 'dist']) {
  fs.cpSync(path.join(root, entry), path.join(skillDir, entry), { recursive: true });
}
for (const file of ['SKILL.md', 'LICENSE']) {
  fs.copyFileSync(path.join(root, file), path.join(skillDir, file));
}

const manifest = {
  name: 'diff-viz',
  version,
  private: true,
  type: 'module',
  description: 'Local git change review visualizer packaged as an Agent Skill.',
  bin: { 'diff-viz': 'bin/diff-viz.mjs' },
  engines: { node: '>=20' },
  license: 'MIT',
};
fs.writeFileSync(path.join(skillDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);

fs.writeFileSync(
  path.join(skillDir, 'INSTALL.md'),
  `# diff-viz skill

直接使用：

1. 把整个 \`diff-viz\` 目录放到 \`~/.cursor/skills/\` 或项目的 \`.cursor/skills/\`。
2. 重新加载 Cursor / 新开 Agent 会话。
3. 输入 \`/diff-viz review 当前改动\`，或让 Agent 使用 \`diff-viz\` skill。

不依赖 npm install；需要 Node.js >= 20 和 Git。

命令行也可以直接运行：

\`\`\`bash
node <本目录>/bin/diff-viz.mjs --no-open
\`\`\`
`,
);

const zipPath = path.join(releaseDir, 'diff-viz-skill.zip');
try {
  execFileSync('zip', ['-qr', path.basename(zipPath), path.basename(skillDir)], {
    cwd: releaseDir,
    stdio: 'inherit',
  });
  console.log(`Skill folder: ${skillDir}`);
  console.log(`Zip:          ${zipPath}`);
} catch (error) {
  console.error('zip command failed; the folder is still ready:', error.message);
  process.exitCode = 1;
}

const size = (dir) => {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += size(full);
    else total += fs.statSync(full).size;
  }
  return total;
};
console.log(`Folder size:  ${(size(skillDir) / 1024).toFixed(0)} KB`);
