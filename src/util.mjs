import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function stateHome() {
  if (process.env.DIFF_VIZ_HOME) return path.resolve(process.env.DIFF_VIZ_HOME);
  const preferred = path.join(os.homedir(), '.diff-viz');
  try {
    fs.mkdirSync(preferred, { recursive: true, mode: 0o700 });
    fs.accessSync(preferred, fs.constants.W_OK);
    return preferred;
  } catch {
    // Sandboxed agents often allow writes only under the workspace or tmp.
    return path.join(os.tmpdir(), 'diff-viz-hub');
  }
}

export function toPosix(p) {
  return p.split(path.sep).join('/').replace(/^\.\//, '');
}

export function shortId(input, length = 10) {
  return crypto.createHash('sha1').update(String(input)).digest('hex').slice(0, length);
}

export function clampText(text, maxChars) {
  if (typeof text !== 'string') return { text: '', truncated: false };
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
}

export function isProbablyBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  for (const byte of sample) {
    if (byte === 0) return true;
  }
  return false;
}

export function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function writeJsonAtomic(file, data) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  // Review data can embed full source files, so keep it owner-only.
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* best effort on filesystems without POSIX modes */
  }
}

export function ensurePrivateDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.chmodSync(dir, 0o700);
  } catch {
    /* best effort */
  }
}

export function stripAnsi(value) {
  // eslint-disable-next-line no-control-regex
  return String(value).replace(/\u001b\[[0-9;]*m/g, '');
}

export function truncateMiddle(value, max = 64) {
  const str = String(value);
  if (str.length <= max) return str;
  const half = Math.floor((max - 1) / 2);
  return `${str.slice(0, half)}…${str.slice(-half)}`;
}

export function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function naturalCompare(a, b) {
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
}

export function formatTimestamp(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function safeReadFile(file, maxBytes = 2 * 1024 * 1024) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > maxBytes) return null;
    return fs.readFileSync(file);
  } catch {
    return null;
  }
}
