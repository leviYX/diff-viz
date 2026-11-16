import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { GitRepo } from './git.mjs';
import { buildReviewData, mergePreviousState } from './collect.mjs';
import { updateReviewState, openInBrowser } from './server.mjs';
import { formatTimestamp, readJsonSafe, shortId, writeJsonAtomic } from './util.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const BIN_PATH = path.resolve(__dirname, '..', 'bin', 'diff-viz.mjs');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

export function hubHome() {
  if (process.env.DIFF_VIZ_HOME) return path.resolve(process.env.DIFF_VIZ_HOME);
  const preferred = path.join(os.homedir(), '.diff-viz');
  try {
    fs.mkdirSync(preferred, { recursive: true });
    fs.accessSync(preferred, fs.constants.W_OK);
    return preferred;
  } catch {
    // Sandboxed agents often allow writes only under the workspace or tmp.
    return path.join(os.tmpdir(), 'diff-viz-hub');
  }
}

export function hubRegistryPath(home = hubHome()) {
  return path.join(home, 'hub.json');
}

export function readHubInfo(home = hubHome()) {
  return readJsonSafe(hubRegistryPath(home));
}

export async function hubIsAlive(info) {
  if (!info?.port) return false;
  const host = info.host === '0.0.0.0' || info.host === '::' ? '127.0.0.1' : info.host || '127.0.0.1';
  try {
    const response = await fetch(`http://${host}:${info.port}/api/health`, {
      signal: AbortSignal.timeout(900),
    });
    if (!response.ok) return false;
    const payload = await response.json();
    return payload?.service === 'diff-viz-hub';
  } catch {
    return false;
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readBody(req, limit = 80 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('请求体不是合法 JSON');
  }
}

function contentTypeFor(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function serveStatic(req, res, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let filePath = path.resolve(DIST_DIR, relative);
  if (!filePath.startsWith(DIST_DIR + path.sep) && filePath !== DIST_DIR) {
    sendText(res, 403, 'Forbidden');
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    if (!path.extname(relative)) filePath = path.join(DIST_DIR, 'index.html');
    else {
      sendText(res, 404, 'Not found');
      return;
    }
  }
  const body = await fsp.readFile(filePath);
  const isHashedAsset = relative.startsWith('assets/');
  res.writeHead(200, {
    'Content-Type': contentTypeFor(filePath),
    'Cache-Control': isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-store',
    'Content-Length': body.length,
  });
  if (req.method === 'HEAD') res.end();
  else res.end(body);
}

function safeReviewId(value, fallback) {
  if (typeof value !== 'string' || !value) return fallback;
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 160);
  return cleaned || fallback;
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

function loadProjects(home) {
  const file = path.join(home, 'projects.json');
  const raw = readJsonSafe(file);
  const projects = new Map();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item?.root || !item?.id) continue;
      projects.set(item.id, item);
    }
  }
  return projects;
}

