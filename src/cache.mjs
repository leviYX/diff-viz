import fs from 'node:fs';
import path from 'node:path';
import { readJsonSafe, shortId, stateHome, writeJsonAtomic } from './util.mjs';

// Bump when the parsed entry shape changes, so old caches are ignored instead
// of silently producing stale imports.
const CACHE_VERSION = 1;
const MAX_CACHE_FILES = 25_000;

export function scanCachePath(root) {
  return path.join(stateHome(), 'cache', `${shortId(root, 12)}.json`);
}

export function readScanCache(root) {
  const data = readJsonSafe(scanCachePath(root));
  if (!data || data.version !== CACHE_VERSION || !data.files) return { files: {} };
  return data;
}

export function writeScanCache(root, payload) {
  try {
    const entries = Object.entries(payload.files || {});
    const files =
      entries.length > MAX_CACHE_FILES ? Object.fromEntries(entries.slice(0, MAX_CACHE_FILES)) : payload.files;
    writeJsonAtomic(scanCachePath(root), {
      version: CACHE_VERSION,
      updatedAt: new Date().toISOString(),
      files,
    });
  } catch {
    /* the cache is best effort: never fail a review because of it */
  }
}

export function clearScanCache(root) {
  try {
    fs.rmSync(scanCachePath(root), { force: true });
  } catch {
    /* ignore */
  }
}
