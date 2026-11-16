#!/usr/bin/env node
/**
 * Create a throw-away demo repository in .demo/ and launch diff-viz on it.
 * No external dependencies: only git and node are required.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demoDir = path.join(projectRoot, '.demo');
const bin = path.join(projectRoot, 'bin', 'diff-viz.mjs');

if (path.dirname(demoDir) !== projectRoot) {
  throw new Error(`Refusing to clean unexpected demo path: ${demoDir}`);
}

function git(...args) {
  return execFileSync('git', ['-C', demoDir, ...args], { encoding: 'utf8' });
}

function write(relativePath, content) {
  const file = path.join(demoDir, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

fs.rmSync(demoDir, { recursive: true, force: true });
fs.mkdirSync(demoDir, { recursive: true });
git('init', '-q');
git('config', 'user.email', 'demo@diff-viz.local');
git('config', 'user.name', 'diff-viz demo');

write(
  'tsconfig.json',
  `{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  }
}
`,
);
write('package.json', '{ "name": "diff-viz-demo", "private": true }\n');
write(
  'src/utils/format.ts',
  `export function formatDate(date: Date): string {
  return date.toISOString();
}
`,
);
write(
  'src/auth/session.ts',
  `import { formatDate } from '@/utils/format';

export interface Session {
  sub: string;
  exp: number;
}

export function createSession(sub: string, ttlSeconds = 3600): string {
  const session: Session = { sub, exp: Date.now() + ttlSeconds * 1000 };
  return btoa(JSON.stringify(session));
}

export function verifySession(token: string): Session | null {
  try {
    const session = JSON.parse(atob(token)) as Session;
    if (session.exp < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function describeSession(token: string): string {
  const session = verifySession(token);
  return session ? \`\${session.sub} until \${formatDate(new Date(session.exp))}\` : 'invalid';
}
`,
);
write(
  'src/api/routes.ts',
  `import { verifySession } from '@/auth/session';

export const routes = {
  'GET /me': (token: string) => verifySession(token),
};
`,
);
write('src/server.ts', `import { routes } from '@/api/routes';\n\nexport const handler = routes;\n`);
write('app/__init__.py', '');
write('app/security.py', `import hashlib\n\n\ndef hash_password(password: str) -> str:\n    return hashlib.sha256(password.encode()).hexdigest()\n`);
write(
  'app/auth.py',
  `from app.security import hash_password\n\n\ndef login(email: str, password: str) -> dict:\n    return {"email": email, "hash": hash_password(password)}\n`,
);
write('app/main.py', `from app.auth import login\n\n\ndef handle(email: str, password: str):\n    return login(email, password)\n`);
write('go.mod', 'module example.com/diff-viz-demo\n\ngo 1.22\n');
write('internal/auth/auth.go', `package auth\n\ntype Claims struct {\n\tSub string\n\tExp int64\n}\n\nfunc Validate(token string) *Claims {\n\treturn &Claims{Sub: token}\n}\n`);
write('cmd/server/main.go', `package main\n\nimport (\n\t"fmt"\n\n\t"example.com/diff-viz-demo/internal/auth"\n)\n\nfunc main() {\n\tfmt.Println(auth.Validate("demo").Sub)\n}\n`);

git('add', '-A');
git('commit', '-qm', 'initial auth stack');

write(
  'src/auth/session.ts',
  `import { formatDate } from '@/utils/format';

export interface Session {
  sub: string;
  exp: number;
  refresh?: boolean;
}

const REFRESH_WINDOW_MS = 5 * 60 * 1000;

export function createSession(sub: string, ttlSeconds = 3600): string {
  const session: Session = { sub, exp: Date.now() + ttlSeconds * 1000 };
  return btoa(JSON.stringify(session));
}

export function refreshSession(token: string): string | null {
  // TODO: 从 Redis 读取并轮换 refresh token，确认 TTL 已对齐
  const session = verifySession(token);
  if (!session) return null;
  return createSession(session.sub, 900);
}

export function verifySession(token: string): Session | null {
  try {
    const session = JSON.parse(atob(token)) as Session;
    if (session.exp < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

// FIXME: 旧版客户端没有 refresh 字段，需要兼容
export function describeSession(token: string): string {
  const session = verifySession(token);
  return session ? \`\${session.sub} until \${formatDate(new Date(session.exp))}\` : 'invalid';
}
`,
);
write(
  'src/api/routes.ts',
  `import { verifySession, refreshSession } from '@/auth/session';

export const routes = {
  'POST /refresh': (token: string) => refreshSession(token),
  'GET /me': (token: string) => verifySession(token),
};
`,
);
write('src/auth/refresh.ts', `import { refreshSession } from '@/auth/session';\n\nexport function rotate(token: string) {\n  // TODO: 记录 refresh 轮换审计日志\n  return refreshSession(token);\n}\n`);
write(
  'app/auth.py',
  `from app.security import hash_password\n\n\ndef login(email: str, password: str) -> dict:\n    # FIXME: 登录失败时没有记录审计日志\n    return {"email": email, "hash": hash_password(password)}\n\n\ndef refresh(token: str) -> dict:\n    # TODO: refresh token 的 Redis TTL 需要与 JWT 过期时间对齐\n    return {"token": token, "ttl": 900}\n`,
);
fs.rmSync(path.join(demoDir, 'app/security.py'));
write(
  'internal/auth/auth.go',
  `package auth\n\nimport "errors"\n\ntype Claims struct {\n\tSub     string\n\tExp     int64\n\tRefresh bool\n}\n\nfunc Validate(token string) (*Claims, error) {\n\tif token == "" {\n\t\treturn nil, errors.New("empty token")\n\t}\n\treturn &Claims{Sub: token}, nil\n}\n\nfunc Refresh(claims *Claims) *Claims {\n\t// TODO: 轮换 refresh token 并写入审计日志\n\treturn &Claims{Sub: claims.Sub, Refresh: true}\n}\n`,
);
write('docs/REVIEW_NOTES.md', '# Review notes\n\n- 确认 refresh token 的 Redis TTL\n- 确认旧客户端兼容性\n');

fs.writeFileSync(
  path.join(demoDir, '.diff-review-annotations.json'),
  `${JSON.stringify(
    {
      meta: {
        overallSummary:
          '本次 demo 重构了会话刷新逻辑：TS 端新增 refreshSession，Python 端补充 TTL 说明，Go 端增加 Refresh 方法；同时删除密码哈希模块，需要重点确认旧调用是否清理。',
      },
      nodes: {
        'src/auth/session.ts': {
          summary: '新增 refreshSession()，verifySession 保持原逻辑，补充旧客户端兼容性 FIXME。',
          impactAnalysis:
            'routes.ts 与 authGuard 依赖 verifySession；新增 /refresh 路由后，旧客户端没有 refresh 字段时需要兼容处理。',
          todos: [
            {
              text: '确认 Redis 中 refresh token 的 TTL 与 JWT 过期时间一致',
              severity: 'high',
              category: 'config',
            },
            { text: '补一个 token 过期边界的单测', severity: 'medium' },
          ],
        },
        'src/api/routes.ts': {
          summary: '新增 POST /refresh 路由，复用 session.refreshSession。',
          impactAnalysis: 'server.ts 通过 routes 暴露新接口，需要补路由级集成测试。',
        },
        'src/auth/refresh.ts': {
          summary: '新增 refresh 轮换入口，先校验 session 再刷新。',
          impactAnalysis: '当前为新增模块，暂无下游依赖。',
        },
        'app/auth.py': {
          summary: '补充 refresh() 函数与登录审计 FIXME；仍引用已删除的 app.security。',
          impactAnalysis: 'app/main.py 依赖该模块，删除 security.py 后 Python 端会 import 失败，必须同步清理。',
          todos: [
            {
              text: 'security.py 已删除，但 app/auth.py 仍然 import，需同步修复',
              severity: 'high',
              category: 'breaking',
            },
          ],
        },
        'internal/auth/auth.go': {
          summary: '新增 Refresh() 并补充空 token 校验。',
          impactAnalysis: 'cmd/server 可逐步接入 Refresh，当前调用方无需改动。',
        },
      },
    },
    null,
    2,
  )}\n`,
  'utf8',
);

process.stdout.write('\n  演示仓库已创建：.demo/\n  正在启动 diff-viz…（Ctrl+C 停止）\n\n');
const extraArgs = process.argv.slice(2);
const result = spawnSync(process.execPath, [bin, '--annotations', '.diff-review-annotations.json', ...extraArgs], {
  cwd: demoDir,
  stdio: 'inherit',
});
process.exit(result.status ?? 0);
