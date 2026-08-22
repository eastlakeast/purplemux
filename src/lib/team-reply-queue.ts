import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { nanoid } from 'nanoid';
import { AgentInputBlockedError, assertAgentInputAvailable } from '@/lib/agent-input-state';
import { createLogger } from '@/lib/logger';
import { getStatusManager } from '@/lib/status-manager';
import { hasSession, sendBracketedPaste } from '@/lib/tmux';
import type { TPanelType } from '@/types/terminal';

const log = createLogger('team-reply-queue');
const QUEUE_FILE = path.join(os.homedir(), '.purplemux', 'team-replies.json');
const RETRY_INTERVAL_MS = 1_000;

export interface IQueuedTeamReply {
  id: string;
  createdAt: string;
  groupName: string;
  fromAlias: string;
  fromWorkspaceName: string;
  orchestratorAlias: string;
  orchestratorWorkspaceId: string;
  orchestratorTabId: string;
  orchestratorSessionName: string;
  orchestratorPanelType: TPanelType;
  message: string;
}

interface ITeamReplyQueueState {
  messages: IQueuedTeamReply[];
  loaded: boolean;
  lock: Promise<void>;
  timer: ReturnType<typeof setInterval> | null;
  flushing: boolean;
}

const g = globalThis as unknown as { __ptTeamReplyQueue?: ITeamReplyQueueState };
const state = (g.__ptTeamReplyQueue ??= {
  messages: [],
  loaded: false,
  lock: Promise.resolve(),
  timer: null,
  flushing: false,
});

const withQueueLock = async <T>(fn: () => Promise<T>): Promise<T> => {
  let release!: () => void;
  const next = new Promise<void>((resolve) => { release = resolve; });
  const prev = state.lock;
  state.lock = next;
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
};

const loadLocked = async (): Promise<void> => {
  if (state.loaded) return;
  try {
    const raw = await fs.readFile(QUEUE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as { messages?: unknown };
    state.messages = Array.isArray(parsed.messages)
      ? parsed.messages as IQueuedTeamReply[]
      : [];
  } catch {
    state.messages = [];
  }
  state.loaded = true;
};

const persistLocked = async (): Promise<void> => {
  await fs.mkdir(path.dirname(QUEUE_FILE), { recursive: true });
  const tmpFile = `${QUEUE_FILE}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify({ messages: state.messages }, null, 2), { mode: 0o600 });
  await fs.rename(tmpFile, QUEUE_FILE);
};

export type TEnqueueTeamReplyInput = Omit<IQueuedTeamReply, 'id' | 'createdAt'>;

export const enqueueTeamReply = async (
  input: TEnqueueTeamReplyInput,
): Promise<IQueuedTeamReply> => withQueueLock(async () => {
  await loadLocked();
  const queued: IQueuedTeamReply = {
    id: `reply-${nanoid(10)}`,
    createdAt: new Date().toISOString(),
    ...input,
  };
  state.messages.push(queued);
  await persistLocked();
  return queued;
});

export const listQueuedTeamReplies = async (
  orchestratorTabId: string,
): Promise<IQueuedTeamReply[]> => withQueueLock(async () => {
  await loadLocked();
  return state.messages
    .filter((message) => message.orchestratorTabId === orchestratorTabId)
    .map((message) => ({ ...message }));
});

const tryDeliver = async (message: IQueuedTeamReply): Promise<boolean> => {
  if (!(await hasSession(message.orchestratorSessionName))) return false;
  const liveState = getStatusManager().getTabForClient(message.orchestratorTabId)?.cliState;
  try {
    await sendBracketedPaste(
      message.orchestratorSessionName,
      message.message,
      () => assertAgentInputAvailable(
        message.orchestratorSessionName,
        message.orchestratorPanelType,
        liveState,
      ),
    );
    return true;
  } catch (error) {
    if (error instanceof AgentInputBlockedError) return false;
    log.warn({ err: error instanceof Error ? error.message : error, messageId: message.id }, 'team reply delivery failed');
    return false;
  }
};

export const flushTeamReplyQueue = async (): Promise<number> => {
  if (state.flushing) return 0;
  state.flushing = true;
  try {
    const snapshot = await withQueueLock(async () => {
      await loadLocked();
      return state.messages.map((message) => ({ ...message }));
    });
    const deliveredIds = new Set<string>();
    for (const message of snapshot) {
      if (await tryDeliver(message)) deliveredIds.add(message.id);
    }
    if (deliveredIds.size > 0) {
      await withQueueLock(async () => {
        state.messages = state.messages.filter((message) => !deliveredIds.has(message.id));
        await persistLocked();
      });
    }
    return deliveredIds.size;
  } finally {
    state.flushing = false;
  }
};

export const startTeamReplyDispatcher = (): void => {
  if (state.timer) return;
  void flushTeamReplyQueue();
  state.timer = setInterval(() => { void flushTeamReplyQueue(); }, RETRY_INTERVAL_MS);
  state.timer.unref?.();
};

export const stopTeamReplyDispatcher = (): void => {
  if (!state.timer) return;
  clearInterval(state.timer);
  state.timer = null;
};
