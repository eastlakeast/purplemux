import { useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTranslations } from 'next-intl';
import { Terminal, RefreshCw, OctagonX, LogOut, ChevronsUp, MessageSquareMore } from 'lucide-react';
import { diffLines } from 'diff';
import Spinner from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  ITimelineEntry,
  ITimelineExecCommandStream,
  ITimelineMcpToolCall,
  ITimelinePatchApply,
  ITimelineToolCall,
  ITimelineToolResult,
  ITimelineWebSearch,
  ITaskItem,
  IInitMeta,
  ISessionStats,
  TCliState,
  TTimelineConnectionStatus,
} from '@/types/timeline';
import UserMessageItem from '@/components/features/timeline/user-message-item';
import AssistantMessageItem from '@/components/features/timeline/assistant-message-item';
import AgentGroupItem from '@/components/features/timeline/agent-group-item';
import TaskNotificationItem from '@/components/features/timeline/task-notification-item';
import ToolGroupItem from '@/components/features/timeline/tool-group-item';
import TimelineSelectionCopy from '@/components/features/timeline/timeline-selection-copy';
import PlanItem from '@/components/features/timeline/plan-item';
import AskUserQuestionItem from '@/components/features/timeline/ask-user-question-item';
import TaskChecklist from '@/components/features/timeline/task-checklist';
import TaskProgressItem from '@/components/features/timeline/task-progress-item';
import ScrollToBottomButton from '@/components/features/timeline/scroll-to-bottom-button';
import PermissionPromptItem from '@/components/features/timeline/permission-prompt-item';
import ApprovalRequestItem from '@/components/features/timeline/approval-request-item';
import ExecCommandStreamItem from '@/components/features/timeline/exec-command-stream-item';
import WebSearchItem from '@/components/features/timeline/web-search-item';
import McpToolCallItem from '@/components/features/timeline/mcp-tool-call-item';
import PatchApplyItem from '@/components/features/timeline/patch-apply-item';
import ContextCompactedItem from '@/components/features/timeline/context-compacted-item';
import ErrorNoticeItem from '@/components/features/timeline/error-notice-item';
import TimelineSearchBar from '@/components/features/timeline/timeline-search-bar';
import useTabStore from '@/hooks/use-tab-store';
import { getEntryText } from '@/lib/timeline-entry-text';
import { firstMatchRange } from '@/lib/timeline-search-dom';
import { useTimelineSearchHighlight } from '@/hooks/use-timeline-search-highlight';
import { reloadForReconnectRecovery, shouldPromptMobileReloadRecovery } from '@/lib/ws-reload-recovery';
import {
  captureTimelinePrependScroll,
  createTimelineScrollAnchorId,
  releaseTimelinePrependScroll,
  restoreTimelinePrependScroll,
  type ITimelinePrependScrollSnapshot,
} from '@/lib/timeline-scroll-anchor';

interface ITimelineViewProps {
  entries: ITimelineEntry[];
  tasks: ITaskItem[];
  sessionId: string | null;
  sessionName?: string;
  tabId?: string;
  initMeta?: IInitMeta;
  sessionStats?: ISessionStats | null;
  cliState: TCliState;
  compactingSince?: number | null;
  wsStatus: TTimelineConnectionStatus;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onLoadMore: () => Promise<void>;
  hasMore: boolean;
  scrollToBottomRef?: React.MutableRefObject<(() => void) | undefined>;
  active?: boolean;
}

const RESUME_TOKEN_THRESHOLD = 100_000;
const RESUME_IDLE_MINUTES = 70;
const OVERFLOW_SENTINEL_MARGIN_PX = 4;

const ElapsedTime = ({ since }: { since: number }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - since) / 1000)));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [since]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return <span className="tabular-nums">{mm}:{ss}</span>;
};

type TGroupedItem =
  | { type: 'entry'; id: string; entry: ITimelineEntry }
  | { type: 'tool-group'; id: string; toolCalls: ITimelineToolCall[]; toolResults: ITimelineToolResult[] };

