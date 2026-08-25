import { stripMarkdown } from '@/lib/strip-markdown';
import type { IHistoryEntry } from '@/types/message-history';
import type { ITimelineEntry } from '@/types/timeline';

export interface IPromptHistoryItem {
  entryId: string;
  prompt: string;
  response: string | null;
  timestamp: number;
}

const INTER_SESSION_PREFIXES = [
  '[PURPLEMUX TEAM TASK]',
  '[PURPLEMUX TEAM REPORT]',
  '[PURPLEMUX TEAM MESSAGE]',
  '[ROUNDTABLE-PARTICIPANT]',
  '[ROUNDTABLE-REVIEW]',
  '[C2C',
  '[다른 PURPLEMUX 세션',
];

const normalizePrompt = (value: string): string => value.trim().replace(/\r\n/g, '\n');

export const isInterSessionPrompt = (value: string): boolean => {
  const normalized = normalizePrompt(value).toLocaleUpperCase();
  return INTER_SESSION_PREFIXES.some((prefix) => normalized.startsWith(prefix));
};

const matchesUserHistory = (prompt: string, messages: string[]): boolean => {
  const normalized = normalizePrompt(prompt);
  return messages.some((message) =>
    normalized === message
    || normalized.startsWith(`${message}\n`)
    || normalized.endsWith(`\n${message}`),
  );
};

const summarizeResponse = (value: string): string | null => {
  const summary = stripMarkdown(value);
  return summary || null;
};

export const buildPromptHistoryItems = (
  timelineEntries: ITimelineEntry[],
  userHistory: IHistoryEntry[],
): IPromptHistoryItem[] => {
  const messages = userHistory
    .map((entry) => normalizePrompt(entry.message))
    .filter(Boolean);
  if (messages.length === 0) return [];

  const result: IPromptHistoryItem[] = [];
  for (let index = 0; index < timelineEntries.length; index += 1) {
    const entry = timelineEntries[index];
    if (entry.type !== 'user-message' || entry.attachmentPlaceholder) continue;
    if (isInterSessionPrompt(entry.text) || !matchesUserHistory(entry.text, messages)) continue;

    let response: string | null = null;
    for (let cursor = index + 1; cursor < timelineEntries.length; cursor += 1) {
      const candidate = timelineEntries[cursor];
      if (candidate.type === 'user-message') break;
      if (candidate.type === 'assistant-message') {
        response = summarizeResponse(candidate.markdown);
      }
    }

    result.push({
      entryId: entry.id,
      prompt: normalizePrompt(entry.text),
      response,
      timestamp: entry.timestamp,
    });
  }
  return result;
};
