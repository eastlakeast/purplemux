import { describe, expect, it } from 'vitest';
import { buildPromptHistoryItems, isInterSessionPrompt } from '@/lib/prompt-history';
import type { IHistoryEntry } from '@/types/message-history';
import type { ITimelineEntry } from '@/types/timeline';

const userHistory: IHistoryEntry[] = [
  { id: 'history-one', message: '버튼 색을 바꿔줘', sentAt: '2026-08-25T01:00:00.000Z' },
  { id: 'history-two', message: '테스트도 실행해줘', sentAt: '2026-08-25T01:01:00.000Z' },
];

describe('prompt history', () => {
  it('keeps only prompts recorded by the user-facing composer and pairs the final response', () => {
    const timeline: ITimelineEntry[] = [
      { id: 'user-one', type: 'user-message', timestamp: 1, text: '버튼 색을 바꿔줘' },
      { id: 'assistant-progress', type: 'assistant-message', timestamp: 2, markdown: '확인하겠습니다.' },
      { id: 'assistant-final', type: 'assistant-message', timestamp: 3, markdown: '**버튼 색상**을 변경했습니다.' },
      { id: 'team-task', type: 'user-message', timestamp: 4, text: '[PURPLEMUX TEAM TASK]\nFrom: leader\n\n테스트해줘' },
      { id: 'assistant-team', type: 'assistant-message', timestamp: 5, markdown: '팀 작업을 마쳤습니다.' },
      { id: 'user-two', type: 'user-message', timestamp: 6, text: '테스트도 실행해줘' },
    ];

    expect(buildPromptHistoryItems(timeline, userHistory)).toEqual([
      {
        entryId: 'user-one',
        prompt: '버튼 색을 바꿔줘',
        response: '버튼 색상을 변경했습니다.',
        timestamp: 1,
      },
      {
        entryId: 'user-two',
        prompt: '테스트도 실행해줘',
        response: null,
        timestamp: 6,
      },
    ]);
  });

  it('recognizes every purplemux inter-session envelope', () => {
    expect(isInterSessionPrompt('[PURPLEMUX TEAM MESSAGE]\nFrom: leader')).toBe(true);
    expect(isInterSessionPrompt('[PURPLEMUX TEAM REPORT]\nFrom: worker')).toBe(true);
    expect(isInterSessionPrompt('[PURPLEMUX TEAM TASK]\nFrom: leader')).toBe(true);
    expect(isInterSessionPrompt('[다른 purplemux 세션의 질문 · 답변 회신 요청]')).toBe(true);
    expect(isInterSessionPrompt('사용자가 직접 쓴 프롬프트')).toBe(false);
  });
});