type TAdaptedToolGroupEntry = {
  calls: ITimelineToolCall[];
  results: ITimelineToolResult[];
};

const summarizeToolOutput = (output: string): string => {
  const trimmed = output.trim();
  if (!trimmed) return '';
  const lines = trimmed.split('\n');
  return lines.length > 1 ? `${lines.length} lines` : trimmed.slice(0, 100);
};

const pluralize = (count: number, singular: string, plural: string): string =>
  `${count} ${count === 1 ? singular : plural}`;

const toAdaptedToolGroupEntry = (
  call: ITimelineToolCall,
  result?: ITimelineToolResult,
): TAdaptedToolGroupEntry => ({
  calls: [call],
  results: result ? [result] : [],
});

const adaptExecCommandToToolGroup = (
  entry: ITimelineExecCommandStream,
): TAdaptedToolGroupEntry => {
  const command = entry.parsedCommand ?? entry.command;
  const outputSummary = summarizeToolOutput(entry.status === 'error' ? entry.stderr || entry.stdout : entry.stdout);
  const lineCountMatch = outputSummary.match(/^(\d+) lines$/);
  const summary = entry.status === 'success' && lineCountMatch
    ? `$ ${command} → ${lineCountMatch[1]} lines`
    : `$ ${command}`;

  return toAdaptedToolGroupEntry(
    {
      id: entry.id,
      type: 'tool-call',
      timestamp: entry.timestamp,
      toolUseId: entry.callId,
      toolName: 'Bash',
      summary,
      status: entry.status,
    },
    outputSummary && !lineCountMatch
      ? {
          id: `${entry.id}:result`,
          type: 'tool-result',
          timestamp: entry.timestamp,
          toolUseId: entry.callId,
          isError: entry.status === 'error',
          summary: outputSummary,
        }
      : undefined,
  );
};

const adaptWebSearchToToolGroup = (
  entry: ITimelineWebSearch,
): TAdaptedToolGroupEntry => {
  const resultSummary = entry.resultsSummary
    ?? (entry.resultCount != null ? `${entry.resultCount} results` : '');

  return toAdaptedToolGroupEntry(
    {
      id: entry.id,
      type: 'tool-call',
      timestamp: entry.timestamp,
      toolUseId: entry.callId,
      toolName: 'WebSearch',
      summary: entry.query ? `WebSearch "${entry.query}"` : 'WebSearch',
      status: entry.status,
    },
    resultSummary
      ? {
          id: `${entry.id}:result`,
          type: 'tool-result',
          timestamp: entry.timestamp,
          toolUseId: entry.callId,
          isError: entry.status === 'error',
          summary: resultSummary,
        }
      : undefined,
  );
};

const adaptMcpToolToToolGroup = (
  entry: ITimelineMcpToolCall,
): TAdaptedToolGroupEntry => toAdaptedToolGroupEntry(
  {
    id: entry.id,
    type: 'tool-call',
    timestamp: entry.timestamp,
    toolUseId: entry.callId,
    toolName: 'MCP',
    summary: `MCP ${entry.server || '?'}/${entry.tool || '?'}`,
    status: entry.status,
  },
  entry.resultSummary
    ? {
        id: `${entry.id}:result`,
        type: 'tool-result',
        timestamp: entry.timestamp,
        toolUseId: entry.callId,
        isError: entry.status === 'error',
        summary: entry.resultSummary,
      }
    : undefined,
);

interface IParsedPatchDiff {
  filePath: string;
  status: string;
  oldString: string;
  newString: string;
  added: number;
  removed: number;
}

const PATCH_FILE_HEADER_RE = /^\*\*\*\s+(Add|Update|Delete)\s+File:\s+(.+?)\s*$/i;
const PATCH_MOVE_TO_RE = /^\*\*\*\s+Move to:\s+(.+?)\s*$/i;

const countDiffLines = (oldStr: string, newStr: string): { added: number; removed: number } => {
  let added = 0;
  let removed = 0;
  for (const change of diffLines(oldStr, newStr)) {
    const count = change.count ?? 0;
    if (change.added) added += count;
    else if (change.removed) removed += count;
  }
  return { added, removed };
};

