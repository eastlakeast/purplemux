import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const status = vi.hoisted(() => ({
  listener: null as ((event: object) => void) | null,
  unsubscribe: vi.fn(),
  getAllForClient: vi.fn(),
  getTabForClient: vi.fn(),
}));

vi.mock('@/lib/cli-token', () => ({ verifyCliToken: () => true }));
vi.mock('@/lib/status-manager', () => ({
  getStatusManager: () => ({
    getAllForClient: status.getAllForClient,
    getTabForClient: status.getTabForClient,
    subscribe: (listener: (event: object) => void) => {
      status.listener = listener;
      return status.unsubscribe;
    },
  }),
}));

describe('CLI status event stream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    status.listener = null;
    status.getAllForClient.mockReturnValue({
      'tab-one': { workspaceId: 'ws-one', cliState: 'busy' },
      'tab-two': { workspaceId: 'ws-two', cliState: 'idle' },
    });
    status.getTabForClient.mockImplementation((tabId: string) =>
      status.getAllForClient()[tabId] ?? null);
  });

  it('sends filtered initial state and subsequent transitions, then unsubscribes', async () => {
    const req = Object.assign(new EventEmitter(), {
      method: 'GET',
      query: { workspaceId: 'ws-one' },
      headers: {},
    }) as unknown as NextApiRequest;
    const writes: string[] = [];
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn((chunk: string) => { writes.push(chunk); }),
      end: vi.fn(),
    } as unknown as NextApiResponse;

    const { default: handler } = await import('@/pages/api/cli/events');
    handler(req, res);
    expect(writes[0]).toContain('"tab-one"');
    expect(writes[0]).not.toContain('"tab-two"');

    status.listener?.({ type: 'status:update', tabId: 'tab-one', workspaceId: 'ws-one', cliState: 'idle' });
    status.listener?.({ type: 'status:update', tabId: 'tab-two', workspaceId: 'ws-two', cliState: 'busy' });
    expect(writes).toHaveLength(2);
    expect(writes[1]).toContain('"cliState":"idle"');

    req.emit('close');
    expect(status.unsubscribe).toHaveBeenCalledOnce();
    expect(res.end).toHaveBeenCalledOnce();
  });
});
