import {
  AlertTriangle,
  CheckCircle2,
  CornerDownRight,
  FilePlus2,
  FilePenLine,
  FileX2,
  ListChecks,
  Sparkles,
  Code2,
  PenLine,
} from 'lucide-react';
import type { NodeStatus, ReviewTodo, TodoSource } from './types';

export const STATUS_META: Record<
  NodeStatus,
  {
    label: string;
    short: string;
    color: string;
    soft: string;
    border: string;
    icon: typeof FilePenLine;
  }
> = {
  added: {
    label: '新增',
    short: 'A',
    color: '#2f8f63',
    soft: 'rgba(47, 143, 99, 0.10)',
    border: 'rgba(47, 143, 99, 0.30)',
    icon: FilePlus2,
  },
  modified: {
    label: '修改',
    short: 'M',
    color: '#8f6210',
    soft: 'rgba(143, 98, 16, 0.12)',
    border: 'rgba(143, 98, 16, 0.34)',
    icon: FilePenLine,
  },
  deleted: {
    label: '删除',
    short: 'D',
    color: '#c05563',
    soft: 'rgba(192, 85, 99, 0.10)',
    border: 'rgba(192, 85, 99, 0.30)',
    icon: FileX2,
  },
  impacted_only: {
    label: '受影响',
    short: 'I',
    color: '#6b7c8c',
    soft: 'rgba(107, 124, 140, 0.08)',
    border: 'rgba(107, 124, 140, 0.28)',
    icon: CornerDownRight,
  },
};

export const SOURCE_META: Record<TodoSource, { label: string; icon: typeof Code2 }> = {
  agent: { label: 'Agent 标注', icon: Sparkles },
  code_comment: { label: '代码注释', icon: Code2 },
  manual: { label: 'Review 备注', icon: PenLine },
};

export function severityMeta(severity: string | undefined) {
  if (severity === 'high') return { label: '高风险', color: '#b34756', bg: 'rgba(192, 85, 99, 0.10)' };
  if (severity === 'medium') return { label: '需关注', color: '#96650f', bg: 'rgba(169, 116, 24, 0.10)' };
  return null;
}

export function todoProgress(todos: ReviewTodo[], isDone: (todo: ReviewTodo) => boolean) {
  const completed = todos.filter((todo) => isDone(todo)).length;
  return { completed, total: todos.length, percent: todos.length === 0 ? 0 : Math.round((completed / todos.length) * 100) };
}

export { AlertTriangle, CheckCircle2, ListChecks };