const parsePatchDiffs = (diff?: string): IParsedPatchDiff[] => {
  if (!diff) return [];

  const parsed: Array<{
    filePath: string;
    status: string;
    oldLines: string[];
    newLines: string[];
    added: number;
    removed: number;
  }> = [];
  let current: (typeof parsed)[number] | null = null;

  const pushCurrent = () => {
    if (!current) return;
    if (current.oldLines.length > 0 || current.newLines.length > 0 || current.added > 0 || current.removed > 0) {
      parsed.push(current);
    }
    current = null;
  };

  for (const line of diff.split('\n')) {
    const header = line.match(PATCH_FILE_HEADER_RE);
    if (header) {
      pushCurrent();
      current = {
        status: header[1].toLowerCase(),
        filePath: header[2],
        oldLines: [],
        newLines: [],
        added: 0,
        removed: 0,
      };
      continue;
    }

    if (!current) continue;

    const moveTo = line.match(PATCH_MOVE_TO_RE);
    if (moveTo) {
      current.filePath = moveTo[1];
      continue;
    }

    if (line.startsWith('@@') || line.startsWith('***')) continue;

    const marker = line[0];
    const value = line.slice(1);
    if (marker === '+') {
      current.newLines.push(value);
      current.added += 1;
    } else if (marker === '-') {
      current.oldLines.push(value);
      current.removed += 1;
    } else if (marker === ' ') {
      current.oldLines.push(value);
      current.newLines.push(value);
    }
  }

  pushCurrent();

  return parsed.map((item) => {
    const oldString = item.oldLines.join('\n');
    const newString = item.newLines.join('\n');
    const { added, removed } = countDiffLines(oldString, newString);
    return {
      filePath: item.filePath,
      status: item.status,
      oldString,
      newString,
      added,
      removed,
    };
  });
};

const patchVerbForStatus = (status: string): string => {
  const s = status.toLowerCase();
  if (s.includes('add') || s.includes('create')) return 'Create';
  if (s.includes('delete') || s.includes('remove')) return 'Delete';
  return 'Update';
};

const adaptPatchApplyToToolGroup = (
  entry: ITimelinePatchApply,
): TAdaptedToolGroupEntry | null => {
  const patchDiffs = parsePatchDiffs(entry.diff);
  if (patchDiffs.length > 0) {
    return {
      calls: patchDiffs.map((patchDiff, idx) => ({
        id: `${entry.id}:${idx}`,
        type: 'tool-call',
        timestamp: entry.timestamp,
        toolUseId: `${entry.callId}:${idx}`,
        toolName: 'Edit',
        summary: `${patchVerbForStatus(patchDiff.status)} ${patchDiff.filePath} (+${patchDiff.added}, -${patchDiff.removed})`,
        filePath: patchDiff.filePath,
        diff: {
          filePath: patchDiff.filePath,
          oldString: patchDiff.oldString,
          newString: patchDiff.newString,
        },
        status: entry.status,
      })),
      results: [],
    };
  }

  const fileCount = entry.files.length;
  if (fileCount === 0 && entry.status === 'success') return { calls: [], results: [] };

  const fileLabel = fileCount === 0
    ? 'files'
    : fileCount === 1
      ? entry.files[0].path
      : pluralize(fileCount, 'file', 'files');

  return toAdaptedToolGroupEntry({
    id: entry.id,
    type: 'tool-call',
    timestamp: entry.timestamp,
    toolUseId: entry.callId,
    toolName: 'Edit',
    summary: `Patch ${fileLabel}`,
    status: entry.status,
  });
};

const adaptToToolGroupEntry = (
  entry: ITimelineEntry,
): TAdaptedToolGroupEntry | null => {
  switch (entry.type) {
    case 'exec-command-stream':
      return adaptExecCommandToToolGroup(entry);
    case 'web-search':
      return adaptWebSearchToToolGroup(entry);
    case 'mcp-tool-call':
      return adaptMcpToolToToolGroup(entry);
    case 'patch-apply':
      return adaptPatchApplyToToolGroup(entry);
    default:
      return null;
  }
};

