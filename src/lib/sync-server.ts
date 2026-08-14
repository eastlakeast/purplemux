import { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { createLogger } from '@/lib/logger';

const log = createLogger('sync');

export type TSystemToastVariant = 'info' | 'success' | 'warning' | 'error';

export type TSystemToastAction = {
  kind: 'copy';
  label: string;
  text: string;
  successMessage?: string;
};

export interface ISystemToastEvent {
  type: 'system-toast';
  key: string;
  variant: TSystemToastVariant;
  message: string;
  durationMs?: number;
  action?: TSystemToastAction;
}

type TSyncEvent =
  | { type: 'workspace' }
  | { type: 'layout'; workspaceId: string }
  | { type: 'config' }
  | ISystemToastEvent;

const g = globalThis as unknown as {
  __ptSyncClients?: Set<WebSocket>;
  __ptElectronSyncClients?: Set<WebSocket>;
  __ptPendingToasts?: Map<string, ISystemToastEvent>;
};
if (!g.__ptSyncClients) g.__ptSyncClients = new Set();
if (!g.__ptElectronSyncClients) g.__ptElectronSyncClients = new Set();
if (!g.__ptPendingToasts) g.__ptPendingToasts = new Map();

const clients = g.__ptSyncClients;
const electronClients = g.__ptElectronSyncClients;
const pendingToasts = g.__ptPendingToasts;

const sendToOne = (ws: WebSocket, payload: string) => {
  if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < BACKPRESSURE_LIMIT) {
    ws.send(payload);
  }
};

export const handleSyncConnection = (ws: WebSocket, request?: IncomingMessage) => {
  clients.add(ws);
  const url = new URL(request?.url ?? '/api/sync', 'http://localhost');
  if (url.searchParams.get('client') === 'electron') electronClients.add(ws);
  for (const toast of pendingToasts.values()) {
    sendToOne(ws, JSON.stringify(toast));
  }
  ws.on('close', () => {
    clients.delete(ws);
    electronClients.delete(ws);
  });
  ws.on('error', (err) => {
    log.error(`websocket error: ${err.message}`);
    clients.delete(ws);
    electronClients.delete(ws);
  });
};

const BACKPRESSURE_LIMIT = 1024 * 1024;

export const broadcastSync = (event: TSyncEvent) => {
  const msg = JSON.stringify(event);
  for (const ws of clients) sendToOne(ws, msg);
};

export const hasLiveElectronSyncClient = (): boolean =>
  [...electronClients].some((ws) => ws.readyState === WebSocket.OPEN);

export const enqueueSystemToast = (toast: ISystemToastEvent): void => {
  pendingToasts.set(toast.key, toast);
  broadcastSync(toast);
};

export const dismissSystemToast = (key: string): void => {
  pendingToasts.delete(key);
};

export const gracefulSyncShutdown = () => {
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1001, 'Server shutting down');
    }
  }
  clients.clear();
  electronClients.clear();
};
