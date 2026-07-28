export interface INotificationShortcutTarget {
  id: string;
  open: () => void | Promise<void>;
}

const targets = new Map<string, INotificationShortcutTarget>();
const subscribers = new Set<() => void>();
let currentTarget: INotificationShortcutTarget | null = null;

const publish = () => {
  currentTarget = Array.from(targets.values()).at(-1) ?? null;
  for (const subscriber of subscribers) subscriber();
};

export const registerNotificationShortcutTarget = (
  target: INotificationShortcutTarget,
): (() => void) => {
  targets.delete(target.id);
  targets.set(target.id, target);
  publish();

  return () => {
    if (targets.get(target.id) !== target) return;
    targets.delete(target.id);
    publish();
  };
};

export const removeNotificationShortcutTarget = (id: string) => {
  if (!targets.delete(id)) return;
  publish();
};

export const openNotificationShortcutTarget = (): boolean => {
  const target = currentTarget;
  if (!target) return false;
  removeNotificationShortcutTarget(target.id);
  try {
    void Promise.resolve(target.open()).catch(() => {});
  } catch {
    // The notification may close between the key event and its open callback.
  }
  return true;
};

export const subscribeNotificationShortcut = (subscriber: () => void): (() => void) => {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
};

export const getNotificationShortcutTarget = (): INotificationShortcutTarget | null =>
  currentTarget;
