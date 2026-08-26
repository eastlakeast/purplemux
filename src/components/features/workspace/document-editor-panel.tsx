import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Eye, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import FindBar from '@/components/ui/find-bar';
import { cn } from '@/lib/utils';
import { useLayoutStore } from '@/hooks/use-layout';
import {
  readDocumentDraft,
  selectNewestDocument,
  writeDocumentDraft,
} from '@/lib/document-draft';
import { findDocumentSearchMatches } from '@/lib/document-search';
import type { IDocumentState, ITab } from '@/types/terminal';

interface IDocumentEditorPanelProps {
  workspaceId: string;
  paneId: string;
  tab: ITab;
}

type TSaveStatus = 'saved' | 'saving' | 'error';

const AUTOSAVE_DELAY_MS = 250;
const TAB_INSERT = '  ';

const lineAndColumnAt = (content: string, offset: number): { line: number; column: number } => {
  const beforeCursor = content.slice(0, offset);
  const lines = beforeCursor.split('\n');
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
};

const DocumentEditorPanel = ({ workspaceId, paneId, tab }: IDocumentEditorPanelProps) => {
  const t = useTranslations('document');
  const openDocumentPreview = useLayoutStore((state) => state.openDocumentPreview);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const currentSearchMatchRef = useRef<HTMLElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const [documentState, setDocumentState] = useState<IDocumentState>(() => {
    const local = typeof window === 'undefined'
      ? null
      : readDocumentDraft(window.localStorage, workspaceId, tab.id);
    return selectNewestDocument(tab.document, local);
  });
  const documentRef = useRef(documentState);
  const initialServerUpdatedAtRef = useRef(tab.document?.updatedAt ?? 0);
  const [saveStatus, setSaveStatus] = useState<TSaveStatus>('saved');
  const [selectionStart, setSelectionStart] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [editorScroll, setEditorScroll] = useState({ top: 0, left: 0 });

  const persist = useCallback(async (nextDocument: IDocumentState, keepalive = false): Promise<boolean> => {
    if (mountedRef.current) setSaveStatus('saving');
    try {
      const response = await fetch(
        `/api/document/${encodeURIComponent(tab.id)}?workspace=${encodeURIComponent(workspaceId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: nextDocument.content,
            updatedAt: nextDocument.updatedAt,
          }),
          keepalive,
        },
      );
      if (!response.ok) throw new Error();
      if (mountedRef.current) setSaveStatus('saved');
      return true;
    } catch {
      if (mountedRef.current) setSaveStatus('error');
      return false;
    }
  }, [tab.id, workspaceId]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    return persist(documentRef.current);
  }, [persist]);

  const scheduleSave = useCallback((nextDocument: IDocumentState) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus('saving');
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void persist(nextDocument);
    }, AUTOSAVE_DELAY_MS);
  }, [persist]);

  const updateContent = useCallback((content: string, nextSelection?: number) => {
    const nextDocument: IDocumentState = {
      format: 'markdown',
      content,
      updatedAt: Math.max(Date.now(), documentRef.current.updatedAt + 1),
    };
    documentRef.current = nextDocument;
    setDocumentState(nextDocument);
    writeDocumentDraft(window.localStorage, workspaceId, tab.id, nextDocument);
    scheduleSave(nextDocument);
    if (nextSelection !== undefined) {
      requestAnimationFrame(() => {
        textareaRef.current?.setSelectionRange(nextSelection, nextSelection);
        setSelectionStart(nextSelection);
      });
    }
  }, [scheduleSave, tab.id, workspaceId]);

  useEffect(() => {
    mountedRef.current = true;
    const currentDocument = documentRef.current;
    writeDocumentDraft(window.localStorage, workspaceId, tab.id, currentDocument);
    if (currentDocument.updatedAt > initialServerUpdatedAtRef.current) {
      void persist(currentDocument);
    }
    return () => {
      mountedRef.current = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      void fetch(
        `/api/document/${encodeURIComponent(tab.id)}?workspace=${encodeURIComponent(workspaceId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: documentRef.current.content,
            updatedAt: documentRef.current.updatedAt,
          }),
          keepalive: true,
        },
      ).catch(() => {});
    };
  }, [persist, tab.id, workspaceId]);

  useEffect(() => {
    const serverDocument = tab.document;
    if (!serverDocument || serverDocument.updatedAt <= documentRef.current.updatedAt) return;
    documentRef.current = serverDocument;
    setDocumentState(serverDocument);
    writeDocumentDraft(window.localStorage, workspaceId, tab.id, serverDocument);
  }, [tab.document, tab.id, workspaceId]);

  useEffect(() => {
    const saveBeforeSuspend = () => {
      if (window.document.visibilityState === 'hidden') void persist(documentRef.current, true);
    };
    window.addEventListener('pagehide', saveBeforeSuspend);
    window.document.addEventListener('visibilitychange', saveBeforeSuspend);
    return () => {
      window.removeEventListener('pagehide', saveBeforeSuspend);
      window.document.removeEventListener('visibilitychange', saveBeforeSuspend);
    };
  }, [persist]);

  const searchMatches = useMemo(
    () => findDocumentSearchMatches(documentState.content, searchQuery),
    [documentState.content, searchQuery],
  );
  const currentSearchMatch = searchMatches[searchMatchIndex] ?? null;

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    requestAnimationFrame(() => searchInputRef.current?.select());
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchMatchIndex(0);
    requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));
  }, []);

  const updateSearchQuery = useCallback((query: string) => {
    setSearchQuery(query);
    setSearchMatchIndex(0);
  }, []);

  const nextSearchMatch = useCallback(() => {
    setSearchMatchIndex((index) => (
      searchMatches.length === 0 ? 0 : (index + 1) % searchMatches.length
    ));
  }, [searchMatches.length]);

  const previousSearchMatch = useCallback(() => {
    setSearchMatchIndex((index) => (
      searchMatches.length === 0
        ? 0
        : (index - 1 + searchMatches.length) % searchMatches.length
    ));
  }, [searchMatches.length]);

  useEffect(() => {
    setSearchMatchIndex((index) => (
      searchMatches.length === 0 ? 0 : Math.min(index, searchMatches.length - 1)
    ));
  }, [searchMatches.length]);

  useLayoutEffect(() => {
    if (!searchOpen || !currentSearchMatch) return;
    const textarea = textareaRef.current;
    const matchElement = currentSearchMatchRef.current;
    if (!textarea || !matchElement) return;

    textarea.setSelectionRange(currentSearchMatch.start, currentSearchMatch.end);
    setSelectionStart(currentSearchMatch.start);

    const nextScrollTop = Math.max(
      0,
      Math.min(
        textarea.scrollHeight - textarea.clientHeight,
        matchElement.offsetTop - textarea.clientHeight / 2 + matchElement.offsetHeight / 2,
      ),
    );
    textarea.scrollTop = nextScrollTop;
    setEditorScroll({ top: nextScrollTop, left: textarea.scrollLeft });
  }, [currentSearchMatch, searchOpen]);

  const position = lineAndColumnAt(documentState.content, selectionStart);
  const displayName = tab.name || t('untitled');

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-background text-foreground"
      aria-label={t('editorLabel')}
      onKeyDownCapture={(event) => {
        const isFindShortcut = (event.metaKey || event.ctrlKey)
          && !event.altKey
          && (event.code === 'KeyF' || event.key.toLocaleLowerCase() === 'f');
        if (!isFindShortcut) return;
        event.preventDefault();
        event.stopPropagation();
        openSearch();
      }}
    >
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
        <FileText className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 truncate text-xs font-medium">{displayName}</span>
        <span className="text-[11px] text-muted-foreground">{t('markdown')}</span>
        <span
          className={cn(
            'ml-auto text-[11px]',
            saveStatus === 'error' ? 'text-negative' : 'text-muted-foreground',
          )}
          role="status"
          aria-live="polite"
        >
          {t(saveStatus)}
        </span>
        <button
          ref={previewButtonRef}
          type="button"
          className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-indicator active:bg-secondary"
          onClick={async () => {
            if (await flush()) {
              await openDocumentPreview(paneId, tab.id, displayName);
            }
          }}
          aria-label={t('openPreview')}
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t('preview')}</span>
        </button>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {searchOpen && (
          <FindBar
            query={searchQuery}
            onQueryChange={updateSearchQuery}
            matchCount={searchMatches.length}
            currentIndex={searchMatchIndex}
            onNext={nextSearchMatch}
            onPrevious={previousSearchMatch}
            onClose={closeSearch}
            inputRef={searchInputRef}
            labels={{
              placeholder: t('searchPlaceholder'),
              previous: t('searchPrev'),
              next: t('searchNext'),
              close: t('searchClose'),
            }}
          />
        )}

        {searchOpen && searchMatches.length > 0 && (
          <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden="true">
            <div
              className="min-h-full w-full whitespace-pre-wrap break-words px-4 py-3 font-mono text-sm leading-6 text-transparent sm:px-5 sm:py-4"
              style={{ transform: `translate(${-editorScroll.left}px, ${-editorScroll.top}px)` }}
            >
              {searchMatches.map((match, index) => {
                const previousEnd = searchMatches[index - 1]?.end ?? 0;
                return (
                  <span key={`${match.start}:${match.end}`}>
                    {documentState.content.slice(previousEnd, match.start)}
                    <mark
                      ref={index === searchMatchIndex ? currentSearchMatchRef : undefined}
                      className={cn(
                        'rounded-[2px] bg-ui-amber/35 text-transparent',
                        index === searchMatchIndex && 'bg-claude-active/55 outline outline-1 outline-claude-active/70',
                      )}
                    >
                      {documentState.content.slice(match.start, match.end)}
                    </mark>
                    {index === searchMatches.length - 1
                      ? documentState.content.slice(match.end)
                      : null}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <textarea
          ref={textareaRef}
          className="h-full w-full resize-none bg-background px-4 py-3 font-mono text-sm leading-6 text-foreground caret-accent-color outline-none selection:bg-ui-purple/25 placeholder:text-muted-foreground sm:px-5 sm:py-4"
          value={documentState.content}
          readOnly={searchOpen}
          onChange={(event) => updateContent(event.target.value)}
          onSelect={(event) => setSelectionStart(event.currentTarget.selectionStart)}
          onScroll={(event) => setEditorScroll({
            top: event.currentTarget.scrollTop,
            left: event.currentTarget.scrollLeft,
          })}
          onBlur={() => { void flush(); }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
              event.preventDefault();
              void flush();
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              if (searchOpen) closeSearch();
              else previewButtonRef.current?.focus();
              return;
            }
            if (event.key !== 'Tab' || searchOpen) return;
            event.preventDefault();
            const target = event.currentTarget;
            const start = target.selectionStart;
            const end = target.selectionEnd;
            const nextContent = `${documentState.content.slice(0, start)}${TAB_INSERT}${documentState.content.slice(end)}`;
            updateContent(nextContent, start + TAB_INSERT.length);
          }}
          placeholder={t('placeholder')}
          aria-label={t('inputLabel')}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      <footer className="flex h-6 shrink-0 items-center justify-end gap-4 border-t border-border bg-card px-3 text-[11px] text-muted-foreground">
        <span>{t('lineColumn', { line: position.line, column: position.column })}</span>
        <span>{t('markdown')}</span>
        <span>UTF-8</span>
      </footer>
    </section>
  );
};

export default DocumentEditorPanel;
