import { create } from 'zustand';

export interface IAttachmentDraft {
  id: string;
  path: string;
  filename: string;
  thumbnail: string;
}

interface IAttachmentDraftGroup {
  workspaceId?: string;
  attachments: IAttachmentDraft[];
}

interface IAttachmentDraftState {
  byTabId: Record<string, IAttachmentDraftGroup>;
  add: (tabId: string, workspaceId: string | undefined, attachments: IAttachmentDraft[]) => void;
  remove: (tabId: string, attachmentId: string) => void;
  clearTab: (tabId: string) => void;
  clearWorkspace: (workspaceId: string) => void;
}

const releaseThumbnails = (attachments: IAttachmentDraft[]) => {
  for (const attachment of attachments) URL.revokeObjectURL(attachment.thumbnail);
};

const useAttachmentDraftStore = create<IAttachmentDraftState>((set) => ({
  byTabId: {},
  add: (tabId, workspaceId, attachments) => set((state) => {
    const current = state.byTabId[tabId]?.attachments ?? [];
    return {
      byTabId: {
        ...state.byTabId,
        [tabId]: { workspaceId, attachments: [...current, ...attachments] },
      },
    };
  }),
  remove: (tabId, attachmentId) => set((state) => {
    const current = state.byTabId[tabId];
    if (!current) return state;
    const removed = current.attachments.find((attachment) => attachment.id === attachmentId);
    if (removed) URL.revokeObjectURL(removed.thumbnail);
    return {
      byTabId: {
        ...state.byTabId,
        [tabId]: {
          ...current,
          attachments: current.attachments.filter((attachment) => attachment.id !== attachmentId),
        },
      },
    };
  }),
  clearTab: (tabId) => set((state) => {
    const current = state.byTabId[tabId];
    if (!current) return state;
    releaseThumbnails(current.attachments);
    const byTabId = { ...state.byTabId };
    delete byTabId[tabId];
    return { byTabId };
  }),
  clearWorkspace: (workspaceId) => set((state) => {
    const byTabId = { ...state.byTabId };
    for (const [tabId, group] of Object.entries(state.byTabId)) {
      if (group.workspaceId !== workspaceId) continue;
      releaseThumbnails(group.attachments);
      delete byTabId[tabId];
    }
    return { byTabId };
  }),
}));

export const clearAttachmentDraft = (tabId: string): void => {
  useAttachmentDraftStore.getState().clearTab(tabId);
};

export const clearWorkspaceAttachmentDrafts = (workspaceId: string): void => {
  useAttachmentDraftStore.getState().clearWorkspace(workspaceId);
};

export default useAttachmentDraftStore;
