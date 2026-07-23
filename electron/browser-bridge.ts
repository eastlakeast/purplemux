import { ipcMain, webContents } from 'electron';
import type { WebContents } from 'electron';
import { normalizeWebviewKeyboardInput, type IWebviewKeyboardInput } from '../src/lib/webview-keyboard';

const CONSOLE_RING_SIZE = 500;
const NETWORK_RING_SIZE = 500;
const BODY_CACHE_SIZE = 50;

interface IConsoleEntry {
  level: string;
  text: string;
  ts: number;
  source?: string;
  line?: number;
  url?: string;
}

interface INetworkEntry {
  requestId: string;
  method: string;
  url: string;
  status?: number;
  mimeType?: string;
  resourceType?: string;
  error?: string;
  ts: number;
  endedAt?: number;
}

interface IBridgeEntry {
  webContentsId: number;
  consoleRing: IConsoleEntry[];
  networkRing: INetworkEntry[];
  networkIndex: Map<string, INetworkEntry>;
  bodyCache: Map<string, string>;
  emulation: IDeviceEmulationConfig | null;
  shortcutCodes: Set<string>;
  dispose: () => void;
}

export interface IDeviceEmulationConfig {
  width: number;
  height: number;
  deviceScaleFactor: number;
  mobile: boolean;
  userAgent?: string;
  orientation?: 'portrait' | 'landscape';
}

export interface IBrowserBridge {
  register: (tabId: string, wcId: number, shortcutCodes: readonly string[]) => void;
  unregister: (tabId: string) => void;
  list: () => Array<{ tabId: string; webContentsId: number }>;
  getUrl: (tabId: string) => string | null;
  getTitle: (tabId: string) => string | null;
  capture: (tabId: string, opts?: { fullPage?: boolean; clip?: { x: number; y: number; width: number; height: number; scale: number } }) => Promise<string>;
  evaluate: (tabId: string, expression: string) => Promise<unknown>;
  getConsole: (tabId: string, since?: number) => IConsoleEntry[];
  getNetwork: (tabId: string, since?: number) => INetworkEntry[];
  getResponseBody: (tabId: string, requestId: string) => Promise<string | null>;
  reload: (tabId: string) => void;
  navigate: (tabId: string, url: string) => Promise<void>;
  setDeviceEmulation: (tabId: string, config: IDeviceEmulationConfig | null) => Promise<void>;
}

type TGlobal = typeof globalThis & { __ptBrowserBridge?: IBrowserBridge };
const g = globalThis as TGlobal;

const pushRing = <T>(ring: T[], item: T, max: number, onEvict?: (evicted: T) => void) => {
  ring.push(item);
  if (ring.length > max) {
    const evicted = ring.shift();
    if (evicted !== undefined) onEvict?.(evicted);
  }
};

const extractArgText = (args: Array<{ value?: unknown; description?: string; type?: string }>): string =>
  args
    .map((a) => {
      if (a.value !== undefined) {
        if (typeof a.value === 'string') return a.value;
        try { return JSON.stringify(a.value); } catch { return String(a.value); }
      }
      return a.description ?? a.type ?? '';
    })
    .join(' ');

