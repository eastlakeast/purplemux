import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  getSystemResources: () => ipcRenderer.invoke('get-system-resources'),
  showNotification: (
    title: string,
    body: string,
    target: { workspaceId: string; tabId: string },
  ) => ipcRenderer.invoke('show-notification', title, body, target),
  openNotification: (notificationId: string) =>
    ipcRenderer.invoke('open-notification', notificationId),
  openNewWindow: () => ipcRenderer.invoke('open-new-window'),
  setDockBadge: (count: number) => ipcRenderer.invoke('set-dock-badge', count),
  setLocale: (locale: string) => ipcRenderer.invoke('set-locale', locale),
  setNativeTheme: (theme: string) => ipcRenderer.invoke('set-native-theme', theme),
  registerBrowserTab: (tabId: string, webContentsId: number) =>
    ipcRenderer.invoke('browser:register', tabId, webContentsId),
  unregisterBrowserTab: (tabId: string) =>
    ipcRenderer.invoke('browser:unregister', tabId),
  setBrowserDeviceEmulation: (
    tabId: string,
    config: {
      width: number;
      height: number;
      deviceScaleFactor: number;
      mobile: boolean;
      userAgent?: string;
      orientation?: 'portrait' | 'landscape';
    } | null,
  ) => ipcRenderer.invoke('browser:set-device-emulation', tabId, config),
  onNotificationClick: (callback: (target: { workspaceId: string; tabId: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, target: { workspaceId: string; tabId: string }) => callback(target);
    ipcRenderer.on('notification-click', handler);
    return () => { ipcRenderer.removeListener('notification-click', handler); };
  },
  onNotificationClosed: (callback: (notificationId: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, notificationId: string) => callback(notificationId);
    ipcRenderer.on('notification-closed', handler);
    return () => { ipcRenderer.removeListener('notification-closed', handler); };
  },
});
