import { useState, useRef, useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, RotateCw, Globe, Smartphone, Monitor, RotateCcw, ChevronDown, FileText, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import isElectron from '@/hooks/use-is-electron';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { localFilePathFromHref } from '@/lib/local-file-links';
import { getLocalFileKind } from '@/lib/local-file-viewer';
import { useLayoutStore } from '@/hooks/use-layout';
import { getAppShortcutCodes, subscribeKeybindings } from '@/lib/keyboard-shortcuts';
import { toKeyboardEventInit, type IWebviewKeyboardInput } from '@/lib/webview-keyboard';

interface IElectronWebview extends HTMLElement {
  loadURL(url: string): Promise<void>;
  getURL(): string;
  goBack(): void;
  goForward(): void;
  reload(): void;
  canGoBack(): boolean;
  canGoForward(): boolean;
  setUserAgent(userAgent: string): void;
  getWebContentsId(): number;
}

interface IDeviceEmulationConfig {
  width: number;
  height: number;
  deviceScaleFactor: number;
  mobile: boolean;
  userAgent?: string;
  orientation?: 'portrait' | 'landscape';
}

interface IBrowserBridgeAPI {
  registerBrowserTab?: (tabId: string, webContentsId: number, shortcutCodes: readonly string[]) => Promise<unknown>;
  unregisterBrowserTab?: (tabId: string) => Promise<unknown>;
  setBrowserDeviceEmulation?: (tabId: string, config: IDeviceEmulationConfig | null) => Promise<unknown>;
  onBrowserShortcut?: (callback: (tabId: string, input: IWebviewKeyboardInput) => void) => () => void;
}

const getBridgeAPI = (): IBrowserBridgeAPI | null => {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { electronAPI?: IBrowserBridgeAPI }).electronAPI ?? null;
};

interface IDevicePreset {
  id: string;
  name: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  userAgent: string;
}

const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID_PIXEL_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const ANDROID_GALAXY_UA =
  'Mozilla/5.0 (Linux; Android 13; SM-G988B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

const DEVICE_PRESETS: IDevicePreset[] = [
  { id: 'iphone-se', name: 'iPhone SE', width: 375, height: 667, deviceScaleFactor: 2, userAgent: IOS_UA },
  { id: 'iphone-14-pro', name: 'iPhone 14 Pro', width: 393, height: 852, deviceScaleFactor: 3, userAgent: IOS_UA },
  { id: 'iphone-14-pro-max', name: 'iPhone 14 Pro Max', width: 430, height: 932, deviceScaleFactor: 3, userAgent: IOS_UA },
  { id: 'pixel-7', name: 'Pixel 7', width: 412, height: 915, deviceScaleFactor: 2.625, userAgent: ANDROID_PIXEL_UA },
  { id: 'galaxy-s20-ultra', name: 'Galaxy S20 Ultra', width: 412, height: 915, deviceScaleFactor: 3.5, userAgent: ANDROID_GALAXY_UA },
  { id: 'ipad-mini', name: 'iPad Mini', width: 768, height: 1024, deviceScaleFactor: 2, userAgent: IPAD_UA },
  { id: 'ipad-pro', name: 'iPad Pro 12.9"', width: 1024, height: 1366, deviceScaleFactor: 2, userAgent: IPAD_UA },
];

const DEFAULT_DEVICE_ID = 'iphone-14-pro';

type TZoomValue = 'fit' | number;
const ZOOM_OPTIONS: TZoomValue[] = ['fit', 0.5, 0.75, 1, 1.25, 1.5];

const formatZoomLabel = (z: TZoomValue, fitLabel: string): string =>
  z === 'fit' ? fitLabel : `${Math.round(z * 100)}%`;

interface IWebBrowserPanelProps {
  tabId?: string;
  initialUrl?: string | null;
  onUrlChange?: (url: string) => void;
}