export async function startHub({
  port = 5173,
  host = '127.0.0.1',
  open = false,
  quiet = false,
  home = hubHome(),
} = {}) {
  fs.mkdirSync(home, { recursive: true });
  const reviewsDir = path.join(home, 'reviews');
  fs.mkdirSync(reviewsDir, { recursive: true });
  const projectsFile = path.join(home, 'projects.json');
  const projects = loadProjects(home);
  const reviews = new Map();

  const saveProjects = () => {
    writeJsonAtomic(projectsFile, [...projects.values()].sort((a, b) => a.name.localeCompare(b.name)));
  };

  const reviewFile = (reviewId) => path.join(reviewsDir, `${safeReviewId(reviewId, 'review')}.json`);

  const loadReview = (reviewId) => {
    if (reviews.has(reviewId)) return reviews.get(reviewId);
    const data = readJsonSafe(reviewFile(reviewId));
    if (data) reviews.set(reviewId, data);
    return data;
  };

  const saveReview = (reviewId, data, projectId) => {
    reviews.set(reviewId, data);
    writeJsonAtomic(reviewFile(reviewId), data);
    const project = projectId ? projects.get(projectId) : null;
    if (project) {
      project.lastReviewId = reviewId;
      project.updatedAt = formatTimestamp();
      saveProjects();
    }
  };

  const normalizeRoot = (root) => {
    const absolute = path.resolve(String(root));
    try {
      return fs.realpathSync(absolute);
    } catch {
      return absolute;
    }
  };

  const registerProject = (rootInput) => {
    if (!rootInput) throw new Error('缺少仓库路径。');
    const repo = new GitRepo(normalizeRoot(rootInput));
    const root = normalizeRoot(repo.root);
    const id = shortId(root, 12);
    const existing = projects.get(id);
    const project = {
      id,
      root,
      name: path.basename(root),
      branch: repo.branchName(),
      lastReviewId: existing?.lastReviewId ?? null,
      updatedAt: formatTimestamp(),
    };
    projects.set(id, project);
    saveProjects();
    return project;
  };

  const getProject = (idInput) => {
    if (!idInput) throw new Error('缺少 projectId。');
    const project = projects.get(idInput);
    if (!project) throw new Error(`未知仓库：${idInput}`);
    return project;
  };

  const reviewIdFor = (projectId, scope, data, payload) => {
    if (scope === 'worktree') return `${projectId}-worktree`;
    if (scope === 'staged') return `${projectId}-staged`;
    if (scope === 'commit') return `${projectId}-commit-${String(payload.commit).slice(0, 12)}`;
    const head = data.meta?.headRef ?? '';
    return `${projectId}-${scope}-${shortId(`${payload.range ?? payload.base ?? ''}:${head}`, 10)}`;
  };

  const analyzeProject = (project, payload) => {
    const scope = payload.scope || 'worktree';
    const options = {};
    if (scope === 'worktree') options.worktree = true;
    else if (scope === 'staged') options.staged = true;
    else if (scope === 'last') options.last = true;
    else if (scope === 'commit') options.commit = payload.commit;
    else if (scope === 'range') options.range = payload.range;
    else if (scope === 'base') options.base = payload.base;
    else throw new Error(`不支持的 scope：${scope}`);
    if (payload.annotations && typeof payload.annotations === 'object') options.annotations = payload.annotations;
    if (payload.summary) options.summary = String(payload.summary);

    const data = buildReviewData(new GitRepo(project.root), options);
    const reviewId = reviewIdFor(project.id, scope, data, payload);
    data.meta.projectId = project.id;
    data.meta.reviewId = reviewId;
    data.meta.scopeLabel = scope;
    const previous = loadReview(reviewId);
    if (previous) mergePreviousState(data, previous);
    saveReview(reviewId, data, project.id);
    return { reviewId, data };
  };

  const imports = async (payload) => {
    const project = registerProject(payload.root);
    const data = payload.data;
    if (!data?.meta || !Array.isArray(data.nodes)) throw new Error('导入的数据格式不正确。');
    const inferredScope =
      data.meta.mode === 'worktree' ? 'worktree' : data.meta.mode === 'staged' ? 'staged' : 'range';
    const inferredId =
      inferredScope === 'range'
        ? `${project.id}-range-${shortId(`${data.meta.rangeLabel}:${data.meta.headRef}`, 10)}`
        : `${project.id}-${inferredScope}`;
    const reviewId = safeReviewId(payload.reviewId, inferredId);
    data.meta.projectId = project.id;
    data.meta.reviewId = reviewId;
    const previous = loadReview(reviewId);
    if (previous) mergePreviousState(data, previous);
    saveReview(reviewId, data, project.id);
    return { reviewId, data };
  };

  const handler = async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);

    try {
      if (pathname === '/api/health') {
        sendJson(res, 200, {
          ok: true,
          service: 'diff-viz-hub',
          port: server.address()?.port ?? port,
          reviews: reviews.size,
          projects: projects.size,
        });
        return;
      }

      if (pathname === '/api/hub') {
        sendJson(res, 200, {
          ok: true,
          home,
          projects: [...projects.values()].sort((a, b) => a.name.localeCompare(b.name)),
        });
        return;
      }

      if (pathname === '/api/commits') {
        const project = getProject(url.searchParams.get('project'));
        const repo = new GitRepo(project.root);
        const { stdout } = repo.run([
          'log',
          '-n',
          '40',
          '--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%aI',
        ]);
        const commits = stdout
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const [sha, short, subject, author, date] = line.split('\x1f');
            return { sha, short, subject, author, date };
          });
        sendJson(res, 200, { ok: true, commits });
        return;
      }

      if (pathname === '/api/review' && req.method === 'POST') {
        const payload = await readBody(req);
        const project = payload.projectId ? getProject(payload.projectId) : registerProject(payload.root);
        const { reviewId } = analyzeProject(project, payload);
        sendJson(res, 200, {
          ok: true,
          reviewId,
          url: `/?review=${encodeURIComponent(reviewId)}`,
          project,
        });
        return;
      }

      if (pathname === '/api/import' && req.method === 'POST') {
        const payload = await readBody(req);
        const project = registerProject(payload.root);
        const { reviewId } = await imports(payload);
        sendJson(res, 200, {
          ok: true,
          reviewId,
          project,
          url: `/?review=${encodeURIComponent(reviewId)}`,
        });
        return;
      }

      if (pathname === '/api/data') {
        const reviewId = safeReviewId(url.searchParams.get('review'), '');
        if (!reviewId) {
          sendJson(res, 400, { error: '缺少 review 参数。' });
          return;
        }
        const data = loadReview(reviewId);
        if (!data) {
          sendJson(res, 404, { error: '找不到该 Review。' });
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(data));
        return;
      }

      if (pathname === '/api/state' && req.method === 'POST') {
        const payload = await readBody(req);
        const reviewId = safeReviewId(payload.reviewId, '');
        if (!reviewId) throw new Error('缺少 reviewId。');
        const dataPath = reviewFile(reviewId);
        if (!fs.existsSync(dataPath)) throw new Error('找不到该 Review 数据。');
        reviews.delete(reviewId);
        const result = updateReviewState(dataPath, payload);
        sendJson(res, 200, result);
        return;
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
      }

      await serveStatic(req, res, pathname);
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  };

  const server = http.createServer(handler);
  let actualPort = port;
  let lastError = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await listen(server, actualPort, host);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (error.code !== 'EADDRINUSE') throw error;
      actualPort += 1;
    }
  }
  if (lastError) throw lastError;

  const address = server.address();
  if (address && typeof address === 'object') actualPort = address.port;
  const displayHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  const url = `http://${displayHost}:${actualPort}/`;
  writeJsonAtomic(hubRegistryPath(home), {
    pid: process.pid,
    port: actualPort,
    host,
    home,
    startedAt: formatTimestamp(),
  });

  if (open) openInBrowser(url);
  if (!quiet) {
    process.stdout.write(`\n  diff-viz hub  ${url}\n`);
    process.stdout.write(`  状态目录      ${home}\n`);
    process.stdout.write('  按 Ctrl+C 停止 hub\n\n');
  }

  return {
    url,
    port: actualPort,
    server,
    home,
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          const info = readHubInfo(home);
          if (info?.pid === process.pid) {
            try {
              fs.rmSync(hubRegistryPath(home), { force: true });
            } catch {
              /* ignore */
            }
          }
          resolve();
        });
      }),
  };
}

