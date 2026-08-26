interface INewTabShortcutEvent {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  isComposing: boolean;
  repeat: boolean;
}

export const findNewTabShortcutIndex = (
  shortcuts: readonly string[],
  event: INewTabShortcutEvent,
): number => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) {
    return -1;
  }

  const physicalKey = /^Key[A-Z]$/.test(event.code)
    ? event.code.slice(3).toLowerCase()
    : null;
  if (event.isComposing && !physicalKey) return -1;

  const key = physicalKey ?? event.key.toLowerCase();
  return shortcuts.findIndex((shortcut) => shortcut === key);
};
