import { describe, expect, it } from 'vitest';
import {
  clearDocumentDraft,
  clearWorkspaceDocumentDrafts,
  readDocumentDraft,
  selectNewestDocument,
  writeDocumentDraft,
} from '@/lib/document-draft';
import type { IDocumentState } from '@/types/terminal';

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    key: (index: number) => [...values.keys()][index] ?? null,
  };
};

const documentState = (content: string, updatedAt: number): IDocumentState => ({
  format: 'markdown',
  content,
  updatedAt,
});

describe('document drafts', () => {
  it('round-trips a local draft and removes it when its tab closes', () => {
    const storage = createStorage();
    const draft = documentState('secret note', 20);
    writeDocumentDraft(storage, 'ws-one', 'tab-one', draft);

    expect(readDocumentDraft(storage, 'ws-one', 'tab-one')).toEqual(draft);
    clearDocumentDraft(storage, 'ws-one', 'tab-one');
    expect(readDocumentDraft(storage, 'ws-one', 'tab-one')).toBeNull();
  });

  it('removes only drafts belonging to the deleted workspace', () => {
    const storage = createStorage();
    writeDocumentDraft(storage, 'ws-one', 'tab-one', documentState('one', 1));
    writeDocumentDraft(storage, 'ws-one', 'tab-two', documentState('two', 2));
    writeDocumentDraft(storage, 'ws-two', 'tab-three', documentState('three', 3));

    clearWorkspaceDocumentDrafts(storage, 'ws-one');

    expect(readDocumentDraft(storage, 'ws-one', 'tab-one')).toBeNull();
    expect(readDocumentDraft(storage, 'ws-one', 'tab-two')).toBeNull();
    expect(readDocumentDraft(storage, 'ws-two', 'tab-three')?.content).toBe('three');
  });

  it('restores whichever server or local version is newest', () => {
    const server = documentState('server', 10);
    const local = documentState('local', 11);
    expect(selectNewestDocument(server, local)).toEqual(local);
    expect(selectNewestDocument(documentState('new server', 12), local).content).toBe('new server');
  });
});