export async function ensureHub({ port = 5173, host = '127.0.0.1', home = hubHome() } = {}) {
  const existing = readHubInfo(home);
  if (existing && (await hubIsAlive(existing))) {
    const infoHost = existing.host === '0.0.0.0' || existing.host === '::' ? '127.0.0.1' : existing.host;
    return { url: `http://${infoHost}:${existing.port}/`, port: existing.port, info: existing, started: false };
  }

  const child = spawn(
    process.execPath,
    [BIN_PATH, 'hub', '--port', String(port), '--host', host, '--quiet'],
    {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    },
  );
  child.unref();

  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const info = readHubInfo(home);
    if (info && (await hubIsAlive(info))) {
      const infoHost = info.host === '0.0.0.0' || info.host === '::' ? '127.0.0.1' : info.host;
      return { url: `http://${infoHost}:${info.port}/`, port: info.port, info, started: true };
    }
  }
  throw new Error('diff-viz hub 启动超时，请检查端口或手动运行 `diff-viz hub`。');
}

export async function stopHub(home = hubHome()) {
  const info = readHubInfo(home);
  if (!info?.pid) return { stopped: false };
  try {
    process.kill(info.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
  try {
    fs.rmSync(hubRegistryPath(home), { force: true });
  } catch {
    /* ignore */
  }
  return { stopped: true, pid: info.pid, port: info.port };
}
