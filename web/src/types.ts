export type NodeStatus = 'added' | 'modified' | 'deleted' | 'impacted_only';

export type TodoSource = 'agent' | 'code_comment' | 'manual' | string;

export interface ReviewTodo {
  id: string;
  text: string;
  source: TodoSource;
  completed: boolean;
  severity?: 'high' | 'medium' | 'low' | string;
  category?: string;
  line?: number;
}

export interface ReviewNode {
  id: string;
  label: string;
  path: string;
  status: NodeStatus;
  stats: { additions: number; deletions: number };
  summary: string;
  impactAnalysis: string;
  todos: ReviewTodo[];
  diff: string;
  oldContent?: string;
  newContent?: string;
  language?: string;
  oldPath?: string;
  renamed?: boolean;
  untracked?: boolean;
  binary?: boolean;
  diffTruncated?: boolean;
  contentTruncated?: boolean;
  reviewed?: boolean;
  depth?: number;
  impactOrigins?: string[];
  imports?: string[];
  importedBy?: string[];
  summarySource?: 'auto' | 'agent' | string;
  impactSource?: string;
  reviewNotes?: string[];
}

export interface ReviewEdge {
  id: string;
  source: string;
  target: string;
  relation?: string;
}

export interface ReviewMeta {
  timestamp: string;
  branch: string;
  overallSummary: string;
  mode?: string;
  rangeLabel?: string;
  baseRef?: string;
  newRef?: string;
  headRef?: string;
  impactDepth?: number;
  repo?: string;
  projectId?: string;
  reviewId?: string;
  scopeLabel?: string;
  scannedRef?: string;
  generator?: string;
  version?: string;
  reviewOrder?: string[];
  summarySource?: string;
  updatedAt?: string;
  warnings?: string[];
  durationMs?: number;
  stats: {
    changedFiles: number;
    impactedFiles: number;
    additions: number;
    deletions: number;
    todos: number;
    edges?: number;
    scannedFiles?: number;
  };
}

export interface ReviewData {
  meta: ReviewMeta;
  nodes: ReviewNode[];
  edges: ReviewEdge[];
}

export type LayoutDirection = 'LR' | 'TB';
export type EdgeMode = 'impact' | 'dependency';
export type DrawerTab = 'summary' | 'diff' | 'todos';

export interface HubProject {
  id: string;
  name: string;
  root: string;
  branch?: string;
  lastReviewId?: string | null;
}

export interface CommitInfo {
  sha: string;
  short: string;
  subject: string;
  author: string;
  date: string;
}