const attachDebugger = (
  tabId: string,
  wc: WebContents,
  registry: Map<string, IBridgeEntry>,
  shortcutCodes: readonly string[],
) => {
  if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');

  const entry: IBridgeEntry = {
    webContentsId: wc.id,
    consoleRing: [],
    networkRing: [],
    networkIndex: new Map(),
    bodyCache: new Map(),
    emulation: null,
    shortcutCodes: new Set(shortcutCodes),
    dispose: () => {},
  };

  const onMessage = (_event: Electron.Event, method: string, params: Record<string, unknown>) => {
    const p = params as Record<string, unknown>;
    if (method === 'Runtime.consoleAPICalled') {
      const args = (p.args as Array<{ value?: unknown; description?: string; type?: string }>) ?? [];
      const frame = (p.stackTrace as { callFrames?: Array<{ url?: string; lineNumber?: number }> } | undefined)?.callFrames?.[0];
      pushRing(entry.consoleRing, {
        level: String(p.type ?? 'log'),
        text: extractArgText(args),
        ts: Date.now(),
        url: frame?.url,
        line: frame?.lineNumber,
      }, CONSOLE_RING_SIZE);
    } else if (method === 'Runtime.exceptionThrown') {
      const exc = p.exceptionDetails as { text?: string; exception?: { description?: string }; url?: string; lineNumber?: number } | undefined;
      pushRing(entry.consoleRing, {
        level: 'error',
        text: exc?.exception?.description ?? exc?.text ?? 'exception',
        ts: Date.now(),
        url: exc?.url,
        line: exc?.lineNumber,
      }, CONSOLE_RING_SIZE);
    } else if (method === 'Log.entryAdded') {
      const e = p.entry as { level?: string; text?: string; source?: string; url?: string; lineNumber?: number } | undefined;
      pushRing(entry.consoleRing, {
        level: e?.level ?? 'info',
        text: e?.text ?? '',
        ts: Date.now(),
        source: e?.source,
        url: e?.url,
        line: e?.lineNumber,
      }, CONSOLE_RING_SIZE);
    } else if (method === 'Network.requestWillBeSent') {
      const req = p.request as { method?: string; url?: string } | undefined;
      const rec: INetworkEntry = {
        requestId: String(p.requestId ?? ''),
        method: req?.method ?? 'GET',
        url: req?.url ?? '',
        resourceType: String(p.type ?? ''),
        ts: Date.now(),
      };
      entry.networkIndex.set(rec.requestId, rec);
      pushRing(entry.networkRing, rec, NETWORK_RING_SIZE, (evicted) => {
        entry.networkIndex.delete(evicted.requestId);
      });
    } else if (method === 'Network.responseReceived') {
      const rec = entry.networkIndex.get(String(p.requestId ?? ''));
      if (rec) {
        const resp = p.response as { status?: number; mimeType?: string } | undefined;
        rec.status = resp?.status;
        rec.mimeType = resp?.mimeType;
        rec.resourceType = String(p.type ?? rec.resourceType ?? '');
      }
    } else if (method === 'Network.loadingFinished') {
      const rec = entry.networkIndex.get(String(p.requestId ?? ''));
      if (rec) rec.endedAt = Date.now();
    } else if (method === 'Network.loadingFailed') {
      const rec = entry.networkIndex.get(String(p.requestId ?? ''));
      if (rec) {
        rec.error = String(p.errorText ?? 'failed');
        rec.endedAt = Date.now();
      }
    }
  };

  const onBeforeInput = (event: Electron.Event, input: Electron.Input) => {
    const keyboardInput: IWebviewKeyboardInput = {
      type: input.type,
      key: input.key,
      code: input.code,
      isAutoRepeat: input.isAutoRepeat,
      shift: input.shift,
      control: input.control,
      alt: input.alt,
      meta: input.meta,
    };
    if (!entry.shortcutCodes.has(normalizeWebviewKeyboardInput(keyboardInput))) return;
    event.preventDefault();
    const host = wc.hostWebContents;
    if (host && !host.isDestroyed()) host.send('browser:shortcut', tabId, keyboardInput);
  };

  let disposed = false;
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    wc.off('before-input-event', onBeforeInput);
    wc.debugger.off('message', onMessage);
    wc.debugger.off('detach', cleanup);
    wc.off('destroyed', cleanup);
    if (registry.get(tabId) === entry) registry.delete(tabId);
  };
  entry.dispose = cleanup;
  wc.debugger.on('message', onMessage);
  wc.debugger.on('detach', cleanup);
  wc.once('destroyed', cleanup);
  wc.on('before-input-event', onBeforeInput);

  wc.debugger.sendCommand('Runtime.enable').catch(() => {});
  wc.debugger.sendCommand('Log.enable').catch(() => {});
  wc.debugger.sendCommand('Network.enable').catch(() => {});
  wc.debugger.sendCommand('Page.enable').catch(() => {});

  registry.set(tabId, entry);
};

const getWc = (entry: IBridgeEntry): WebContents => {
  const wc = webContents.fromId(entry.webContentsId);
  if (!wc || wc.isDestroyed()) {
    throw new Error('webContents destroyed');
  }
  return wc;
};