const ensureProtocol = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^localhost(:|\/|$)/.test(trimmed) || /^(\d{1,3}\.){3}\d{1,3}(:|\/|$)/.test(trimmed)) {
    return `http://${trimmed}`;
  }
  return `https://${trimmed}`;
};

const checkSameOrigin = (iframe: HTMLIFrameElement): boolean => {
  try {
    const href = iframe.contentWindow?.location.href;
    return href !== undefined && href !== 'about:blank';
  } catch {
    return false;
  }
};

const isInternalViewerUrl = (value: string): boolean => {
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith('/viewer/');
  } catch {
    return false;
  }
};

const sessionUrlCache = new Map<string, string>();

const getLastViewedUrl = (configuredUrl: string): string | null => {
  const cached = sessionUrlCache.get(configuredUrl);
  if (cached) return cached;
  if (isElectron) {
    try { return localStorage.getItem(`webview-last:${configuredUrl}`); }
    catch { return null; }
  }
  return null;
};

const saveLastViewedUrl = (configuredUrl: string, currentUrl: string) => {
  sessionUrlCache.set(configuredUrl, currentUrl);
  if (isElectron) {
    try { localStorage.setItem(`webview-last:${configuredUrl}`, currentUrl); }
    catch { /* noop */ }
  }
};

