import { spawnSync } from 'node:child_process';
import path from 'node:path';

const MAX_BUFFER = 1024 * 1024 * 512;

export function runGit(root, args, options = {}) {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: options.encoding === 'buffer' ? null : 'utf8',
    maxBuffer: MAX_BUFFER,
    env: {
      ...process.env,
      GIT_PAGER: 'cat',
      GIT_TERMINAL_PROMPT: '0',
      GIT_OPTIONAL_LOCKS: '0',
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const stderr = result.stderr ? String(result.stderr).trim() : `git ${args.join(' ')} failed`;
    throw new Error(stderr);
  }
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ? String(result.stderr) : '',
  };
}

export function findRepoRoot(startDir) {
  const { stdout } = runGit(startDir, ['rev-parse', '--show-toplevel']);
  return stdout.trim();
}

export class GitRepo {
  constructor(root) {
    this.root = path.resolve(root);
    this._emptyTree = null;
    this._head = undefined;
  }

  run(args, options) {
    return runGit(this.root, args, options);
  }

  revParse(ref) {
    const result = this.run(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { allowFailure: true });
    if (result.status !== 0) return null;
    return result.stdout.trim() || null;
  }

  get head() {
    if (this._head === undefined) this._head = this.revParse('HEAD');
    return this._head;
  }

  get emptyTree() {
    if (this._emptyTree) return this._emptyTree;
    const { stdout } = this.run(['mktree'], { allowFailure: true });
    this._emptyTree = stdout.trim() || '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
    return this._emptyTree;
  }

  branchName() {
    const result = this.run(['rev-parse', '--abbrev-ref', 'HEAD'], { allowFailure: true });
    const value = result.stdout.trim();
    if (!value || value === 'HEAD') return this.head ? this.head.slice(0, 8) : 'unborn';
    return value;
  }

  isDirty() {
    const { stdout } = this.run(['status', '--porcelain=v1', '-z', '--untracked-files=normal'], {
      allowFailure: true,
    });
    return stdout.length > 0;
  }

  mergeBase(a, b = 'HEAD') {
    const result = this.run(['merge-base', a, b], { allowFailure: true });
    return result.status === 0 ? result.stdout.trim() : null;
  }

  show(ref, filePath) {
    const result = this.run(['show', `${ref}:${filePath}`], { allowFailure: true, encoding: 'buffer' });
    if (result.status !== 0) return null;
    return result.stdout;
  }

  showIndex(filePath) {
    const result = this.run(['show', `:${filePath}`], { allowFailure: true, encoding: 'buffer' });
    if (result.status !== 0) return null;
    return result.stdout;
  }

  listFiles({ includeUntracked = true } = {}) {
    const args = ['ls-files', '-z'];
    if (includeUntracked) args.push('--cached', '--others', '--exclude-standard');
    const { stdout } = this.run(args);
    return stdout.split('\0').filter(Boolean);
  }

  listUntracked() {
    const { stdout } = this.run(['ls-files', '--others', '--exclude-standard', '-z']);
    return stdout.split('\0').filter(Boolean);
  }

  listFilesAt(ref) {
    const { stdout } = this.run(['ls-tree', '-r', '--name-only', '-z', ref]);
    return stdout.split('\0').filter(Boolean);
  }

  commitInfo(ref) {
    const result = this.run(['log', '-1', '--pretty=%H%x1f%h%x1f%s%x1f%an%x1f%aI', ref], { allowFailure: true });
    if (result.status !== 0) return null;
    const [sha, short, subject, author, date] = result.stdout.trim().split('\x1f');
    return { sha, short, subject, author, date };
  }

  changedFilesSince(ref) {
    const { stdout } = this.run(['diff', '--name-only', '-z', ref, '--']);
    return stdout.split('\0').filter(Boolean);
  }

  logSubject(ref) {
    const result = this.run(['log', '-1', '--pretty=%s', ref], { allowFailure: true });
    return result.status === 0 ? result.stdout.trim() : '';
  }
}
