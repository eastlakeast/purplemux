import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import Spinner from '@/components/ui/spinner';
import OpenAIIcon from '@/components/icons/openai-icon';
import useTabStore, { selectSessionView } from '@/hooks/use-tab-store';
import useTimeline from '@/hooks/use-timeline';
import { useCodexSessions } from '@/hooks/use-codex-sessions';
import useSessionMeta from '@/hooks/use-session-meta';
import useGitBranch from '@/hooks/use-git-branch';
import useGitStatus from '@/hooks/use-git-status';
import useTmuxInfo from '@/hooks/use-tmux-info';
import useMessageCounts from '@/hooks/use-message-counts';
import CodexBootProgress from '@/components/features/workspace/codex-boot-progress';
import CodexUpdatePromptCard from '@/components/features/workspace/codex-update-prompt-card';
import TrustPromptCard from '@/components/features/workspace/trust-prompt-card';
import TimelineView from '@/components/features/timeline/timeline-view';
import WebInputBar from '@/components/features/workspace/web-input-bar';
import QuickPromptBar from '@/components/features/workspace/quick-prompt-bar';
import useQuickPrompts from '@/hooks/use-quick-prompts';
import { MetaCompact } from '@/components/features/workspace/session-meta-content';
import MobileMetaSheet from './mobile-meta-sheet';
import CodexSessionListView from '@/components/features/workspace/codex-session-list-view';
import type { ICodexSessionEntry } from '@/lib/codex-session-list';
import type { ICodexUpdatePromptInfo, TCodexUpdateAnswer } from '@/lib/codex-update-prompt-detector';
import type { ITrustPromptInfo, TTrustAnswer } from '@/lib/trust-prompt-detector';

const CODEX_BOOT_CHECK_INTERVAL_MS = 800;

interface IMobileCodexPanelProps {
  tabId?: string;
  wsId?: string;
  sessionName?: string;
  cwd?: string;
  sendStdin: (data: string) => void;
  terminalWsConnected: boolean;
  focusTerminal: () => void;
  focusInputRef: React.MutableRefObject<(() => void) | undefined>;
  setInputValueRef: React.MutableRefObject<((v: React.SetStateAction<string>) => void) | undefined>;
  onNewSession?: () => void;
  onRestart?: () => void;
  updatePrompt?: ICodexUpdatePromptInfo | null;
  onUpdatePromptResponse?: (answer: TCodexUpdateAnswer) => void;
  trustPrompt?: ITrustPromptInfo | null;
  onTrustResponse?: (answer: TTrustAnswer) => void;
}

