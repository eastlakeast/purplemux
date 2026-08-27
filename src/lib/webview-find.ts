interface IWebviewFindTarget {
  readonly isConnected: boolean;
  findInPage(
    text: string,
    options?: { forward?: boolean; findNext?: boolean; matchCase?: boolean },
  ): number;
  stopFindInPage(action: 'clearSelection' | 'keepSelection' | 'activateSelection'): void;
}

export const findInReadyWebview = (
  webview: IWebviewFindTarget | null,
  isReady: boolean,
  text: string,
  options: { forward: boolean; findNext: boolean },
): number | null => {
  if (!webview || !isReady || !webview.isConnected || !text) return null;

  try {
    return webview.findInPage(text, options);
  } catch {
    return null;
  }
};

export const stopFindInReadyWebview = (
  webview: IWebviewFindTarget | null,
  isReady: boolean,
): boolean => {
  if (!webview || !isReady || !webview.isConnected) return false;

  try {
    webview.stopFindInPage('clearSelection');
    return true;
  } catch {
    return false;
  }
};
