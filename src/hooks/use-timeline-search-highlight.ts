import { useEffect, type RefObject } from 'react';

const ALL_HIGHLIGHT = 'timeline-search';
const CURRENT_HIGHLIGHT = 'timeline-search-current';

interface IUseTimelineSearchHighlightParams {
  scrollRef: RefObject<HTMLElement | null>;
  query: string;
  enabled: boolean;
  currentMatchId: string | null;
  /** 목록/내용 변화 감지용 — 값이 바뀌면 하이라이트를 다시 계산한다 */
  revision: unknown;
}

const isSupported = (): boolean =>
  typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';

const clearHighlights = () => {
  CSS.highlights.delete(ALL_HIGHLIGHT);
  CSS.highlights.delete(CURRENT_HIGHLIGHT);
};

/**
 * 검색어와 일치하는 텍스트를 CSS Custom Highlight API로 강조한다.
 * DOM을 변형하지 않으므로 마크다운·코드 등 어떤 렌더러가 그린 텍스트든 관통한다.
 * 미지원 브라우저에서는 아무것도 하지 않고 카드 단위 강조(ring)로 폴백된다.
 */
export const useTimelineSearchHighlight = ({
  scrollRef,
  query,
  enabled,
  currentMatchId,
  revision,
}: IUseTimelineSearchHighlightParams): void => {
  useEffect(() => {
    if (!isSupported()) return;
    const root = scrollRef.current;
    const needle = query.trim().toLowerCase();
    clearHighlights();
    if (!enabled || !needle || !root) return;

    const currentCard = currentMatchId
      ? root.querySelector(`[data-timeline-item="${CSS.escape(currentMatchId)}"]`)
      : null;

    const all: Range[] = [];
    const current: Range[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.nodeValue;
      if (!text) continue;
      const hay = text.toLowerCase();
      let from = hay.indexOf(needle);
      if (from === -1) continue;
      const inCurrentCard = currentCard?.contains(node) ?? false;
      while (from !== -1) {
        const range = document.createRange();
        range.setStart(node, from);
        range.setEnd(node, from + needle.length);
        all.push(range);
        if (inCurrentCard) current.push(range);
        from = hay.indexOf(needle, from + needle.length);
      }
    }

    if (all.length > 0) CSS.highlights.set(ALL_HIGHLIGHT, new Highlight(...all));
    if (current.length > 0) {
      const highlight = new Highlight(...current);
      highlight.priority = 1;
      CSS.highlights.set(CURRENT_HIGHLIGHT, highlight);
    }

    return clearHighlights;
  }, [scrollRef, query, enabled, currentMatchId, revision]);
};
