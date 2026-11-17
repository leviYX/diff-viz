import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureGitExcluded, findRepoRoot, GitRepo } from './git.mjs';
import { applyAnnotations, buildReviewData, mergePreviousState } from './collect.mjs';
import { ensureHub, hubIsAlive, readHubInfo, startHub, stopHub } from './hub.mjs';
import { openInBrowser } from './server.mjs';
import { readJsonSafe, writeJsonAtomic } from './util.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));

const HELP = `
diff-viz · 本地代码变更可视化 Review 工具

用法:
  diff-viz [review] [选项]           分析 Git 变更并注册到本地 hub
  diff-viz serve [选项]              把已有数据注册到 hub 并打开
  diff-viz annotate [选项]           将 Agent/人工总结合并进数据文件
  diff-viz hub [选项]                前台启动常驻 hub（只启动一次）
  diff-viz stop                      停止本地 hub

范围 (默认: 工作区有改动则看工作区，否则看最近一次提交):
  --staged                仅查看已暂存 (git diff --cached)
  --last                  查看最近一次提交
  --range <A..B|A...B>    查看提交范围
  --base <ref>            查看与目标分支的差异 (merge-base..HEAD)

输出与界面:
  --data <file>           数据文件路径 (默认 <repo>/.diff-review-data.json)
  --annotations <file>    生成时合并注解文件 (JSON，见 SKILL.md)
  --node <path>           annotate 时只更新指定节点
  --summary <text>        覆盖整体摘要
  --json-only             仅生成 JSON，不启动界面
  --port <n>              hub 端口 (默认 5173，被占用时自动 +1)
  --host <addr>           监听地址 (默认 127.0.0.1)
  --no-open               不自动打开浏览器

分析:
  --impact-depth <n>      下游影响分析深度 (默认 3)
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
  'node',
]);

function toCamel(name) {
  return name.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

export function parseArgs(argv) {
  const options = { command: 'review' };
  let index = 0;
  if (argv[0] && !argv[0].startsWith('-')) {
    if (!['review', 'serve', 'annotate', 'hub', 'stop'].includes(argv[0])) {
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

// Keep the generated data file out of `git status`. Writing to .git/info/exclude
// avoids touching the user's .gitignore, so nothing shows up in their diff.
function hideDataFile(repo, dataPath) {
  const relative = path.relative(repo.root, dataPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return;
  try {
    ensureGitExcluded(repo.root, relative);
  } catch {
    /* never fail a review because of an unwritable exclude file */
  }
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

async function uploadReview(hubUrl, { root, data, reviewId }) {
  let response;
  try {
    response = await fetch(new URL('api/import', hubUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ root, data, reviewId }),
    });
  } catch (error) {
    throw new Error(`无法连接 diff-viz hub：${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.error) detail = payload.error;
    } catch {
      /* ignore */
    }
    throw new Error(`注册 Review 到 hub 失败：${detail}`);
  }
  return response.json();
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

  if (options.command === 'hub') {
    const existing = readHubInfo();
    if (existing && (await hubIsAlive(existing))) {
      const infoHost = existing.host === '0.0.0.0' || existing.host === '::' ? '127.0.0.1' : existing.host;
      process.stdout.write(`hub 已在运行：http://${infoHost}:${existing.port}/\n`);
      return;
    }
    const server = await startHub({
      port: Number(options.port) || 5173,
      host: options.host || '127.0.0.1',
      open: !options.noOpen && !process.env.CI,
      quiet: options.quiet,
    });
    await keepAlive(server);
    return;
  }

  if (options.command === 'stop') {
    const result = await stopHub();
    process.stdout.write(result.stopped ? `✔ 已停止 hub（pid ${result.pid}）\n` : '没有发现正在运行的 hub。\n');
    return;
  }

  if (options.command === 'annotate') {
    if (!options.annotations) throw new Error('annotate 需要 --annotations <file|->。');
    const repo = repoFromOptions(options);
    const dataPath = dataPathFor(repo, options);
    const data = readJsonSafe(dataPath);
    if (!data) throw new Error(`找不到数据文件：${dataPath}，请先运行 diff-viz。`);
    const annotations = readAnnotations(options.annotations);
    applyAnnotations(data, annotations, { onlyPaths: options.node ? [String(options.node)] : null });
    if (options.summary) data.meta.overallSummary = options.summary;
    data.meta.updatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    writeJsonAtomic(dataPath, data);
    hideDataFile(repo, dataPath);
    const hub = readHubInfo();
    if (hub && (await hubIsAlive(hub))) {
      const hubHost = hub.host === '0.0.0.0' || hub.host === '::' ? '127.0.0.1' : hub.host;
      try {
        await uploadReview(`http://${hubHost}:${hub.port}/`, {
          root: repo.root,
          data,
          reviewId: data.meta?.reviewId,
        });
        process.stdout.write(`  ↳ 已同步到运行中的 hub\n`);
      } catch (error) {
        process.stdout.write(`  ! 注解已写入本地，但同步 hub 失败：${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
    const annotated = data.nodes.filter((node) => node.summarySource === 'agent' || (node.todos || []).some((todo) => todo.source === 'agent')).length;
    process.stdout.write(`✔ 已合并注解：${annotated} 个节点 · ${dataPath}\n`);
    return;
  }

  if (options.command === 'serve') {
    const repo = repoFromOptions(options);
    const dataPath = options.data
      ? path.resolve(process.cwd(), options.data)
      : dataPathFor(repo, options);
    if (!fs.existsSync(dataPath)) {
      throw new Error(`找不到数据文件：${dataPath}，请先运行 diff-viz。`);
    }
    const data = readJsonSafe(dataPath);
    if (!data) throw new Error(`数据文件不是合法 JSON：${dataPath}`);
    const hub = await ensureHub({
      port: Number(options.port) || 5173,
      host: options.host || '127.0.0.1',
    });
    const imported = await uploadReview(hub.url, {
      root: repo.root,
      data,
      reviewId: data.meta?.reviewId,
    });
    data.meta.reviewId = imported.reviewId;
    writeJsonAtomic(dataPath, data);
    const reviewUrl = new URL(imported.url, hub.url).toString();
    if (!options.noOpen && !process.env.CI) openInBrowser(reviewUrl);
    process.stdout.write(`\n  Review UI  ${reviewUrl}\n  Hub        ${hub.url}\n\n`);
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
  hideDataFile(repo, dataPath);

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

  const hub = await ensureHub({
    port: Number(options.port) || 5173,
    host: options.host || '127.0.0.1',
  });
  const imported = await uploadReview(hub.url, {
    root: repo.root,
    data,
    reviewId: data.meta?.reviewId,
  });
  data.meta.reviewId = imported.reviewId;
  data.meta.projectId = imported.project?.id ?? data.meta.projectId;
  writeJsonAtomic(dataPath, data);
  const reviewUrl = new URL(imported.url, hub.url).toString();

  if (options.quiet) {
    process.stdout.write(`${reviewUrl}\n`);
  } else {
    process.stdout.write(`\n  Review UI  ${reviewUrl}\n`);
    process.stdout.write(`  Hub        ${hub.url}${hub.started ? ' (已启动)' : ' (复用中)'}\n\n`);
  }
  if (!options.noOpen && !process.env.CI) openInBrowser(reviewUrl);
}
