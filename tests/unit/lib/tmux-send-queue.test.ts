import { describe, expect, it } from 'vitest';
import { getPendingSendSessions, withTmuxSendLock } from '@/lib/tmux-send-queue';

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

describe('tmux send queue', () => {
  it('runs sends to the same session one at a time', async () => {
    const steps: string[] = [];
    const send = (label: string) =>
      withTmuxSendLock('session-a', async () => {
        steps.push(`${label}:text`);
        await tick(10);
        steps.push(`${label}:enter`);
      });

    await Promise.all([send('one'), send('two'), send('three')]);

    expect(steps).toEqual([
      'one:text',
      'one:enter',
      'two:text',
      'two:enter',
      'three:text',
      'three:enter',
    ]);
  });

  it('keeps different sessions parallel', async () => {
    const steps: string[] = [];
    const send = (session: string, label: string) =>
      withTmuxSendLock(session, async () => {
        steps.push(`${label}:text`);
        await tick(10);
        steps.push(`${label}:enter`);
      });

    await Promise.all([send('session-a', 'a'), send('session-b', 'b')]);

    expect(steps).toEqual(['a:text', 'b:text', 'a:enter', 'b:enter']);
  });

  it('lets a failed send reject its own caller without blocking the queue', async () => {
    const steps: string[] = [];

    const failing = withTmuxSendLock('session-c', async () => {
      steps.push('failing');
      throw new Error('tmux send-keys failed');
    });
    const following = withTmuxSendLock('session-c', async () => {
      steps.push('following');
      return 'ok';
    });

    await expect(failing).rejects.toThrow('tmux send-keys failed');
    await expect(following).resolves.toBe('ok');
    expect(steps).toEqual(['failing', 'following']);
  });

  it('does not retain entries for sessions that finished sending', async () => {
    await withTmuxSendLock('session-d', async () => {});
    await Promise.all([
      withTmuxSendLock('session-e', async () => tick(5)),
      withTmuxSendLock('session-e', async () => tick(5)),
    ]);

    expect(getPendingSendSessions()).not.toContain('session-d');
    expect(getPendingSendSessions()).not.toContain('session-e');
  });

  it('does not interleave a web submit with a concurrent paste on the same session', async () => {
    const written: string[] = [];

    // Mirrors terminal-server's MSG_WEB_SUBMIT handler: text, commit delay, Enter.
    const webSubmit = withTmuxSendLock('session-f', async () => {
      written.push('web:text');
      await tick(20);
      written.push('web:enter');
    });
    // Mirrors sendBracketedPaste arriving from the HTTP API mid-submit.
    const paste = withTmuxSendLock('session-f', async () => {
      written.push('paste:text');
      await tick(5);
      written.push('paste:enter');
    });

    await Promise.all([webSubmit, paste]);

    expect(written).toEqual(['web:text', 'web:enter', 'paste:text', 'paste:enter']);
  });
});
