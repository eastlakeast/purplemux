import { describe, expect, it } from 'vitest';
import { findDocumentSearchMatches } from '@/lib/document-search';

describe('document search', () => {
  it('finds every case-insensitive match in document order', () => {
    expect(findDocumentSearchMatches('Alpha\nalpha ALPHA', 'alpha')).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
      { start: 12, end: 17 },
    ]);
  });

  it('returns offsets for Korean and Markdown content', () => {
    expect(findDocumentSearchMatches('# 할 일\n- 다음 할 일', '할 일')).toEqual([
      { start: 2, end: 5 },
      { start: 11, end: 14 },
    ]);
  });

  it('ignores an empty or whitespace-only query', () => {
    expect(findDocumentSearchMatches('content', '')).toEqual([]);
    expect(findDocumentSearchMatches('content', '   ')).toEqual([]);
  });

  it('uses non-overlapping matches', () => {
    expect(findDocumentSearchMatches('aaaa', 'aa')).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });

  it('treats regular-expression characters as plain text', () => {
    expect(findDocumentSearchMatches('a+b and A+B', 'a+b')).toEqual([
      { start: 0, end: 3 },
      { start: 8, end: 11 },
    ]);
  });
});
