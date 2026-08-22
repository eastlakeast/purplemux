import { describe, expect, it } from 'vitest';
import {
  classifyClaudeInputSnapshot,
  getAgentInputBlockReason,
} from '@/lib/agent-input-state';
import type { IPaneSnapshot } from '@/lib/tmux';

const ESC = '\x1b';

const snapshot = (
  ansiContent: string,
  cursorX: number,
  cursorY: number,
): IPaneSnapshot => ({
  ansiContent,
  cursorX,
  cursorY,
  width: 120,
  height: ansiContent.split('\n').length,
});

describe('Claude Code input state', () => {
  it('recognizes a dim suggested prompt while the cursor stays at input start', () => {
    const content = [
      'previous response',
      `${ESC}[39m❯ ${ESC}[2m전체 세션 재기동해서 메모리 반영해줘${ESC}[0m`,
      `${ESC}[38;5;244m────────────────────${ESC}[39m`,
    ].join('\n');

    expect(classifyClaudeInputSnapshot(snapshot(content, 2, 1))).toBe('placeholder');
  });

  it('recognizes actual unsubmitted input from normal text and cursor position', () => {
    const content = [
      'previous response',
      `${ESC}[39m❯ PMUX_DETECT_TEST`,
      `${ESC}[38;5;244m────────────────────${ESC}[39m`,
    ].join('\n');

    expect(classifyClaudeInputSnapshot(snapshot(content, 18, 1))).toBe('typed');
  });

  it('treats a typed prefix followed by a dim completion as typed', () => {
    const content = `${ESC}[39m❯ 전체${ESC}[2m 세션 재기동${ESC}[0m`;

    expect(classifyClaudeInputSnapshot(snapshot(content, 4, 0))).toBe('typed');
  });

  it('recognizes an empty prompt', () => {
    expect(classifyClaudeInputSnapshot(snapshot(`${ESC}[39m❯ `, 2, 0))).toBe('empty');
  });

  it('reports unavailable when the cursor is outside the current input field', () => {
    const content = [
      `${ESC}[39m❯ old submitted prompt`,
      `${ESC}[38;5;244m────────────────────${ESC}[39m`,
      'Running a tool...',
    ].join('\n');

    expect(classifyClaudeInputSnapshot(snapshot(content, 8, 2))).toBe('unavailable');
  });

  it('fails closed when dim text has a cursor position inconsistent with a placeholder', () => {
    const content = `${ESC}[39m❯ ${ESC}[2mambiguous${ESC}[0m`;

    expect(classifyClaudeInputSnapshot(snapshot(content, 11, 0))).toBe('unknown');
  });

  it('only allows a missing input editor while the agent is busy', () => {
    expect(getAgentInputBlockReason('unavailable', 'busy')).toBeNull();
    expect(getAgentInputBlockReason('unavailable', 'idle')).toBe('unavailable');
    expect(getAgentInputBlockReason('unavailable', 'needs-input')).toBe('unavailable');
  });

  it('allows unknown input while busy but always blocks typed input', () => {
    expect(getAgentInputBlockReason('typed', 'busy')).toBe('typed');
    expect(getAgentInputBlockReason('unknown', 'busy')).toBeNull();
    expect(getAgentInputBlockReason('unknown', 'idle')).toBe('unknown');
    expect(getAgentInputBlockReason('placeholder', 'idle')).toBeNull();
    expect(getAgentInputBlockReason('empty', 'idle')).toBeNull();
  });
});