const groupTimelineEntries = (entries: ITimelineEntry[]): TGroupedItem[] => {
  const result: TGroupedItem[] = [];
  let toolCallBuffer: ITimelineToolCall[] = [];
  let toolResultBuffer: ITimelineToolResult[] = [];

  const flushToolBuffer = () => {
    if (toolCallBuffer.length > 0) {
      result.push({
        type: 'tool-group',
        id: toolCallBuffer[0].id,
        toolCalls: [...toolCallBuffer],
        toolResults: [...toolResultBuffer],
      });
      toolCallBuffer = [];
      toolResultBuffer = [];
    }
  };

  for (const entry of entries) {
    if (entry.type === 'tool-call') {
      toolCallBuffer.push(entry);
    } else if (entry.type === 'tool-result') {
      toolResultBuffer.push(entry);
    } else {
      const adapted = adaptToToolGroupEntry(entry);
      if (adapted) {
        toolCallBuffer.push(...adapted.calls);
        toolResultBuffer.push(...adapted.results);
        continue;
      }
      flushToolBuffer();
      result.push({ type: 'entry', id: entry.id, entry });
    }
  }

  flushToolBuffer();
  return result;
};

const getTimelineScrollAnchorId = (item: TGroupedItem): string => {
  if (item.type === 'tool-group') {
    const anchor = item.toolCalls[item.toolCalls.length - 1];
    return createTimelineScrollAnchorId(
      'tool-group',
      anchor?.timestamp,
      anchor?.toolUseId,
      anchor?.toolName,
      anchor?.summary,
    );
  }

  return createTimelineScrollAnchorId(
    item.entry.type,
    item.entry.timestamp,
    getEntryText(item.entry),
  );
};

const InterruptItem = () => {
  const t = useTranslations('timeline');
  return (
    <div className="flex items-center justify-end gap-1.5 py-1 text-xs text-muted-foreground/60">
      <OctagonX size={12} />
      <span>{t('requestCancelled')}</span>
    </div>
  );
};

const SessionExitItem = () => {
  const t = useTranslations('timeline');
  return (
    <div className="flex items-center justify-end gap-1.5 py-1 text-xs text-muted-foreground/60">
      <LogOut size={12} />
      <span>{t('sessionExit')}</span>
    </div>
  );
};

const TimelineEntryRenderer = ({ entry, sessionName }: { entry: ITimelineEntry; sessionName?: string }) => {
  switch (entry.type) {
    case 'user-message':
      return <UserMessageItem entry={entry} />;
    case 'assistant-message':
      return <AssistantMessageItem entry={entry} />;
    case 'agent-group':
      return <AgentGroupItem entry={entry} />;
    case 'task-notification':
      return <TaskNotificationItem entry={entry} />;
    case 'plan':
      return <PlanItem entry={entry} sessionName={sessionName} />;
    case 'ask-user-question':
      return <AskUserQuestionItem entry={entry} sessionName={sessionName} />;
    case 'task-progress':
      return <TaskProgressItem entry={entry} />;
    case 'interrupt':
      return <InterruptItem />;
    case 'session-exit':
      return <SessionExitItem />;
    case 'approval-request':
      return <ApprovalRequestItem entry={entry} />;
    case 'exec-command-stream':
      return <ExecCommandStreamItem entry={entry} />;
    case 'web-search':
      return <WebSearchItem entry={entry} />;
    case 'mcp-tool-call':
      return <McpToolCallItem entry={entry} />;
    case 'patch-apply':
      return <PatchApplyItem entry={entry} />;
    case 'context-compacted':
      return <ContextCompactedItem entry={entry} />;
    case 'reasoning-summary':
      return null;
    case 'error-notice':
      return <ErrorNoticeItem entry={entry} />;
    default:
      return null;
  }
};