export const initBrowserBridge = (): void => {
  if (g.__ptBrowserBridge) return;

  const registry = new Map<string, IBridgeEntry>();

  const bridge: IBrowserBridge = {
    register: (tabId, wcId, shortcutCodes) => {
      const existing = registry.get(tabId);
      if (existing && existing.webContentsId === wcId) {
        existing.shortcutCodes = new Set(shortcutCodes);
        return;
      }
      if (existing) bridge.unregister(tabId);
      const wc = webContents.fromId(wcId);
      if (!wc || wc.isDestroyed()) throw new Error('webContents not found');
      attachDebugger(tabId, wc, registry, shortcutCodes);
    },
    unregister: (tabId) => {
      const entry = registry.get(tabId);
      if (!entry) return;
      const wc = webContents.fromId(entry.webContentsId);
      entry.dispose();
      if (wc && !wc.isDestroyed() && wc.debugger.isAttached()) {
        try { wc.debugger.detach(); } catch {}
      }
    },
    list: () => Array.from(registry.entries()).map(([tabId, e]) => ({ tabId, webContentsId: e.webContentsId })),
    getUrl: (tabId) => {
      const entry = registry.get(tabId);
      if (!entry) return null;
      const wc = webContents.fromId(entry.webContentsId);
      return wc && !wc.isDestroyed() ? wc.getURL() : null;
    },
    getTitle: (tabId) => {
      const entry = registry.get(tabId);
      if (!entry) return null;
      const wc = webContents.fromId(entry.webContentsId);
      return wc && !wc.isDestroyed() ? wc.getTitle() : null;
    },
    capture: async (tabId, opts = {}) => {
      const entry = registry.get(tabId);
      if (!entry) throw new Error('tab not registered');
      const wc = getWc(entry);
      const args: Record<string, unknown> = { format: 'png' };
      if (opts.fullPage) args.captureBeyondViewport = true;
      if (opts.clip) args.clip = opts.clip;
      const result = (await wc.debugger.sendCommand('Page.captureScreenshot', args)) as { data: string };
      return result.data;
    },
    evaluate: async (tabId, expression) => {
      const entry = registry.get(tabId);
      if (!entry) throw new Error('tab not registered');
      const wc = getWc(entry);
      const result = (await wc.debugger.sendCommand('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
        timeout: 10_000,
      })) as { result: { value: unknown }; exceptionDetails?: { text: string; exception?: { description?: string } } };
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      }
      return result.result.value;
    },
    getConsole: (tabId, since = 0) => {
      const entry = registry.get(tabId);
      if (!entry) return [];
      return since > 0 ? entry.consoleRing.filter((e) => e.ts > since) : [...entry.consoleRing];
    },
    getNetwork: (tabId, since = 0) => {
      const entry = registry.get(tabId);
      if (!entry) return [];
      return since > 0 ? entry.networkRing.filter((e) => e.ts > since) : [...entry.networkRing];
    },
    getResponseBody: async (tabId, requestId) => {
      const entry = registry.get(tabId);
      if (!entry) return null;
      const cached = entry.bodyCache.get(requestId);
      if (cached !== undefined) return cached;
      const wc = getWc(entry);
      try {
        const result = (await wc.debugger.sendCommand('Network.getResponseBody', { requestId })) as {
          body: string;
          base64Encoded: boolean;
        };
        const body = result.base64Encoded ? Buffer.from(result.body, 'base64').toString('utf8') : result.body;
        entry.bodyCache.set(requestId, body);
        if (entry.bodyCache.size > BODY_CACHE_SIZE) {
          const firstKey = entry.bodyCache.keys().next().value;
          if (firstKey !== undefined) entry.bodyCache.delete(firstKey);
        }
        return body;
      } catch {
        return null;
      }
    },
    reload: (tabId) => {
      const entry = registry.get(tabId);
      if (!entry) return;
      const wc = webContents.fromId(entry.webContentsId);
      if (wc && !wc.isDestroyed()) wc.reload();
    },
    navigate: async (tabId, url) => {
      const entry = registry.get(tabId);
      if (!entry) throw new Error('tab not registered');
      const wc = getWc(entry);
      await wc.loadURL(url);
    },
    setDeviceEmulation: async (tabId, config) => {
      const entry = registry.get(tabId);
      if (!entry) throw new Error('tab not registered');
      const wc = getWc(entry);
      if (!config) {
        entry.emulation = null;
        await Promise.all([
          wc.debugger.sendCommand('Emulation.clearDeviceMetricsOverride').catch(() => {}),
          wc.debugger.sendCommand('Emulation.setUserAgentOverride', { userAgent: '' }).catch(() => {}),
          wc.debugger.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: false }).catch(() => {}),
        ]);
        return;
      }
      entry.emulation = config;
      const orientation = config.orientation ?? 'portrait';
      await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
        width: Math.round(config.width),
        height: Math.round(config.height),
        deviceScaleFactor: config.deviceScaleFactor,
        mobile: config.mobile,
        screenOrientation: {
          type: orientation === 'landscape' ? 'landscapePrimary' : 'portraitPrimary',
          angle: orientation === 'landscape' ? 90 : 0,
        },
      });
      if (config.userAgent !== undefined) {
        await wc.debugger.sendCommand('Emulation.setUserAgentOverride', { userAgent: config.userAgent });
      }
      await wc.debugger.sendCommand('Emulation.setTouchEmulationEnabled', {
        enabled: config.mobile,
        maxTouchPoints: 5,
      });
    },
  };

  g.__ptBrowserBridge = bridge;

  ipcMain.handle('browser:register', (_e, tabId: string, wcId: number, shortcutCodes: string[]) => {
    try {
      bridge.register(tabId, wcId, shortcutCodes);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('browser:unregister', (_e, tabId: string) => {
    bridge.unregister(tabId);
    return { ok: true };
  });

  ipcMain.handle('browser:set-device-emulation', async (_e, tabId: string, config: IDeviceEmulationConfig | null) => {
    try {
      await bridge.setDeviceEmulation(tabId, config);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
};
