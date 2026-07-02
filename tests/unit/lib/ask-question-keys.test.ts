import { describe, expect, it } from 'vitest';

import { buildKeySequence } from '@/lib/ask-question-keys';
import type { IAskUserQuestionItem } from '@/types/timeline';

const q = (header: string, optionCount: number, multiSelect = false): IAskUserQuestionItem => ({
  header,
  question: header,
  multiSelect,
  options: Array.from({ length: optionCount }, (_, i) => ({ label: `opt${i}`, description: '' })),
});

// 시퀀스 끝의 추가 Enter는 "Submit answers" 확인 화면 확정용이다.
describe('buildKeySequence', () => {
  it('single-select: 옵션 인덱스만큼 Down, Enter, 그리고 최종 제출 Enter', () => {
    expect(buildKeySequence([q('A', 3)], { 0: [1] })).toEqual(['Down', 'Enter', 'Enter']);
  });

  it('single-select 첫 옵션은 Down 없이 Enter + 제출 Enter', () => {
    expect(buildKeySequence([q('A', 3)], { 0: [0] })).toEqual(['Enter', 'Enter']);
  });

  it('다중 질문은 각 질문을 Enter로 넘기고 끝에 제출 Enter', () => {
    const keys = buildKeySequence([q('A', 3), q('B', 3), q('C', 3)], { 0: [0], 1: [2], 2: [1] });
    expect(keys).toEqual(['Enter', 'Down', 'Down', 'Enter', 'Down', 'Enter', 'Enter']);
  });

  it('multi-select: 선택마다 이동 후 Space, 질문 Enter, 제출 Enter', () => {
    const keys = buildKeySequence([q('M', 4, true)], { 0: [0, 2] });
    expect(keys).toEqual(['Space', 'Down', 'Down', 'Space', 'Enter', 'Enter']);
  });

  it('multi-select 선택은 정렬되어 상대 이동만 발생', () => {
    const keys = buildKeySequence([q('M', 4, true)], { 0: [3, 1] });
    expect(keys).toEqual(['Down', 'Space', 'Down', 'Down', 'Space', 'Enter', 'Enter']);
  });

  it('미선택 질문은 첫 옵션(Enter) + 제출 Enter', () => {
    expect(buildKeySequence([q('A', 3)], {})).toEqual(['Enter', 'Enter']);
  });
});
