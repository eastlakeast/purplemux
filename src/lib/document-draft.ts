import type { IDocumentState } from '@/types/terminal';

const DOCUMENT_DRAFT_PREFIX = 'purplemux-document-draft:';

const documentDraftKey = (workspaceId: string, tabId: string): string =>
  `${DOCUMENT_DRAFT_PREFIX}${workspaceId}:${tabId}`;

const isDocumentState = (value: object): value is IDocumentState => {
  const candidate = value as Partial<IDocumentState>;
  return candidate.format === 'markdown'
    && typeof candidate.content === 'string'
    && typeof candidate.updatedAt === 'number'
    && Number.isFinite(candidate.updatedAt);
};

export const readDocumentDraft = (
  storage: Pick<Storage, 'getItem'>,
  workspaceId: string,
  tabId: string,
): IDocumentState | null => {
  try {
    const raw = storage.getItem(documentDraftKey(workspaceId, tabId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as object | null;
    return parsed && typeof parsed === 'object' && isDocumentState(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const writeDocumentDraft = (
  storage: Pick<Storage, 'setItem'>,
  workspaceId: string,
  tabId: string,
  document: IDocumentState,
): void => {
  try {
    storage.setItem(documentDraftKey(workspaceId, tabId), JSON.stringify(document));
  } catch {
    // The server-side autosave remains available when browser storage is unavailable.
  }
};

export const clearDocumentDraft = (
  storage: Pick<Storage, 'removeItem'>,
  workspaceId: string,
  tabId: string,
): void => {
  try {
    storage.removeItem(documentDraftKey(workspaceId, tabId));
  } catch {
    // Ignore unavailable storage during teardown.
  }
};

export const clearWorkspaceDocumentDrafts = (
  storage: Pick<Storage, 'length' | 'key' | 'removeItem'>,
  workspaceId: string,
): void => {
  const prefix = `${DOCUMENT_DRAFT_PREFIX}${workspaceId}:`;
  try {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Ignore unavailable storage during teardown.
  }
};

export const selectNewestDocument = (
  persisted: IDocumentState | undefined,
  local: IDocumentState | null,
): IDocumentState => {
  const serverDocument = persisted ?? { format: 'markdown', content: '', updatedAt: 0 };
  return local && local.updatedAt > serverDocument.updatedAt ? local : serverDocument;
};
