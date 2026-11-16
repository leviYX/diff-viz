import { useEffect, useState } from 'react';
import {
  Check,
  FolderGit2,
  GitBranch,
  History,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import type { CommitInfo, HubProject } from '../types';
import { CommitGraph } from './CommitGraph';
import { cn } from '../cn';

interface RepoPanelProps {
  open: boolean;
  projects: HubProject[];
  currentProjectId?: string;
  currentSha?: string;
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onOpenWorktree: (projectId: string) => void;
  onOpenCommit: (projectId: string, commit: CommitInfo) => void;
}

export function RepoPanel({
  open,
  projects,
  currentProjectId,
  currentSha,
  busy,
  error,
  onClose,
  onOpenWorktree,
  onOpenCommit,
}: RepoPanelProps) {
  const [selectedId, setSelectedId] = useState(currentProjectId ?? projects[0]?.id ?? '');
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [commitsError, setCommitsError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedId(currentProjectId ?? projects[0]?.id ?? '');
  }, [open, currentProjectId, projects]);

  useEffect(() => {
    if (!open || !selectedId) return undefined;
    let cancelled = false;
    setLoadingCommits(true);
    setCommitsError(null);
    fetch(`/api/commits?project=${encodeURIComponent(selectedId)}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = (await response.json()) as { commits?: CommitInfo[] };
        if (!cancelled) setCommits(payload.commits ?? []);
      })
      .catch((loadError) => {
        if (!cancelled) setCommitsError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (!cancelled) setLoadingCommits(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, selectedId]);

  if (!open) return null;
  const selectedProject = projects.find((project) => project.id === selectedId) ?? projects[0];
  const projectCommits = commits;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[#1b292d]/20 px-4 pb-6 pt-[72px] backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative flex max-h-[76vh] w-full max-w-[820px] flex-col overflow-hidden rounded-2xl border border-line bg-[#fffdf8] shadow-[0_30px_80px_-40px_rgba(60,50,30,0.45)] md:flex-row">
        <div className="flex w-full shrink-0 flex-col border-b border-line/80 bg-ink-850/50 md:w-[250px] md:border-b-0 md:border-r">
          <div className="flex items-center justify-between px-4 pb-3 pt-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-mist-200">
              <FolderGit2 size={13} className="text-accent" />
              已注册仓库
            </div>
            <span className="font-mono text-[9px] text-mist-600">{projects.length}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {projects.length === 0 ? (
              <div className="px-2 py-6 text-[10.5px] leading-5 text-mist-500">
                还没有仓库。先在目标仓库运行一次 <code className="font-mono">diff-viz</code>。
              </div>
            ) : (
              projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setSelectedId(project.id)}
                  className={cn(
                    'mb-1 flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition',
                    project.id === selectedId
                      ? 'border-accent/25 bg-accent-soft'
                      : 'border-transparent hover:bg-ink-800/70',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                      project.id === selectedId ? 'bg-accent/15 text-accent-bright' : 'bg-ink-800 text-mist-500',
                    )}
                  >
                    <GitBranch size={12} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-medium text-mist-200">{project.name}</span>
                    <span className="mt-0.5 block truncate font-mono text-[8.5px] text-mist-600">{project.branch}</span>
                  </span>
                  {project.id === currentProjectId ? <Check size={11} className="shrink-0 text-mint" /> : null}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-line/80 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-mist-100">
                <History size={13} className="text-accent" />
                {selectedProject?.name ?? '提交历史'}
              </div>
              <div className="mt-1 truncate font-mono text-[9px] text-mist-600">
                {selectedProject?.root ?? '选择左侧仓库'}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-mist-500 transition hover:bg-ink-800 hover:text-mist-100"
              aria-label="关闭"
            >
              <X size={15} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <button
              type="button"
              disabled={!selectedProject || busy}
              onClick={() => selectedProject && onOpenWorktree(selectedProject.id)}
              className="mb-3 flex w-full items-center gap-3 rounded-xl border border-line bg-ink-850/60 px-3 py-3 text-left transition hover:border-accent/30 hover:bg-accent-soft/40 disabled:opacity-50"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-mint/10 text-mint">
                <GitBranch size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-medium text-mist-200">当前工作区</span>
                <span className="mt-0.5 block text-[9.5px] text-mist-500">未提交 / 已暂存的改动</span>
              </span>
              <span className="text-[9px] text-mist-600">打开</span>
            </button>

            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-mist-500">版本链条</span>
              {loadingCommits ? <Loader2 size={11} className="animate-spin text-accent" /> : null}
            </div>

            {commitsError ? (
              <div className="rounded-lg border border-rose/20 bg-rose/5 px-3 py-2 text-[10px] text-rose">
                读取提交历史失败：{commitsError}
              </div>
            ) : null}

            <CommitGraph
              commits={projectCommits}
              currentSha={currentSha}
              disabled={busy}
              onSelect={(commit) => {
                if (selectedProject) onOpenCommit(selectedProject.id, commit);
              }}
            />
          </div>
        </div>

        {busy ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-[#fffdf8]/80 backdrop-blur-[2px]">
            <div className="flex items-center gap-2 rounded-full border border-line bg-[#fffdf8] px-3 py-2 text-[10.5px] text-mist-400 shadow-sm">
              <RefreshCw size={12} className="animate-spin text-accent" />
              正在生成 Review…
            </div>
          </div>
        ) : null}
        {error ? (
          <div className="absolute inset-x-4 bottom-4 rounded-lg border border-rose/20 bg-[#fdf2f3] px-3 py-2 text-[10px] text-rose">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