const SkeletonLoader = () => (
  <div className="mx-auto max-w-content">
    <div className="animate-delayed-fade-in flex flex-col gap-4 p-4">
      {[48, 36, 40].map((w, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="h-4 animate-pulse rounded bg-claude-active/20" style={{ width: `${w}%` }} />
          <div className="h-4 animate-pulse rounded bg-claude-active/20" style={{ width: `${w - 10}%` }} />
        </div>
      ))}
    </div>
  </div>
);

const ErrorState = ({ error, onRetry, showRefresh }: { error: string; onRetry: () => void; showRefresh?: boolean }) => {
  const t = useTranslations('timeline');
  const tc = useTranslations('common');
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <Terminal size={32} className="opacity-40" />
      <div className="text-center">
        <p className="text-sm font-medium">{t('connectionError')}</p>
        <p className="mt-1 text-xs">{error}</p>
      </div>
      <Button variant="outline" size="xs" onClick={onRetry}>
        <RefreshCw size={12} />
        {tc('retry')}
      </Button>
      {showRefresh && (
        <Button variant="ghost" size="xs" onClick={() => reloadForReconnectRecovery('timeline')}>
          <RefreshCw size={12} />
          {tc('refresh')}
        </Button>
      )}
    </div>
  );
};

const ReconnectBanner = () => {
  const t = useTranslations('timeline');
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground shadow-sm">
        <Spinner size={10} />
        {t('reconnecting')}
      </div>
    </div>
  );
};

const DisconnectedBanner = ({ onRetry }: { onRetry: () => void }) => {
  const t = useTranslations('timeline');
  const tc = useTranslations('common');
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground shadow-sm">
        <span>{t('connectionFailed')}</span>
        <Button variant="outline" size="xs" className="h-5 rounded-full px-2 text-xs" onClick={onRetry}>
          {tc('retry')}
        </Button>
      </div>
    </div>
  );
};

const EmptyState = () => {
  const t = useTranslations('timeline');

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <MessageSquareMore size={32} className="opacity-40" />
      <p className="text-xs">{t('emptyRunning')}</p>
    </div>
  );
};

