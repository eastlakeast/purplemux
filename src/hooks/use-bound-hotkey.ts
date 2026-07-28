import { useHotkeys } from 'react-hotkeys-hook';
import { useResolvedKey } from '@/hooks/use-keybindings-store';
import type { TActionId } from '@/lib/keyboard-shortcuts';

interface IBoundHotkeyOptions {
  enableOnFormTags?: boolean;
  enableOnContentEditable?: boolean;
}

const useBoundHotkey = (
  id: TActionId,
  handler: (event: KeyboardEvent) => void,
  enabled: boolean,
  options: IBoundHotkeyOptions = {},
) => {
  const key = useResolvedKey(id);
  useHotkeys(key ?? '', handler, {
    preventDefault: true,
    enableOnFormTags: options.enableOnFormTags ?? true,
    enableOnContentEditable: options.enableOnContentEditable ?? false,
    enabled: enabled && !!key,
  });
};

export default useBoundHotkey;
