const LABELS: Record<string, string> = {
  typescript: 'TypeScript',
  tsx: 'TSX',
  javascript: 'JavaScript',
  jsx: 'JSX',
  python: 'Python',
  go: 'Go',
  java: 'Java',
  json: 'JSON',
  markdown: 'Markdown',
  css: 'CSS',
  scss: 'SCSS',
  html: 'HTML',
  vue: 'Vue',
  svelte: 'Svelte',
  yaml: 'YAML',
  bash: 'Shell',
  sql: 'SQL',
  toml: 'TOML',
  rust: 'Rust',
  text: 'Text',
};

export function languageLabel(language: string | undefined): string {
  if (!language) return 'Text';
  return LABELS[language] ?? language;
}
