import { useSyncExternalStore } from 'react';
import useBoundHotkey from '@/hooks/use-bound-hotkey';
import {
  getNotificationShortcutTarget,
  openNotificationShortcutTarget,
  subscribeNotificationShortcut,
} from '@/lib/notification-shortcut';

const getServerSnapshot = () => null;

const useNotificationShortcut = () => {
  const target = useSyncExternalStore(
    subscribeNotificationShortcut,
    getNotificationShortcutTarget,
    getServerSnapshot,
  );

  useBoundHotkey(
    'app.open_notification',
    () => {
      openNotificationShortcutTarget();
    },
    target !== null,
    {
      enableOnFormTags: false,
      enableOnContentEditable: false,
    },
  );
};

export default useNotificationShortcut;
