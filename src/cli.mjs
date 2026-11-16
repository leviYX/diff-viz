import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRepoRoot, GitRepo } from './git.mjs';
import { applyAnnotations, buildReviewData, mergePreviousState } from './collect.mjs';
import { startServer } from './server.mjs';
import { readJsonSafe, writeJsonAtomic } from './util.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));

const HELP = `
diff-viz · 本地代码变更可视化 Review 工具

用法:
  diff-viz [review] [选项]           分析 Git 变更并打开可视化界面
  diff-viz serve [选项]              使用已有数据启动界面
  diff-viz annotate [选项]           将 Agent/人工总结合并进数据文件

范围 (默认: 工作区有改动则看工作区，否则看最近一次提交):
  --staged                仅查看已暂存 (git diff --cached)
  --last                  查看最近一次提交
  --range <A..B|A...B>    查看提交范围
  --base <ref>            查看与目标分支的差异 (merge-base..HEAD)

输出与界面:
  --data <file>           数据文件路径 (默认 <repo>/.diff-review-data.json)
  --annotations <file>    生成时合并注解文件 (JSON，见 SKILL.md)
  --summary <text>        覆盖整体摘要
  --json-only             仅生成 JSON，不启动界面
  --port <n>              端口 (默认 5173，被占用时自动 +1)
  --host <addr>           监听地址 (默认 127.0.0.1)
  --no-open               不自动打开浏览器

分析:
  --impact-depth <n>      下游影响分析深度 (默认 2)
  --max-impact <n>        最多展示多少个受影响文件 (默认 120)
  --no-untracked          不把未跟踪的新文件纳入 Review
  --repo <dir>            指定仓库目录 (默认当前目录)

其他:
  -h, --help              显示帮助
  -v, --version           显示版本
  --quiet                 减少日志
`;

const BOOLEAN_FLAGS = new Set([
  'staged',
  'last',
  'json-only',
  'no-open',
  'no-untracked',
  'untracked',
  'help',
  'version',
  'quiet',
  'verbose',
]);

const VALUE_FLAGS = new Set([
  'range',
  'base',
  'data',
  'annotations',
  'summary',
  'port',
  'host',
  'impact-depth',
  'max-impact',
  'repo',
]);

function toCamel(name) {
  return name.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

export function parseArgs(argv) {
  const options = { command: 'review' };
  let index = 0;
  if (argv[0] && !argv[0].startsWith('-')) {
    if (!['review', 'serve', 'annotate'].includes(argv[0])) {
      throw new Error(`未知命令：${argv[0]}`);
    }
    options.command = argv[0];
    index = 1;
  }
  for (; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--') && arg !== '-h' && arg !== '-v') {
      throw new Error(`无法识别的参数：${arg}`);
    }
    let name = arg;
    let inlineValue;
    if (arg.includes('=')) {
      [name, inlineValue] = arg.split(/=(.*)/s);
    }
    if (name === '-h') name = '--help';
    if (name === '-v') name = '--version';
    const key = name.slice(2);
    if (BOOLEAN_FLAGS.has(key)) {
      if (inlineValue !== undefined) throw new Error(`参数 ${name} 不需要值`);
      if (key === 'no-untracked') options.untracked = false;
      else options[toCamel(key)] = true;
      continue;
    }
    if (VALUE_FLAGS.has(key)) {
      const value = inlineValue !== undefined ? inlineValue : argv[++index];
      if (value === undefined || value.startsWith('--')) throw new Error(`参数 ${name} 需要一个值`);
      options[toCamel(key)] = value;
      continue;
    }
    throw new Error(`未知参数：${name}`);
  }
  return options;
}

function repoFromOptions(options) {
  const start = path.resolve(process.cwd(), options.repo || '.');
  if (!fs.existsSync(start)) throw new Error(`目录不存在：${start}`);
  try {
    return new GitRepo(findRepoRoot(start));
  } catch {
    throw new Error(`当前目录不是 Git 仓库：${start}\n  请在项目根目录运行，或使用 --repo <dir> 指定仓库。`);
  }
}