const TimelineView = ({
  entries,
  tasks,
  sessionId,
  sessionName,
  tabId,
  initMeta,
  sessionStats,
  cliState,
  compactingSince,
  wsStatus,
  isLoading,
  error,
  onRetry,
  onLoadMore,
  hasMore,
  scrollToBottomRef,
  active = true,
}: ITimelineViewProps) => {
  const t = useTranslations('timeline');
  const needsInput = cliState === 'needs-input';
  // 대기 중 AskUserQuestion은 전용 카드(AskUserQuestionItem)가 담당하므로 permission 카드를 중복 노출하지 않는다
  const hasPendingAskQuestion = useMemo(
    () => entries.some((e) => e.type === 'ask-user-question' && e.status === 'pending'),
    [entries],
  );
  // plan mode 대기 중엔 tool_use가 JSONL에 없으므로, hook으로 받은 라이브 질문으로 폼을 렌더한다
  const pendingQuestions = useTabStore((s) => (tabId ? s.tabs[tabId]?.pendingQuestions : undefined));
  const isCompacting = compactingSince != null && Date.now() - compactingSince < 60_000;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const isLoadingMoreRef = useRef(false);
  const prependScrollAnchorRef = useRef<ITimelinePrependScrollSnapshot | null>(null);
  const prependReleaseFrameRef = useRef(0);
  const [skipAnimation, setSkipAnimation] = useState(true);
  const [prevSessionId, setPrevSessionId] = useState(sessionId);
  const [hasOverflowBelow, setHasOverflowBelow] = useState(false);

  const clearPrependScrollAnchor = useCallback(() => {
    cancelAnimationFrame(prependReleaseFrameRef.current);
    if (prependScrollAnchorRef.current) {
      releaseTimelinePrependScroll(prependScrollAnchorRef.current);
      prependScrollAnchorRef.current = null;
    }
  }, []);

  const scrollToBottom = useCallback((behavior: 'instant' | 'smooth' = 'instant') => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    if (behavior === 'smooth') {
      scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' });
    } else {
      scrollEl.scrollTop = scrollEl.scrollHeight;
    }
  }, []);

  const updateHasOverflowBelow = useCallback((value: boolean) => {
    setHasOverflowBelow(value);
  }, []);

  const syncOverflowState = useCallback(() => {
    const scrollEl = scrollRef.current;
    const sentinel = bottomSentinelRef.current;
    if (!scrollEl || !sentinel) return;
    const rootBottom = scrollEl.getBoundingClientRect().bottom;
    const sentinelTop = sentinel.getBoundingClientRect().top;
    updateHasOverflowBelow(sentinelTop >= rootBottom + OVERFLOW_SENTINEL_MARGIN_PX);
  }, [updateHasOverflowBelow]);

  const hasPendingUserMessage = entries.some((entry) => entry.type === 'user-message' && entry.pending === true);

  if (prevSessionId !== sessionId) {
    setPrevSessionId(sessionId);
    if (!hasPendingUserMessage) {
      setSkipAnimation(true);
    }
  }

  useEffect(() => {
    if (!scrollToBottomRef) return;
    scrollToBottomRef.current = () => {
      if (!hasOverflowBelow) scrollToBottom('smooth');
    };
    return () => { scrollToBottomRef.current = undefined; };
  }, [hasOverflowBelow, scrollToBottomRef, scrollToBottom]);

  useEffect(() => {
    updateHasOverflowBelow(false);
    scrollToBottom('instant');
  }, [sessionId, scrollToBottom, updateHasOverflowBelow]);

  const groupedItems = useMemo(() => groupTimelineEntries(entries), [entries]);
  const hasDisplayItems = groupedItems.length > 0;

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const matchIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [] as string[];
    return groupedItems
      .filter((item) => {
        const text = item.type === 'tool-group'
          ? [...item.toolCalls, ...item.toolResults].map(getEntryText).join(' ')
          : getEntryText(item.entry);
        return text.toLowerCase().includes(q);
      })
      .map((item) => item.id);
  }, [groupedItems, searchQuery]);

  const currentMatchId = matchIds[matchIndex] ?? null;

  const handleSearchQueryChange = useCallback((value: string) => {
    setSearchQuery(value);
    setMatchIndex(0);
  }, []);

  const nextMatch = useCallback(() => {
    setMatchIndex((i) => (matchIds.length === 0 ? 0 : (i + 1) % matchIds.length));
  }, [matchIds.length]);

  const prevMatch = useCallback(() => {
    setMatchIndex((i) => (matchIds.length === 0 ? 0 : (i - 1 + matchIds.length) % matchIds.length));
  }, [matchIds.length]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setMatchIndex(0);
  }, []);

  useHotkeys(
    'mod+f',
    () => {
      setSearchOpen(true);
      requestAnimationFrame(() => searchInputRef.current?.select());
    },
    { enableOnFormTags: true, preventDefault: true, enabled: active },
  );

  useEffect(() => {
    if (!active && searchOpen) closeSearch();
  }, [active, searchOpen, closeSearch]);

  useEffect(() => {
    if (!searchOpen || !currentMatchId) return;
    const root = scrollRef.current;
    const card = root?.querySelector(`[data-timeline-item="${CSS.escape(currentMatchId)}"]`);
    if (!root || !(card instanceof HTMLElement)) return;
    // 카드가 아니라 카드 안 첫 매치 키워드를 뷰 중앙으로 올려 눈이 바로 단어에 닿게 한다
    const needle = searchQuery.trim().toLowerCase();
    const range = needle ? firstMatchRange(card, needle) : null;
    const rect = range?.getBoundingClientRect();
    if (rect && rect.height > 0) {
      const rootRect = root.getBoundingClientRect();
      const target = rect.top - rootRect.top + root.scrollTop - root.clientHeight / 2;
      root.scrollTop = Math.max(0, target);
    } else {
      card.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  }, [currentMatchId, searchOpen, searchQuery]);

  useTimelineSearchHighlight({
    scrollRef,
    query: searchQuery,
    enabled: searchOpen && active,
    currentMatchId,
    revision: groupedItems,
  });

  const [shouldProbeResumeDialog, setShouldProbeResumeDialog] = useState(false);
  const currentContextTokens = sessionStats?.currentContextTokens ?? 0;
  const resumeProbeDepsKey = `${cliState}:${currentContextTokens}:${initMeta?.lastTimestamp ?? 0}:${sessionName ?? ''}`;

  useEffect(() => {
    if (cliState !== 'idle' || !initMeta || !sessionName
      || currentContextTokens < RESUME_TOKEN_THRESHOLD
      || !initMeta.lastTimestamp) {
      setShouldProbeResumeDialog(false);
      return;
    }

    const check = () => {
      const idleMinutes = (Date.now() - initMeta.lastTimestamp) / 60_000;
      setShouldProbeResumeDialog(idleMinutes >= RESUME_IDLE_MINUTES);
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeProbeDepsKey]);

  useEffect(() => {
    if (skipAnimation && entries.length > 0) {
      scrollToBottom('instant');
      requestAnimationFrame(() => setSkipAnimation(false));
    }
  }, [skipAnimation, entries.length, scrollToBottom]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    const contentEl = contentRef.current;
    if (!scrollEl || !contentEl || !active) return;
    let frame = 0;
    const pinToBottom = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!prependScrollAnchorRef.current && !hasOverflowBelow) {
          scrollToBottom('instant');
        }
        syncOverflowState();
      });
    };
    const ro = new ResizeObserver(pinToBottom);
    ro.observe(scrollEl);
    ro.observe(contentEl);
    pinToBottom();
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [active, hasOverflowBelow, scrollToBottom, syncOverflowState]);

  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === 'hidden') return;
      if (!hasOverflowBelow) scrollToBottom('instant');
    };

    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', handleVisible);
    window.addEventListener('pageshow', handleVisible);
    return () => {
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', handleVisible);
      window.removeEventListener('pageshow', handleVisible);
    };
  }, [hasOverflowBelow, scrollToBottom]);

  const handleScrollToBottom = useCallback(() => {
    clearPrependScrollAnchor();
    updateHasOverflowBelow(false);
    scrollToBottom('smooth');
  }, [clearPrependScrollAnchor, scrollToBottom, updateHasOverflowBelow]);

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const triggerLoadMore = useCallback(() => {
    if (!hasMore || isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    const scrollEl = scrollRef.current;
    if (scrollEl) {
      clearPrependScrollAnchor();
      prependScrollAnchorRef.current = captureTimelinePrependScroll(scrollEl);
    }
    setIsLoadingMore(true);

    onLoadMore().finally(() => {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    });
  }, [clearPrependScrollAnchor, hasMore, onLoadMore, scrollRef]);

  useLayoutEffect(() => {
    const anchor = prependScrollAnchorRef.current;
    if (!anchor) return;

    restoreTimelinePrependScroll(anchor);
    syncOverflowState();
    if (isLoadingMore) return;

    cancelAnimationFrame(prependReleaseFrameRef.current);
    prependReleaseFrameRef.current = requestAnimationFrame(() => {
      if (prependScrollAnchorRef.current !== anchor) return;
      restoreTimelinePrependScroll(anchor);
      syncOverflowState();
      clearPrependScrollAnchor();
    });
  }, [clearPrependScrollAnchor, groupedItems, isLoadingMore, syncOverflowState]);

  useEffect(() => clearPrependScrollAnchor, [clearPrependScrollAnchor, sessionId]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          triggerLoadMore();
        }
      },
      { root, rootMargin: '200px 0px 0px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [scrollRef, triggerLoadMore]);

  if (isLoading && wsStatus === 'disconnected') {
    return (
      <ErrorState
        error={t('connectionFailed')}
        onRetry={onRetry}
        showRefresh={shouldPromptMobileReloadRecovery()}
      />
    );
  }

  if (isLoading) {
    return <SkeletonLoader />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }

  if (!hasDisplayItems) {
    return <EmptyState />;
  }

  const isReconnecting = wsStatus === 'reconnecting';
  const isDisconnected = wsStatus === 'disconnected';

  return (
    <div className="relative flex h-full flex-col">
      {searchOpen && (
        <TimelineSearchBar
          query={searchQuery}
          onQueryChange={handleSearchQueryChange}
          matchCount={matchIds.length}
          currentIndex={matchIndex}
          onNext={nextMatch}
          onPrev={prevMatch}
          onClose={closeSearch}
          inputRef={searchInputRef}
        />
      )}
      <TimelineSelectionCopy scrollRef={scrollRef} />
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto py-2 transition-opacity"
        style={{
          opacity: skipAnimation ? 0 : 1,
          transitionDuration: '300ms',
        }}
        tabIndex={0}
        role="log"
        aria-label={t('timelineAria')}
        onScroll={syncOverflowState}
      >
        <div ref={contentRef} className="mx-auto max-w-content">
          {hasMore && <div ref={sentinelRef} className="h-px" />}
          {hasMore && !isLoadingMore && (
            <div className="flex justify-center py-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={triggerLoadMore}>
                <ChevronsUp size={12} className="mr-1" />
                {t('loadMore')}
              </Button>
            </div>
          )}
          {isLoadingMore && (
            <div className="flex flex-col gap-3 px-4 py-3">
              {[44, 32, 48].map((w, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <div className="h-3.5 animate-pulse rounded bg-muted/60" style={{ width: `${w}%` }} />
                  <div className="h-3.5 animate-pulse rounded bg-muted/60" style={{ width: `${w - 12}%` }} />
                </div>
              ))}
            </div>
          )}
          {tasks.length > 0 && (
            <TaskChecklist tasks={tasks} cliState={cliState} />
          )}
          {groupedItems.map((item) => (
            <div
              key={item.id}
              data-timeline-item={item.id}
              data-timeline-scroll-anchor={getTimelineScrollAnchorId(item)}
              className={cn(
                'px-4 py-1.5',
                searchOpen && item.id === currentMatchId && 'rounded-md bg-claude-active/5 ring-2 ring-claude-active/40',
              )}
            >
              {item.type === 'tool-group' ? (
                <ToolGroupItem toolCalls={item.toolCalls} toolResults={item.toolResults} />
              ) : (
                <TimelineEntryRenderer entry={item.entry} sessionName={sessionName} />
              )}
            </div>
          ))}
          {needsInput && pendingQuestions && pendingQuestions.length > 0 && !hasPendingAskQuestion && sessionName && (
            <div className="px-4 py-1.5">
              <AskUserQuestionItem
                entry={{
                  id: 'live-ask',
                  type: 'ask-user-question',
                  timestamp: Date.now(),
                  toolUseId: 'live',
                  questions: pendingQuestions,
                  status: 'pending',
                }}
                sessionName={sessionName}
              />
            </div>
          )}
          {(shouldProbeResumeDialog || (needsInput && !hasPendingAskQuestion && !pendingQuestions?.length)) && sessionName && (
            <div className="px-4 py-1.5">
              <PermissionPromptItem
                sessionName={sessionName}
                tabId={tabId}
                silent={shouldProbeResumeDialog && !needsInput}
              />
            </div>
          )}
          {cliState === 'busy' && !needsInput && (
            <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
              <Spinner size={10} className="text-claude-active" />
              <ElapsedTime since={entries[entries.length - 1].timestamp} />
            </div>
          )}
          {isCompacting && (
            <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
              <Spinner size={10} className="text-claude-active" />
              <span>{t('contextCompacting')}</span>
            </div>
          )}
          <div ref={bottomSentinelRef} aria-hidden style={{ height: 0, overflowAnchor: 'none' }} />
        </div>
      </div>
      {isReconnecting && <ReconnectBanner />}
      {isDisconnected && <DisconnectedBanner onRetry={onRetry} />}
      <ScrollToBottomButton
        visible={hasOverflowBelow}
        onClick={handleScrollToBottom}
      />
    </div>
  );
};

export default TimelineView;