const WebBrowserPanel = ({ initialUrl, onUrlChange, tabId }: IWebBrowserPanelProps) => {
  const t = useTranslations('webBrowser');
  const configuredLocalFilePath = localFilePathFromHref(initialUrl);
  const resolvedUrl = initialUrl
    ? configuredLocalFilePath
      ? initialUrl
      : (getLastViewedUrl(initialUrl) ?? initialUrl)
    : '';
  const [url, setUrl] = useState(resolvedUrl);
  const [addressValue, setAddressValue] = useState(resolvedUrl);
  const [canNavigate, setCanNavigate] = useState(isElectron);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [mobileMode, setMobileMode] = useState(false);
  const [deviceId, setDeviceId] = useState<string>(DEFAULT_DEVICE_ID);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [zoom, setZoom] = useState<TZoomValue>('fit');
  const [devicePopoverOpen, setDevicePopoverOpen] = useState(false);
  const [zoomPopoverOpen, setZoomPopoverOpen] = useState(false);
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const webviewRef = useRef<IElectronWebview | null>(null);
  const webviewContainerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const onUrlChangeRef = useRef(onUrlChange);
  useEffect(() => { onUrlChangeRef.current = onUrlChange; });
  const initialUrlRef = useRef(initialUrl);
  useEffect(() => { initialUrlRef.current = initialUrl; });
  const shortcutCodes = useSyncExternalStore(
    subscribeKeybindings,
    getAppShortcutCodes,
    getAppShortcutCodes,
  );

  const selectedDevice = useMemo(
    () => DEVICE_PRESETS.find((d) => d.id === deviceId) ?? DEVICE_PRESETS[0],
    [deviceId],
  );
  const localFilePath = useMemo(() => localFilePathFromHref(addressValue), [addressValue]);
  const localFileKind = localFilePath ? getLocalFileKind(localFilePath) : null;
  const effectiveMobileMode = mobileMode && !localFilePath;

  const deviceSize = useMemo(() => {
    if (orientation === 'landscape') {
      return { width: selectedDevice.height, height: selectedDevice.width };
    }
    return { width: selectedDevice.width, height: selectedDevice.height };
  }, [selectedDevice, orientation]);

  const fitScale = useMemo(() => {
    if (stageSize.w === 0 || stageSize.h === 0) return 1;
    const padding = 32;
    const scaleX = (stageSize.w - padding) / deviceSize.width;
    const scaleY = (stageSize.h - padding) / deviceSize.height;
    return Math.min(1, scaleX, scaleY);
  }, [stageSize, deviceSize]);

  const effectiveScale = zoom === 'fit' ? fitScale : zoom;

  useEffect(() => {
    if (initialUrl && addressValue && !configuredLocalFilePath) {
      saveLastViewedUrl(initialUrl, addressValue);
    }
  }, [addressValue, configuredLocalFilePath, initialUrl]);

  useEffect(() => {
    if (!isElectron || !url || !webviewContainerRef.current) return;

    const container = webviewContainerRef.current;
    let wv = container.querySelector('webview') as IElectronWebview | null;

    if (!wv) {
      wv = document.createElement('webview') as unknown as IElectronWebview;
      if (!isInternalViewerUrl(url)) {
        wv.setAttribute('partition', 'persist:web-browser');
      }
      wv.style.width = '100%';
      wv.style.height = '100%';
      wv.style.border = 'none';
      wv.setAttribute('src', url);
      container.appendChild(wv);
    } else if (wv.parentElement !== container) {
      container.appendChild(wv);
    }

    webviewRef.current = wv;

    const handleNavigate = (e: Event) => {
      const detail = e as Event & { url: string };
      setAddressValue(detail.url);
      setCanGoBack(wv!.canGoBack());
      setCanGoForward(wv!.canGoForward());
      onUrlChangeRef.current?.(detail.url);
    };

    const handleNavigateInPage = (e: Event) => {
      const detail = e as Event & { url: string; isMainFrame: boolean };
      if (!detail.isMainFrame) return;
      const currentUrl = wv!.getURL();
      setAddressValue(currentUrl);
      setCanGoBack(wv!.canGoBack());
      setCanGoForward(wv!.canGoForward());
      onUrlChangeRef.current?.(currentUrl);
    };

    const handleDomReady = () => {
      if (!tabId) return;
      try {
        const wcId = wv!.getWebContentsId();
        getBridgeAPI()?.registerBrowserTab?.(tabId, wcId, shortcutCodes);
      } catch { /* webview not yet mounted; retry handled by subsequent dom-ready */ }
    };

    wv.addEventListener('did-navigate', handleNavigate);
    wv.addEventListener('did-navigate-in-page', handleNavigateInPage);
    wv.addEventListener('dom-ready', handleDomReady);
    handleDomReady();

    return () => {
      wv!.removeEventListener('did-navigate', handleNavigate);
      wv!.removeEventListener('did-navigate-in-page', handleNavigateInPage);
      wv!.removeEventListener('dom-ready', handleDomReady);
    };
  }, [url, tabId, shortcutCodes]);

  useEffect(() => {
    if (!isElectron || !tabId) return;
    const api = getBridgeAPI();
    if (!api?.onBrowserShortcut) return;
    return api.onBrowserShortcut((sourceTabId, input) => {
      if (sourceTabId !== tabId) return;
      if (input.type === 'keyDown') useLayoutStore.getState().focusTab(tabId);
      requestAnimationFrame(() => {
        const eventType = input.type === 'keyUp' ? 'keyup' : 'keydown';
        document.dispatchEvent(new KeyboardEvent(eventType, toKeyboardEventInit(input)));
      });
    });
  }, [tabId]);

  useEffect(() => {
    if (!isElectron || !tabId) return;
    return () => {
      getBridgeAPI()?.unregisterBrowserTab?.(tabId);
    };
  }, [tabId]);

  const emulationUaRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isElectron || !tabId) return;
    const api = getBridgeAPI();
    if (!api?.setBrowserDeviceEmulation) return;

    const targetUa = effectiveMobileMode ? selectedDevice.userAgent : null;
    const uaChanged = emulationUaRef.current !== targetUa;
    emulationUaRef.current = targetUa;

    const config = effectiveMobileMode
      ? {
          width: deviceSize.width,
          height: deviceSize.height,
          deviceScaleFactor: selectedDevice.deviceScaleFactor,
          mobile: true,
          userAgent: selectedDevice.userAgent,
          orientation,
        }
      : null;

    api
      .setBrowserDeviceEmulation(tabId, config)
      .then(() => {
        if (uaChanged) webviewRef.current?.reload();
      })
      .catch(() => {});
  }, [tabId, effectiveMobileMode, selectedDevice, deviceSize, orientation]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => {
      setStageSize({ w: stage.clientWidth, h: stage.clientHeight });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [effectiveMobileMode]);

  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;
    if (effectiveMobileMode) {
      wv.style.width = `${deviceSize.width}px`;
      wv.style.height = `${deviceSize.height}px`;
      wv.style.transformOrigin = 'top left';
      wv.style.transform = `scale(${effectiveScale})`;
    } else {
      wv.style.width = '100%';
      wv.style.height = '100%';
      wv.style.transform = '';
      wv.style.transformOrigin = '';
    }
  }, [effectiveMobileMode, deviceSize, effectiveScale, url]);

  useEffect(() => {
    if (isElectron || !iframeRef.current || !url) return;
    iframeRef.current.src = url;
  }, [url]);

  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const sameOrigin = checkSameOrigin(iframe);
    setCanNavigate(sameOrigin);

    if (sameOrigin) {
      try {
        const currentHref = iframe.contentWindow?.location.href;
        if (currentHref && currentHref !== 'about:blank') {
          setAddressValue(currentHref);
          onUrlChange?.(currentHref);
        }
      } catch { /* cross-origin */ }
    }
  }, [onUrlChange]);

  const navigate = useCallback((targetUrl: string) => {
    const full = ensureProtocol(targetUrl);
    if (!full) return;

    if (isElectron && webviewRef.current) {
      webviewRef.current.loadURL(full);
    }
    setUrl(full);
    setAddressValue(full);
    onUrlChange?.(full);
  }, [onUrlChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      navigate(addressValue);
    }
  };

  const handleToggleMobileMode = useCallback(() => {
    setMobileMode((prev) => !prev);
  }, []);

  const handleSelectDevice = (id: string) => {
    setDeviceId(id);
    setDevicePopoverOpen(false);
  };

  const handleToggleOrientation = () => {
    setOrientation((prev) => (prev === 'portrait' ? 'landscape' : 'portrait'));
  };

  const handleSelectZoom = (z: TZoomValue) => {
    setZoom(z);
    setZoomPopoverOpen(false);
  };

  const handleGoBack = () => {
    if (isElectron) {
      webviewRef.current?.goBack();
      return;
    }
    try {
      iframeRef.current?.contentWindow?.history.back();
    } catch { /* cross-origin */ }
  };

  const handleGoForward = () => {
    if (isElectron) {
      webviewRef.current?.goForward();
      return;
    }
    try {
      iframeRef.current?.contentWindow?.history.forward();
    } catch { /* cross-origin */ }
  };

  const handleRefresh = () => {
    if (isElectron) {
      webviewRef.current?.reload();
      return;
    }
    try {
      iframeRef.current?.contentWindow?.location.reload();
    } catch {
      if (iframeRef.current) {
        const currentSrc = iframeRef.current.src;
        iframeRef.current.src = '';
        iframeRef.current.src = currentSrc;
      }
    }
  };

  const showNavButtons = isElectron || canNavigate;
  const showEmulatorToolbar = isElectron && effectiveMobileMode;

  return (
    <div className="flex h-full flex-col bg-background">
      <div
        className="relative flex h-12 shrink-0 items-center gap-1 border-b border-border px-2"
        {...(isElectron ? { style: { WebkitAppRegion: 'drag' } as React.CSSProperties } : {})}
      >
        <div
          className="flex flex-1 items-center gap-1"
          {...(isElectron ? { style: { WebkitAppRegion: 'no-drag' } as React.CSSProperties } : {})}
        >
          {showNavButtons && (
            <>
              <button
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded hover:bg-accent',
                  isElectron && !canGoBack ? 'text-muted-foreground/50' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={handleGoBack}
                disabled={isElectron && !canGoBack}
                aria-label={t('back')}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <button
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded hover:bg-accent',
                  isElectron && !canGoForward ? 'text-muted-foreground/50' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={handleGoForward}
                disabled={isElectron && !canGoForward}
                aria-label={t('forward')}
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button
                className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={handleRefresh}
                aria-label={t('reload')}
              >
                <RotateCw className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          {isElectron && !localFilePath && (
            <button
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded hover:bg-accent',
                mobileMode ? 'text-accent-color' : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={handleToggleMobileMode}
              aria-label={mobileMode ? t('switchToDesktop') : t('switchToMobile')}
              title={mobileMode ? t('mobileModeTip') : t('desktopModeTip')}
            >
              {mobileMode ? <Smartphone className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}
            </button>
          )}

          <div className="ml-1 flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-secondary px-2.5 py-1">
            {localFileKind === 'image'
              ? <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              : localFilePath
                ? <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                : <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            {localFilePath ? (
              <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={localFilePath}>
                {localFilePath}
              </div>
            ) : (
              <input
                className={cn(
                  'min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50',
                  canNavigate ? 'text-foreground' : 'text-muted-foreground',
                )}
                placeholder={t('urlPlaceholder')}
                value={addressValue}
                onChange={(e) => setAddressValue(e.target.value)}
                onKeyDown={handleKeyDown}
                spellCheck={false}
              />
            )}
          </div>
        </div>
      </div>

      {showEmulatorToolbar && (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3 text-xs">
          <Popover open={devicePopoverOpen} onOpenChange={setDevicePopoverOpen}>
            <PopoverTrigger
              className="flex h-6 items-center gap-1 rounded px-2 text-foreground hover:bg-accent"
              title={t('deviceTip')}
            >
              <span className="font-medium">{selectedDevice.name}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-1">
              {DEVICE_PRESETS.map((d) => (
                <button
                  key={d.id}
                  className={cn(
                    'flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-accent',
                    d.id === deviceId && 'bg-accent/50 font-medium',
                  )}
                  onClick={() => handleSelectDevice(d.id)}
                >
                  <span>{d.name}</span>
                  <span className="text-muted-foreground">{d.width}×{d.height}</span>
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <span className="font-mono text-muted-foreground">
            {deviceSize.width} × {deviceSize.height}
          </span>

          <button
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={handleToggleOrientation}
            aria-label={t('rotate')}
            title={t('rotate')}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <div className="flex-1" />

          <Popover open={zoomPopoverOpen} onOpenChange={setZoomPopoverOpen}>
            <PopoverTrigger
              className="flex h-6 items-center gap-1 rounded px-2 text-foreground hover:bg-accent"
              title={t('zoomTip')}
            >
              <span>{formatZoomLabel(zoom, t('zoomFit'))}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-32 p-1">
              {ZOOM_OPTIONS.map((z) => (
                <button
                  key={String(z)}
                  className={cn(
                    'flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-accent',
                    z === zoom && 'bg-accent/50 font-medium',
                  )}
                  onClick={() => handleSelectZoom(z)}
                >
                  {formatZoomLabel(z, t('zoomFit'))}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      )}

      {url ? (
        isElectron ? (
          <div
            ref={stageRef}
            className={cn(
              'relative min-h-0 flex-1 overflow-auto',
              effectiveMobileMode ? 'flex items-center justify-center bg-muted/20 p-4' : '',
            )}
          >
            <div
              ref={webviewContainerRef}
              className={cn(
                effectiveMobileMode && 'overflow-hidden rounded-sm bg-background shadow-lg ring-1 ring-border',
              )}
              style={
                effectiveMobileMode
                  ? {
                      width: deviceSize.width * effectiveScale,
                      height: deviceSize.height * effectiveScale,
                      flexShrink: 0,
                    }
                  : { width: '100%', height: '100%' }
              }
            />
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            className="min-h-0 flex-1 border-0"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals"
            allow="clipboard-read; clipboard-write"
            title="Web Browser"
            onLoad={handleIframeLoad}
          />
        )
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Globe className="h-10 w-10 opacity-20" />
            <span className="text-sm">{t('emptyMessage')}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebBrowserPanel;
