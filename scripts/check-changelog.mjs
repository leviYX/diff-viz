#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const changelogPath = path.join(root, 'CHANGELOG.md');

if (!fs.existsSync(changelogPath)) {
  console.error('✖ CHANGELOG.md 不存在，发布前必须补更新日志。');
  process.exit(1);
}

const changelog = fs.readFileSync(changelogPath, 'utf8');
const heading = new RegExp(`^## \\[${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`, 'm');
if (!heading.test(changelog)) {
  console.error(`✖ CHANGELOG.md 缺少当前版本 ${version} 的记录。`);
  console.error('  请先补充本版本的 Added / Changed / Fixed 等条目。');
  process.exit(1);
}

const section = changelog.split(heading)[1]?.split(/\n## \[/)[0] ?? '';
if (section.replace(/[#\s-]/g, '').length < 20) {
  console.error(`✖ CHANGELOG.md 中 ${version} 的内容太少，请描述本次新增/变更的 feature。`);
  process.exit(1);
}

console.log(`✓ CHANGELOG.md 已包含 ${version} 的发布说明`);
