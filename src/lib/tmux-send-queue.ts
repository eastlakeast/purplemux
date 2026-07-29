/**
 * Serializes input delivery per tmux session.
 *
 * Sending input is a multi-step operation (exit copy-mode → text → Enter). Without a
 * lock, a second sender can land its text between another sender's text and Enter, and
 * the TUI commits both as a single merged line. Different sessions stay parallel.
 *
 * Lives on `globalThis` because `src/lib/*` is instantiated once for the custom server
 * and again for Next API routes (see CLAUDE.md §18) — both graphs must share one queue.
 */
const g = globalThis as unknown as {
  __ptTmuxSendQueues?: Map<string, Promise<void>>;
};

const queues = (g.__ptTmuxSendQueues ??= new Map<string, Promise<void>>());

export const withTmuxSendLock = async <T>(
  sessionName: string,
  fn: () => Promise<T>,
): Promise<T> => {
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });

  const prev = queues.get(sessionName);
  queues.set(sessionName, next);

  // `next` only ever resolves, so a rejected `fn` propagates to its own caller
  // without poisoning the chain for the senders queued behind it.
  if (prev) await prev;

  try {
    return await fn();
  } finally {
    release();
    if (queues.get(sessionName) === next) queues.delete(sessionName);
  }
};

export const getPendingSendSessions = (): string[] => [...queues.keys()];
