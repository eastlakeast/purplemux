import type { IAskUserQuestionItem } from '@/types/timeline';

export type TAskSelections = Record<number, number[]>;

/**
 * AskUserQuestion 폼 선택을 터미널 키 시퀀스로 변환한다.
 * 가정: 진입 시 첫 질문·첫 옵션에 포커스가 있고, single은 Enter가 선택+다음 질문 이동,
 * multi는 Space 토글 후 Enter가 다음 질문으로 이동한다. 마지막 질문의 Enter는
 * "Review your answers" 확인 화면으로 넘어가고, 한 번 더 Enter를 눌러야 실제 제출된다.
 */
export const buildKeySequence = (
  questions: IAskUserQuestionItem[],
  selections: TAskSelections,
): string[] => {
  const keys: string[] = [];
  questions.forEach((q, qIdx) => {
    const selected = [...(selections[qIdx] ?? [])].sort((a, b) => a - b);
    if (q.multiSelect) {
      let pos = 0;
      for (const idx of selected) {
        for (let k = 0; k < idx - pos; k += 1) keys.push('Down');
        keys.push('Space');
        pos = idx;
      }
      keys.push('Enter');
    } else {
      const idx = selected[0] ?? 0;
      for (let k = 0; k < idx; k += 1) keys.push('Down');
      keys.push('Enter');
    }
  });
  // 마지막 질문 후 나오는 "Submit answers" 확인 화면을 확정한다.
  keys.push('Enter');
  return keys;
};
