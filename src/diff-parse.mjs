/**
 * Minimal unified-diff parser tuned for `git diff` output.
 * Produces per-file patches, hunk metadata, stats and added-line locations
 * (the latter power the TODO/FIXME scanner).
 */

const FILE_HEADER = 'diff --git ';

function decodeGitQuoted(str, start = 0) {
  if (str[start] !== '"') return null;
  const chunks = [];
  let bytes = [];
  const flushBytes = () => {
    if (bytes.length === 0) return;
    chunks.push(Buffer.from(bytes).toString('utf8'));
    bytes = [];
  };
  let i = start + 1;
  while (i < str.length) {
    const ch = str[i];
    if (ch === '"') {
      flushBytes();
      return { value: chunks.join(''), end: i + 1 };
    }
    if (ch !== '\\') {
      flushBytes();
      chunks.push(ch);
      i += 1;
      continue;
    }
    const next = str[i + 1];
    if (next === undefined) break;
    if (/[0-7]/.test(next)) {
      let oct = '';
      let j = i + 1;
      while (j < str.length && oct.length < 3 && /[0-7]/.test(str[j])) {
        oct += str[j];
        j += 1;
      }
      bytes.push(parseInt(oct, 8) & 0xff);
      i = j;
      continue;
    }
    const simple = {
      n: '\n',
      t: '\t',
      r: '\r',
      '"': '"',
      '\\': '\\',
      a: '\x07',
      b: '\b',
      f: '\f',
      v: '\v',
    };
    flushBytes();
    chunks.push(simple[next] ?? next);
    i += 2;
  }
  flushBytes();
  return { value: chunks.join(''), end: str.length };
}

