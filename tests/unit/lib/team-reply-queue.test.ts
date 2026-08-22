import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockHome = vi.hoisted(() => ({ value: '' }));
const tmux = vi.hoisted(() => ({
  hasSession: vi.fn(),
  sendBracketedPaste: vi.fn(),
}));
const inputState = vi.hoisted(() => ({
  assertAgentInputAvailable: vi.fn(),
}));

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    default: { ...actual, homedir: () => mockHome.value },
    homedir: () => mockHome.value,
  };
});
vi.mock('@/lib/tmux', () => tmux);
vi.mock('@/lib/agent-input-state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agent-input-state')>();
  return { ...actual, assertAgentInputAvailable: inputState.assertAgentInputAvailable };
});
vi.mock('@/lib/status-manager', () => ({
  getStatusManager: () => ({
    getTabForClient: () => ({ cliState: 'idle' }),
  }),
}));

const queueInput = {
  groupName: 'fnc-ax',
  fromAlias: 'worker',
  fromWorkspaceName: 'Worker',
  orchestratorAlias: 'leader',
  orchestratorWorkspaceId: 'ws-leader',
  orchestratorTabId: 'tab-leader',
  orchestratorSessionName: 'pt-ws-leader-pane-a-tab-leader',
  orchestratorPanelType: 'claude-code' as const,
  message: 'done',
};

describe('team reply queue', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    delete (globalThis as typeof globalThis & { __ptTeamReplyQueue?: unknown }).__ptTeamReplyQueue;
    mockHome.value = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-team-replies-'));
    tmux.hasSession.mockResolvedValue(false);
    tmux.sendBracketedPaste.mockImplementation(async (_session, _message, beforeSend) => {
      await beforeSend?.();
    });
    inputState.assertAgentInputAvailable.mockResolvedValue(undefined);
  });

  it('persists a reply before delivery and removes it only after a successful send', async () => {
    const queue = await import('@/lib/team-reply-queue');
    const saved = await queue.enqueueTeamReply(queueInput);

    expect(saved.id).toMatch(/^reply-/);
    expect(await queue.listQueuedTeamReplies('tab-leader')).toHaveLength(1);
    expect(await queue.flushTeamReplyQueue()).toBe(0);

    tmux.hasSession.mockResolvedValue(true);
    expect(await queue.flushTeamReplyQueue()).toBe(1);
    expect(tmux.sendBracketedPaste).toHaveBeenCalledWith(
      queueInput.orchestratorSessionName,
      'done',
      expect.any(Function),
    );
    expect(await queue.listQueuedTeamReplies('tab-leader')).toEqual([]);
  });

  it('keeps a reply queued when the orchestrator input is blocked', async () => {
    tmux.hasSession.mockResolvedValue(true);
    const { AgentInputBlockedError } = await import('@/lib/agent-input-state');
    inputState.assertAgentInputAvailable.mockRejectedValue(new AgentInputBlockedError('unknown'));
    const queue = await import('@/lib/team-reply-queue');
    await queue.enqueueTeamReply(queueInput);

    expect(await queue.flushTeamReplyQueue()).toBe(0);
    expect(await queue.listQueuedTeamReplies('tab-leader')).toHaveLength(1);
  });
});
