import type { TWorkspaceGroupColor } from '@/types/terminal';

export const WORKSPACE_GROUP_COLORS: Array<{
  id: TWorkspaceGroupColor;
  css: string;
}> = [
  { id: 'neutral', css: 'var(--muted-foreground)' },
  { id: 'red', css: 'var(--ui-red)' },
  { id: 'coral', css: 'var(--ui-coral)' },
  { id: 'amber', css: 'var(--ui-amber)' },
  { id: 'green', css: 'var(--ui-green)' },
  { id: 'blue', css: 'var(--ui-blue)' },
  { id: 'purple', css: 'var(--ui-purple)' },
  { id: 'pink', css: 'var(--ui-pink)' },
];

const colorIds = new Set(WORKSPACE_GROUP_COLORS.map((color) => color.id));

export const isWorkspaceGroupColor = (value: unknown): value is TWorkspaceGroupColor =>
  typeof value === 'string' && colorIds.has(value as TWorkspaceGroupColor);

export const getWorkspaceGroupColorCss = (color?: TWorkspaceGroupColor): string =>
  WORKSPACE_GROUP_COLORS.find((candidate) => candidate.id === color)?.css ?? 'var(--muted-foreground)';
