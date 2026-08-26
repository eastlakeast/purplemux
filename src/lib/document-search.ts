export interface IDocumentSearchMatch {
  start: number;
  end: number;
}

export const findDocumentSearchMatches = (
  content: string,
  query: string,
): IDocumentSearchMatch[] => {
  const needle = query.trim();
  if (!needle) return [];

  const escapedNeedle = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...content.matchAll(new RegExp(escapedNeedle, 'giu'))].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
};