function stripSidePrefix(value) {
  return value.replace(/^[ab]\//, '');
}

function parseGitHeaderPaths(rest) {
  const trimmed = rest;
  if (trimmed.startsWith('"')) {
    const first = decodeGitQuoted(trimmed, 0);
    if (!first) return null;
    let i = first.end;
    while (i < trimmed.length && trimmed[i] === ' ') i += 1;
    let secondValue;
    if (trimmed[i] === '"') {
      const second = decodeGitQuoted(trimmed, i);
      if (!second) return null;
      secondValue = second.value;
    } else {
      secondValue = trimmed.slice(i);
    }
    return [stripSidePrefix(first.value), stripSidePrefix(secondValue.trim())];
  }

  // `a/path b/path` (paths may themselves contain spaces). Try the last
  // occurrence of " b/" that yields matching halves first, then fall back.
  const marker = ' b/';
  let index = trimmed.lastIndexOf(marker);
  while (index !== -1) {
    const left = trimmed.slice(0, index);
    const right = trimmed.slice(index + marker.length);
    if (left.startsWith('a/') && left.slice(2) === right) {
      return [left.slice(2), right];
    }
    index = trimmed.lastIndexOf(marker, index - 1);
  }
  index = trimmed.lastIndexOf(marker);
  if (index !== -1) {
    const left = trimmed.slice(0, index);
    const right = trimmed.slice(index + marker.length);
    if (left.startsWith('a/')) return [left.slice(2), right];
  }
  return null;
}

function parseRawPath(raw) {
  let value;
  if (raw.startsWith('"')) {
    const parsed = decodeGitQuoted(raw, 0);
    value = parsed ? parsed.value : raw;
  } else {
    value = raw;
  }
  return value.trimEnd();
}

function parsePathLine(line) {
  // line is either `--- a/foo` / `+++ b/foo` or `--- /dev/null`
  const value = parseRawPath(line.slice(4));
  if (value === '/dev/null') return null;
  return stripSidePrefix(value);
}

function parseRange(value) {
  const [start, count] = value.split(',');
  return {
    start: Number.parseInt(start, 10) || 0,
    count: count === undefined ? 1 : Number.parseInt(count, 10) || 0,
  };
}

export function parseUnifiedDiff(raw) {
  const text = String(raw ?? '');
  const lines = text.split('\n');
  const files = [];
  let file = null;
  let hunk = null;
  let newLineNumber = 0;

  const finalize = () => {
    if (!file) return;
    if (file.plusPath) {
      file.path = file.plusPath;
    } else if (file.renameTo) {
      file.path = file.renameTo;
    } else if (file.minusPath) {
      file.path = file.minusPath;
    } else if (file.headerPaths) {
      file.path = file.headerPaths[1] || file.headerPaths[0];
    }
    if (file.renameFrom) file.oldPath = file.renameFrom;
    else if (file.minusPath && file.minusPath !== file.path) file.oldPath = file.minusPath;

    if (file.newFileMode) file.status = 'added';
    else if (file.deletedFileMode) file.status = 'deleted';
    else file.status = 'modified';

    file.patch = file._lines.join('\n');
    delete file._lines;
    delete file.headerPaths;
    if (file.path) files.push(file);
    file = null;
  };

  for (const line of lines) {
    if (line.startsWith(FILE_HEADER)) {
      finalize();
      const headerPaths = parseGitHeaderPaths(line.slice(FILE_HEADER.length));
      file = {
        path: null,
        oldPath: null,
        status: 'modified',
        additions: 0,
        deletions: 0,
        binary: false,
        renamed: false,
        addedLines: [],
        hunks: [],
        _lines: [line],
        headerPaths,
      };
      hunk = null;
      continue;
    }
    if (!file) continue;

    file._lines.push(line);

    if (hunk) {
      if (line.startsWith('\\')) continue; // "\ No newline at end of file"
      const marker = line[0];
      if (marker === '+') {
        file.additions += 1;
        file.addedLines.push({ line: newLineNumber, text: line.slice(1) });
        hunk.lines.push(line);
        newLineNumber += 1;
        continue;
      }
      if (marker === '-') {
        file.deletions += 1;
        hunk.lines.push(line);
        continue;
      }
      if (marker === ' ') {
        hunk.lines.push(line);
        newLineNumber += 1;
        continue;
      }
      // Hunk ended (e.g. blank separator before the next file header).
      hunk = null;
      if (line === '') continue;
    }

    if (line.startsWith('@@')) {
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(line);
      if (!match) continue;
      const oldRange = parseRange(`${match[1]}${match[2] === undefined ? '' : `,${match[2]}`}`);
      const newRange = parseRange(`${match[3]}${match[4] === undefined ? '' : `,${match[4]}`}`);
      hunk = {
        header: line,
        oldStart: oldRange.start,
        oldLines: oldRange.count,
        newStart: newRange.start,
        newLines: newRange.count,
        section: match[5].trim(),
        lines: [],
      };
      file.hunks.push(hunk);
      newLineNumber = newRange.start;
      continue;
    }

    if (line.startsWith('new file mode')) file.newFileMode = true;
    else if (line.startsWith('deleted file mode')) file.deletedFileMode = true;
    else if (line.startsWith('rename from ')) {
      file.renamed = true;
      file.renameFrom = parseRawPath(line.slice('rename from '.length));
    } else if (line.startsWith('rename to ')) {
      file.renamed = true;
      file.renameTo = parseRawPath(line.slice('rename to '.length));
    } else if (line.startsWith('--- ')) {
      const value = parsePathLine(line);
      if (value) file.minusPath = value;
    } else if (line.startsWith('+++ ')) {
      const value = parsePathLine(line);
      if (value) file.plusPath = value;
    } else if (line.startsWith('Binary files ') || line === 'GIT binary patch') {
      file.binary = true;
    }
  }
  finalize();

  return { files };
}

/** Scan added lines for TODO/FIXME style markers. */
const TODO_RE = /(?:\/\/|\/\*|\*|#|<!--|--|;)\s*(TODO|FIXME|XXX|HACK|BUG)\b[:\s-]*(.*)$/i;
const TODO_PLAIN_RE = /^\s*(TODO|FIXME|XXX|HACK|BUG)\b[:\s-]+(.*)$/i;

export function extractTodosFromAddedLines(nodePath, addedLines) {
  const todos = [];
  const seen = new Set();
  for (const { line, text } of addedLines) {
    const trimmed = text.replace(/\s+$/, '');
    if (!trimmed) continue;
    let match = TODO_RE.exec(trimmed);
    if (!match) match = TODO_PLAIN_RE.exec(trimmed);
    if (!match) continue;
    const marker = match[1].toUpperCase();
    const body = (match[2] || '').replace(/\*\/\s*$/, '').trim();
    const label = `${marker}${body ? `: ${body}` : ''}`;
    if (seen.has(label)) continue;
    seen.add(label);
    todos.push({
      id: `c-${marker.toLowerCase()}-${line}`,
      text: label,
      source: 'code_comment',
      completed: false,
      severity: marker === 'FIXME' || marker === 'BUG' ? 'high' : marker === 'HACK' || marker === 'XXX' ? 'medium' : 'medium',
      line,
    });
  }
  return todos;
}