function dataPathFor(repo, options) {
  if (options.data) return path.resolve(process.cwd(), options.data);
  return path.join(repo.root, '.diff-review-data.json');
}

function readAnnotations(filePath) {
  if (filePath === '-') {
    try {
      const raw = fs.readFileSync(0, 'utf8');
      return JSON.parse(raw);
    } catch {
      throw new Error('无法从 stdin 读取注解 JSON。');
    }
  }
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) throw new Error(`注解文件不存在：${resolved}`);
  try {
    return JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    throw new Error(`注解文件不是合法 JSON：${resolved}`);
  }
}

function printSummary(data, dataPath) {
  const { meta } = data;
  const stats = meta.stats;
  process.stdout.write(
    `\n  ✔ 分析完成  ${stats.changedFiles} 个变更 · ${stats.impactedFiles} 个受影响 · +${stats.additions} / −${stats.deletions} · ${stats.todos} 个待办\n`,
  );
  process.stdout.write(`  范围        ${meta.rangeLabel}  (${meta.branch})\n`);
  process.stdout.write(`  数据        ${dataPath}\n`);
}

async function keepAlive(server) {
  await new Promise((resolve) => {
    const shutdown = async () => {
      try {
        await server.close();
      } finally {
        resolve();
      }
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  if (options.version) {
    process.stdout.write(`${pkg.version}\n`);
    return;
  }

  if (options.command === 'annotate') {
    if (!options.annotations) throw new Error('annotate 需要 --annotations <file|->。');
    const repo = repoFromOptions(options);
    const dataPath = dataPathFor(repo, options);
    const data = readJsonSafe(dataPath);
    if (!data) throw new Error(`找不到数据文件：${dataPath}，请先运行 diff-viz。`);
    const annotations = readAnnotations(options.annotations);
    applyAnnotations(data, annotations);
    if (options.summary) data.meta.overallSummary = options.summary;
    data.meta.updatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    writeJsonAtomic(dataPath, data);
    const annotated = data.nodes.filter((node) => node.summarySource === 'agent' || (node.todos || []).some((todo) => todo.source === 'agent')).length;
    process.stdout.write(`✔ 已合并注解：${annotated} 个节点 · ${dataPath}\n`);
    return;
  }

  if (options.command === 'serve') {
    const dataPath = options.data
      ? path.resolve(process.cwd(), options.data)
      : dataPathFor(repoFromOptions(options), options);
    if (!fs.existsSync(dataPath)) {
      throw new Error(`找不到数据文件：${dataPath}，请先运行 diff-viz。`);
    }
    const server = await startServer({
      dataPath,
      port: Number(options.port) || 5173,
      host: options.host || '127.0.0.1',
      open: !options.noOpen && !process.env.CI,
      quiet: options.quiet,
    });
    await keepAlive(server);
    return;
  }

  const repo = repoFromOptions(options);
  const dataPath = dataPathFor(repo, options);
  const previous = readJsonSafe(dataPath);
  const data = buildReviewData(repo, {
    staged: options.staged,
    last: options.last,
    range: options.range,
    base: options.base,
    impactDepth: options.impactDepth,
    maxImpact: options.maxImpact,
    untracked: options.untracked,
    summary: options.summary,
    annotationFile: options.annotations ? path.resolve(process.cwd(), options.annotations) : null,
    excludePaths: [
      dataPath,
      options.annotations && options.annotations !== '-'
        ? path.resolve(process.cwd(), options.annotations)
        : null,
    ],
    version: pkg.version,
  });
  mergePreviousState(data, previous);
  if (options.summary) data.meta.overallSummary = options.summary;
  writeJsonAtomic(dataPath, data);

  if (!options.quiet && !options.jsonOnly) printSummary(data, dataPath);

  if (options.jsonOnly) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          dataPath,
          meta: data.meta,
          nodes: data.nodes.length,
          edges: data.edges.length,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const server = await startServer({
    dataPath,
    port: Number(options.port) || 5173,
    host: options.host || '127.0.0.1',
    open: !options.noOpen && !process.env.CI,
    quiet: options.quiet,
  });
  await keepAlive(server);
}
