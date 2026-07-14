import { describe, it, expect } from 'vitest';
import { parseJsonlContent } from '@/lib/session-parser';
import type { ITimelineUserMessage } from '@/types/timeline';

const attachment = (att: Record<string, unknown>) =>
  JSON.stringify({
    type: 'attachment',
    uuid: 'att-1',
    parentUuid: null,
    isSidechain: false,
    timestamp: '2026-07-14T07:46:20.000Z',
    attachment: att,
  });

// busy 중 큐잉된 프롬프트는 type:user가 아니라 queued_command 첨부로 기록된다.
describe('session-parser: queued_command attachments', () => {
  it('renders a queued prompt as a user-message', () => {
    const entries = parseJsonlContent(attachment({ type: 'queued_command', prompt: '패키징 모델 ABC 다시 비교.\nA: 네이티브의 장점' }));
    const users = entries.filter((e) => e.type === 'user-message') as ITimelineUserMessage[];
    expect(users).toHaveLength(1);
    expect(users[0].text).toBe('패키징 모델 ABC 다시 비교.\nA: 네이티브의 장점');
  });

  it('routes a queued <task-notification> to a task-notification, not a user-message', () => {
    const prompt = '<task-notification><task-id>t1</task-id><status>completed</status><summary>done</summary></task-notification>';
    const entries = parseJsonlContent(attachment({ type: 'queued_command', prompt }));
    expect(entries.some((e) => e.type === 'user-message')).toBe(false);
    expect(entries.some((e) => e.type === 'task-notification')).toBe(true);
  });

  it('ignores an empty or whitespace-only queued prompt', () => {
    const entries = parseJsonlContent(attachment({ type: 'queued_command', prompt: '   ' }));
    expect(entries.filter((e) => e.type === 'user-message')).toHaveLength(0);
  });

  it('does not treat other attachment types as prompts', () => {
    const entries = parseJsonlContent(attachment({ type: 'hook_success', hookName: 'PreToolUse:Bash' }));
    expect(entries.filter((e) => e.type === 'user-message')).toHaveLength(0);
  });
});
