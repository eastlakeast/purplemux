import { beforeEach, describe, expect, it, vi } from 'vitest';

type TExecCall = { args: string[]; startedAt: number };

const execCalls: TExecCall[] = [];
let execDelayMs = 0;
let failNextMatching: string | null = null;

vi.mock('child_process', () => ({
  execFile: (
    _cmd: string,
    args: string[],
    _opts: unknown,
    cb: (err: Error | null, result?: { stdout: string; stderr: string }) => void,
  ) => {
    execCalls.push({ args, startedAt: Date.now() });
    const shouldFail = failNextMatching !== null && args.includes(failNextMatching);
    if (shouldFail) failNextMatching = null;
    setTimeout(() => {
      if (shouldFail) cb(new Error('tmux failed'));
      else cb(null, { stdout: '', stderr: '' });
    }, execDelayMs);
  },
}));

const { sendKeys, sendKeysSeparated, sendLiteralInput, sendRawKeys } = await import('@/lib/tmux');

/** tmux invocations for one session, minus the copy-mode reset that opens every send. */
const sentPayloads = (session: string): string[] =>
  execCalls
    .filter((c) => c.args.includes('send-keys') && c.args.includes(session))
    .map((c) => c.args[c.args.length - 1]);

describe('tmux send serialization', () => {
  beforeEach(() => {
    execCalls.length = 0;
    execDelayMs = 0;
    failNextMatching = null;
  });

  it('completes a separated send before the next send to the same session starts', async () => {
    execDelayMs = 5;

    await Promise.all([
      sendKeysSeparated('pt-a', 'first message'),
      sendKeysSeparated('pt-a', 'second message'),
    ]);

    expect(sentPayloads('pt-a')).toEqual([
      'first message',
      'Enter',
      'second message',
      'Enter',
    ]);
  });

  it('does not let a raw key land between another send and its Enter', async () => {
    execDelayMs = 5;

    await Promise.all([
      sendKeysSeparated('pt-b', 'queued prompt'),
      sendRawKeys('pt-b', 'C-c'),
      sendLiteralInput('pt-b', 'literal text'),
    ]);

    expect(sentPayloads('pt-b')).toEqual([
      'queued prompt',
      'Enter',
      'C-c',
      'literal text',
    ]);
  });

  it('exits copy mode inside the same locked unit as its send', async () => {
    await sendKeysSeparated('pt-c', 'hello');

    const sessionCalls = execCalls.filter((c) => c.args.includes('pt-c'));
    expect(sessionCalls[0].args).toContain('copy-mode');
    expect(sessionCalls.slice(1).map((c) => c.args[c.args.length - 1])).toEqual([
      'hello',
      'Enter',
    ]);
  });

  it('runs sends to different sessions concurrently', async () => {
    execDelayMs = 30;

    const startedAt = Date.now();
    await Promise.all([sendKeys('pt-d', 'echo d'), sendKeys('pt-e', 'echo e')]);
    const elapsed = Date.now() - startedAt;

    // Serialized would be 4 sequential execs (~120ms); parallel sessions take ~60ms.
    expect(elapsed).toBeLessThan(110);
    expect(sentPayloads('pt-d')).toEqual(['Enter']);
    expect(sentPayloads('pt-e')).toEqual(['Enter']);
  });

  it('still delivers the next send after a failed one', async () => {
    failNextMatching = 'broken message';

    await expect(sendKeysSeparated('pt-f', 'broken message')).rejects.toThrow();
    await sendKeysSeparated('pt-f', 'recovered message');

    expect(sentPayloads('pt-f')).toEqual([
      'broken message',
      'recovered message',
      'Enter',
    ]);
  });
});
