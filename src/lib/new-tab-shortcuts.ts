interface INewTabShortcutEvent {
  key: string;
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
  if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing || event.repeat) {
    return -1;
  }
  return shortcuts.findIndex((shortcut) => shortcut === event.key.toLowerCase());
};
