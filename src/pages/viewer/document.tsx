import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useTranslations } from 'next-intl';
import { AlertCircle, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {
  LOCAL_FILE_REHYPE_PLUGINS,
  LOCAL_FILE_REMARK_PLUGINS,
} from '@/lib/local-file-markdown';
import type { IDocumentState } from '@/types/terminal';

interface IDocumentViewerPageProps {
  workspaceId: string;
  tabId: string;
}

const DocumentViewerPage = ({ workspaceId, tabId }: IDocumentViewerPageProps) => {
  const t = useTranslations('document');
  const [document, setDocument] = useState<IDocumentState | null>(null);
  const [error, setError] = useState(false);

  const loadDocument = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/document/${encodeURIComponent(tabId)}?workspace=${encodeURIComponent(workspaceId)}`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error();
      const payload = await response.json() as { document: IDocumentState };
      setDocument((current) =>
        !current || payload.document.updatedAt >= current.updatedAt ? payload.document : current,
      );
      setError(false);
    } catch {
      setError(true);
    }
  }, [tabId, workspaceId]);

  useEffect(() => {
    void loadDocument();
    const timer = window.setInterval(() => { void loadDocument(); }, 750);
    return () => window.clearInterval(timer);
  }, [loadDocument]);

  return (
    <>
      <Head>
        <title>{t('previewTitle')} - purplemux</title>
      </Head>
      <main className="min-h-screen bg-background text-foreground">
        {error ? (
          <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-muted-foreground">
            <AlertCircle className="h-8 w-8 opacity-60" aria-hidden="true" />
            <p className="text-sm">{t('loadFailed')}</p>
          </div>
        ) : document && !document.content.trim() ? (
          <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-muted-foreground">
            <FileText className="h-8 w-8 opacity-50" aria-hidden="true" />
            <p className="text-sm">{t('emptyPreview')}</p>
          </div>
        ) : document ? (
          <article className="prose prose-neutral dark:prose-invert mx-auto w-full max-w-[72ch] px-6 py-10 sm:px-10 sm:py-12 [&_a]:text-accent-color [&_a]:underline-offset-4 [&_blockquote]:border-border [&_code]:font-mono [&_code]:font-normal [&_code::after]:content-none [&_code::before]:content-none [&_h1]:text-balance [&_h2]:text-balance [&_h3]:text-balance [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-4 [&_table]:block [&_table]:overflow-x-auto">
            <ReactMarkdown
              remarkPlugins={LOCAL_FILE_REMARK_PLUGINS}
              rehypePlugins={LOCAL_FILE_REHYPE_PLUGINS}
            >
              {document.content}
            </ReactMarkdown>
          </article>
        ) : (
          <div className="mx-auto w-full max-w-[72ch] animate-pulse space-y-3 px-6 py-12">
            <div className="h-7 w-2/3 rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-4 w-5/6 rounded bg-muted" />
          </div>
        )}
      </main>
    </>
  );
};

export const getServerSideProps: GetServerSideProps<IDocumentViewerPageProps> = async ({ query }) => {
  const { loadMessagesServer } = await import('@/lib/load-messages');
  const workspaceId = typeof query.workspace === 'string' ? query.workspace : '';
  const tabId = typeof query.tab === 'string' ? query.tab : '';
  const messages = await loadMessagesServer();
  return { props: { messages, workspaceId, tabId } };
};

export default DocumentViewerPage;