const MobileCodexPanel = ({
  tabId,
  wsId,
  sessionName,
  cwd,
  sendStdin,
  terminalWsConnected,
  focusTerminal,
  focusInputRef,
  setInputValueRef,
  onNewSession,
  onRestart,
  updatePrompt,
  onUpdatePromptResponse,
  trustPrompt,
  onTrustResponse,
}: IMobileCodexPanelProps) => {
  const t = useTranslations('terminal');
  const agentProcess = useTabStore((s) => (tabId ? s.tabs[tabId]?.agentProcess ?? null : null));
  const agentInstalled = useTabStore((s) => (tabId ? s.tabs[tabId]?.agentInstalled ?? true : true));
  const cliState = useTabStore((s) => (tabId ? s.tabs[tabId]?.cliState ?? 'inactive' : 'inactive'));
  const compactingSince = useTabStore((s) => (tabId ? s.tabs[tabId]?.compactingSince ?? null : null));
  const codexSessionId = useTabStore((s) => (tabId ? s.tabs[tabId]?.agentSessionId ?? null : null));
  const tabAgentSummary = useTabStore((s) => (tabId ? s.tabs[tabId]?.agentSummary ?? null : null));
  const tabLastUserMessage = useTabStore((s) => (tabId ? s.tabs[tabId]?.lastUserMessage ?? null : null));
  const view = useTabStore((s) => (tabId ? selectSessionView(s.tabs, tabId) : 'session-list' as const));
  const [metaSheetOpen, setMetaSheetOpen] = useState(false);
  const [resumingSessionId, setResumingSessionId] = useState<string | null>(null);
  const scrollToBottomRef = useRef<(() => void) | undefined>(undefined);
  const { prompts: quickPrompts } = useQuickPrompts();

  const handleStart = useCallback(() => onNewSession?.(), [onNewSession]);
  const handleScrollToBottom = useCallback(() => {
    if (cliState !== 'idle') return;
    scrollToBottomRef.current?.();
  }, [cliState]);
  const handleSelectQuickPrompt = useCallback((prompt: string) => {
    setInputValueRef.current?.(prompt);
    focusInputRef.current?.();
  }, [setInputValueRef, focusInputRef]);
  const handleResumeStarted = useCallback(() => {
    setResumingSessionId(null);
  }, []);
  const handleResumeBlocked = useCallback(
    (payload: { reason: string; processName?: string }) => {
      setResumingSessionId(null);
      toast.warning(t('resumeBlocked'), {
        description: payload.processName
          ? t('resumeBlockedProcess', { name: payload.processName })
          : undefined,
      });
    },
    [t],
  );
  const handleResumeError = useCallback(() => {
    setResumingSessionId(null);
    toast.error(t('codexResumeFailed'));
  }, [t]);

  const {
    entries,
    tasks,
    sessionId,
    jsonlPath,
    sessionSummary,
    initMeta,
    sessionStats,
    wsStatus,
    isLoading: isTimelineLoading,
    error: timelineError,
    loadMore: loadMoreTimeline,
    hasMore: timelineHasMore,
    retrySession,
    sendResume,
    addPendingUserMessage,
    removePendingUserMessage,
    agentProcess: agentProcessFromTimeline,
  } = useTimeline({
    sessionName: sessionName ?? '',
    agentSessionId: codexSessionId,
    panelType: 'codex-cli',
    enabled: !!sessionName,
    resumeCallbacks: {
      onResumeStarted: handleResumeStarted,
      onResumeBlocked: handleResumeBlocked,
      onResumeError: handleResumeError,
    },
    onSync: tabId ? (state) => {
      const checkedAt = Date.now();
      if (state.agentProcess !== null) {
        useTabStore.getState().setAgentProcess(tabId, state.agentProcess, checkedAt);
      }
      if (!state.agentInstalled) {
        useTabStore.getState().setAgentInstalled(tabId, false);
      }
      useTabStore.getState().setTimelineLoading(tabId, state.isLoading);
    } : undefined,
    getCliState: tabId ? () => useTabStore.getState().tabs[tabId]?.cliState : undefined,
  });

  const {
    sessions: codexSessions,
    isLoading: isCodexSessionListLoading,
    error: codexSessionListError,
    refresh: refetchCodexSessions,
  } = useCodexSessions(cwd, !!cwd && view === 'session-list' && agentProcess !== true);

  const prevAgentProcessRef = useRef(agentProcess);
  useEffect(() => {
    const prev = prevAgentProcessRef.current;
    prevAgentProcessRef.current = agentProcess;
    if (prev !== true && agentProcess === true && agentProcessFromTimeline !== true) {
      retrySession();
    }
  }, [agentProcess, agentProcessFromTimeline, retrySession]);

  useEffect(() => {
    if (!tabId || cliState !== 'unknown') return;
    const controller = new AbortController();
    fetch('/api/tmux/recover-unknown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabId }),
      signal: controller.signal,
    }).catch(() => {});
    return () => controller.abort();
  }, [tabId, cliState]);

  useEffect(() => {
    if (!tabId || !sessionName || view !== 'check') return;
    if (cliState !== 'inactive' && cliState !== 'unknown' && cliState !== 'cancelled') {
      useTabStore.getState().setSessionView(tabId, 'timeline');
      return;
    }
    if (agentProcess === true || agentProcessFromTimeline === true) {
      useTabStore.getState().setAgentProcess(tabId, true, Date.now());
      return;
    }

    let stopped = false;
    const checkReady = async () => {
      try {
        const res = await fetch(`/api/check-agent?session=${sessionName}`);
        if (!res.ok) return;
        const data = await res.json() as { running?: boolean; providerPanelType?: unknown; checkedAt?: number };
        if (stopped || data.running !== true || data.providerPanelType !== 'codex-cli') return;
        useTabStore.getState().setAgentProcess(
          tabId,
          true,
          typeof data.checkedAt === 'number' ? data.checkedAt : Date.now(),
        );
      } catch {
        // Keep the boot progress visible; the next tick may succeed.
      }
    };
    void checkReady();
    const id = window.setInterval(checkReady, CODEX_BOOT_CHECK_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [agentProcess, agentProcessFromTimeline, cliState, sessionName, tabId, view]);

  const { meta } = useSessionMeta(entries, sessionSummary, initMeta, sessionStats, tabAgentSummary, tabLastUserMessage);
  const { branch, isLoading: isBranchLoading } = useGitBranch(sessionName ?? '');
  const { status: gitStatus } = useGitStatus(sessionName ?? '', metaSheetOpen);
  const tmuxInfo = useTmuxInfo(sessionName ?? '', metaSheetOpen);
  const messageCounts = useMessageCounts(jsonlPath, metaSheetOpen);
  const metaWithCounts = messageCounts
    ? { ...meta, userCount: messageCounts.userCount, assistantCount: messageCounts.assistantCount }
    : meta;

  const handleSelectCodexSession = useCallback(
    (session: ICodexSessionEntry) => {
      if (!sessionName || resumingSessionId) return;
      setResumingSessionId(session.sessionId);
      sendResume(session.sessionId, sessionName);
    },
    [resumingSessionId, sendResume, sessionName],
  );

  if (!agentInstalled) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-muted px-6 text-center text-muted-foreground"
        role="status"
      >
        <OpenAIIcon size={32} className="text-muted-foreground/60" />
        <span className="text-sm font-medium text-foreground">{t('codexNotInstalled')}</span>
      </div>
    );
  }

  if (updatePrompt && onUpdatePromptResponse) {
    return (
      <div className="animate-delayed-fade-in flex min-h-0 flex-1 flex-col items-center justify-center bg-muted px-4">
        <CodexUpdatePromptCard prompt={updatePrompt} onRespond={onUpdatePromptResponse} />
      </div>
    );
  }

  if (trustPrompt && onTrustResponse) {
    return (
      <div className="animate-delayed-fade-in flex min-h-0 flex-1 flex-col items-center justify-center bg-muted px-4">
        <TrustPromptCard
          folderPath={trustPrompt.folderPath}
          agent={trustPrompt.agent}
          onRespond={onTrustResponse}
        />
      </div>
    );
  }

  if (view === 'check') {
    return (
      <div className="animate-delayed-fade-in flex min-h-0 flex-1 flex-col items-center justify-center bg-muted px-4">
        <CodexBootProgress onRestart={onRestart} />
      </div>
    );
  }

  if (view === 'session-list') {
    if (agentProcess === null || !cwd) {
      return (
        <div className="animate-delayed-fade-in flex min-h-0 flex-1 flex-col items-center justify-center bg-muted px-4">
          <Spinner className="h-4 w-4 text-muted-foreground" />
        </div>
      );
    }

    return (
      <div className="min-h-0 flex-1 bg-muted">
        <CodexSessionListView
          sessions={codexSessions}
          isLoading={isCodexSessionListLoading}
          error={codexSessionListError ? t('codexSessionsLoadFailed') : null}
          resumingSessionId={resumingSessionId}
          onSelectSession={handleSelectCodexSession}
          onRefresh={refetchCodexSessions}
          onNewSession={onNewSession}
        />
      </div>
    );
  }

  if (cliState === 'inactive' && agentProcess === false && !codexSessionId && !isTimelineLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-muted px-6 text-center" role="status">
        <OpenAIIcon size={32} className="text-muted-foreground/60" />
        <p className="text-sm font-medium text-foreground">{t('codexInactiveMessage')}</p>
        {onNewSession && (
          <Button size="default" className="min-h-11" onClick={handleStart}>
            <Plus className="size-4" />
            {t('codexStartSession')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-muted">
      <div
        className="flex shrink-0 cursor-pointer items-center justify-between border-b px-4 py-1.5 hover:bg-muted/30"
        role="button"
        tabIndex={0}
        onClick={() => setMetaSheetOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setMetaSheetOpen(true);
          }
        }}
      >
        <MetaCompact
          title={meta.title}
          totalCost={meta.totalCost}
          branch={branch}
          usedPercentage={meta.usedPercentage}
          currentContextTokens={meta.currentContextTokens}
          contextWindowSize={meta.contextWindowSize}
        />
        <ChevronDown
          size={14}
          className="shrink-0 text-muted-foreground"
        />
      </div>
      <div className="min-h-0 flex-1">
        <TimelineView
          entries={entries}
          tasks={tasks}
          sessionId={sessionId}
          sessionName={sessionName}
          tabId={tabId}
          initMeta={initMeta}
          sessionStats={sessionStats}
          cliState={cliState}
          compactingSince={compactingSince}
          wsStatus={wsStatus}
          isLoading={isTimelineLoading}
          error={timelineError}
          onRetry={retrySession}
          onLoadMore={loadMoreTimeline}
          hasMore={timelineHasMore}
          scrollToBottomRef={scrollToBottomRef}
        />
      </div>
      <div className="shrink-0 pb-3">
        <WebInputBar
          tabId={tabId}
          wsId={wsId}
          sessionName={sessionName}
          agentSessionId={codexSessionId}
          provider="codex"
          cliState={cliState}
          sendStdin={sendStdin}
          terminalWsConnected={terminalWsConnected}
          visible={view === 'timeline'}
          focusTerminal={focusTerminal}
          focusInputRef={focusInputRef}
          setInputValueRef={setInputValueRef}
          maxRows={3}
          onRestartSession={onRestart}
          onSend={handleScrollToBottom}
          onOptimisticSend={addPendingUserMessage}
          onAddPendingMessage={addPendingUserMessage}
          onRemovePendingMessage={removePendingUserMessage}
        />
        <QuickPromptBar
          prompts={quickPrompts}
          visible={view === 'timeline'}
          onSelect={handleSelectQuickPrompt}
        />
      </div>
      <MobileMetaSheet
        open={metaSheetOpen}
        onOpenChange={setMetaSheetOpen}
        meta={metaWithCounts}
        toolCount={messageCounts?.toolCount ?? null}
        toolBreakdown={messageCounts?.toolBreakdown ?? null}
        branch={branch}
        isBranchLoading={isBranchLoading}
        sessionId={sessionId}
        gitStatus={gitStatus}
        tmuxInfo={tmuxInfo}
      />
    </div>
  );
};

export default MobileCodexPanel;
