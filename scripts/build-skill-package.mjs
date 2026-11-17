#!/usr/bin/env node
/**
 * Build the Agent Skill package.
 *
 * Default (thin): only SKILL.md + INSTALL.md + LICENSE. The CLI is installed
 * separately from npm, so the skills directory no longer needs bin/src/dist.
 *
 * `--standalone` keeps the old self-contained layout (bin/src/dist + SKILL.md)
 * for offline / air-gapped environments.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const standalone = process.argv.includes('--standalone');
const releaseDir = path.join(root, 'release');
const skillDir = path.join(releaseDir, 'diff-viz');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

fs.mkdirSync(releaseDir, { recursive: true });
fs.rmSync(skillDir, { recursive: true, force: true });
fs.mkdirSync(skillDir, { recursive: true });

for (const file of ['SKILL.md', 'LICENSE']) {
  fs.copyFileSync(path.join(root, file), path.join(skillDir, file));
}

if (standalone) {
  for (const entry of ['bin', 'src', 'dist']) {
    fs.cpSync(path.join(root, entry), path.join(skillDir, entry), { recursive: true });
  }

  const manifest = {
    name: 'diff-viz',
    version,
    private: true,
    type: 'module',
    description: 'Local git change review visualizer packaged as a self-contained Agent Skill.',
    bin: { 'diff-viz': 'bin/diff-viz.mjs' },
    engines: { node: '>=20' },
    license: 'MIT',
  };
  fs.writeFileSync(path.join(skillDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  fs.writeFileSync(
    path.join(skillDir, 'INSTALL.md'),
    `# diff-viz skill（离线自包含）

本目录包含 \`bin/src/dist\`，不需要 npm install。

1. 把整个 \`diff-viz\` 目录放到 \`~/.cursor/skills/\` 或项目的 \`.cursor/skills/\`（DSH 用 \`~/.dsh/skills/\`）。
2. 重新加载 Agent / 新开会话。
3. 如果系统没有全局 \`diff-viz\` 命令，让 Agent 使用：

\`\`\`bash
node "<本目录>/bin/diff-viz.mjs" --no-open
\`\`\`

需要 Node.js >= 20 和 Git。版本：${version}
`,
  );
} else {
  fs.writeFileSync(
    path.join(skillDir, 'INSTALL.md'),
    `# diff-viz skill（thin）

这个目录只需要 \`SKILL.md\`；运行时通过 npm 安装，不要把 \`bin/src/dist\` 复制进 skills 目录。

1. 安装 CLI：

\`\`\`bash
npm install -g diff-viz-cli
# 或 pnpm add -g diff-viz-cli
\`\`\`

2. 注册 skill：

\`\`\`bash
diff-viz skill install --agent dsh   # dsh | claude | cursor | agents
\`\`\`

也可以手动把本目录复制到 \`<agent>/skills/diff-viz\`。

3. 新开一个 Agent 会话，技能列表里会出现 \`diff-viz\`。

版本：${version}
`,
  );
}

const zipName = standalone ? 'diff-viz-skill-standalone.zip' : 'diff-viz-skill.zip';
const zipPath = path.join(releaseDir, zipName);
fs.rmSync(zipPath, { force: true });
try {
  execFileSync('zip', ['-qr', zipName, path.basename(skillDir)], {
    cwd: releaseDir,
    stdio: 'inherit',
  });
  console.log(`Mode:         ${standalone ? 'standalone' : 'thin'}`);
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
