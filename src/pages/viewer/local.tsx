import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useTranslations } from 'next-intl';
import ReactMarkdown, { defaultUrlTransform, type UrlTransform } from 'react-markdown';
import { AlertCircle } from 'lucide-react';
import {
  isLocalFilePath,
  localFileName,
  localFilePathToContentUrl,
  localFilePathToViewerUrl,
} from '@/lib/local-file-links';
import { getLocalFileKind, localViewerUrlTransform } from '@/lib/local-file-viewer';
import {
  LOCAL_FILE_REHYPE_PLUGINS,
  LOCAL_FILE_REMARK_PLUGINS,
} from '@/lib/local-file-markdown';
import LocalImageViewer from '@/components/features/workspace/local-image-viewer';

interface ILocalViewerPageProps {
  resolvedPath: string;
}

const LocalViewerPage = ({ resolvedPath }: ILocalViewerPageProps) => {
  const t = useTranslations('webBrowser');
  const validPath = isLocalFilePath(resolvedPath) ? resolvedPath : '';
  const fileName = validPath ? localFileName(validPath) : '';
  const kind = getLocalFileKind(validPath);
  const contentUrl = validPath ? localFilePathToContentUrl(validPath) : '';
  const [content, setContent] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadTextContent = useCallback(async () => {
    if (!contentUrl || !['markdown', 'json', 'text'].includes(kind)) return;
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(contentUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      const raw = await response.text();
      if (kind === 'json') {
        try {
          setContent(JSON.stringify(JSON.parse(raw), null, 2));
        } catch {
          setContent(raw);
        }
      } else {
        setContent(raw);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [contentUrl, kind]);

  useEffect(() => {
    void loadTextContent();
  }, [loadTextContent]);

  const markdownUrlTransform = useMemo<UrlTransform>(() => (url, key) => {
    const transformed = localViewerUrlTransform(validPath, url, key);
    return transformed === url ? defaultUrlTransform(url) : transformed;
  }, [validPath]);

  const renderContent = () => {
    if (!validPath || error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
          <AlertCircle className="h-8 w-8 opacity-60" />
          <p className="text-sm">{t('fileLoadError')}</p>
        </div>
      );
    }

    if (kind === 'image') {
      return (
        <LocalImageViewer
          key={contentUrl}
          contentUrl={contentUrl}
          fileName={fileName}
          onError={() => setError(true)}
        />
      );
    }

    if (kind === 'html' || kind === 'document') {
      return (
        <iframe
          className="h-full w-full border-0 bg-background"
          src={contentUrl}
          title={fileName}
          sandbox="allow-scripts allow-forms allow-modals allow-popups"
          onError={() => setError(true)}
        />
      );
    }

    if (loading) {
      return <div className="mx-auto w-full max-w-[72ch] animate-pulse space-y-3 px-6 py-12">
        <div className="h-7 w-2/3 rounded bg-muted" />
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-5/6 rounded bg-muted" />
      </div>;
    }

    if (kind === 'markdown') {
      return (
        <article className="prose prose-neutral dark:prose-invert mx-auto w-full max-w-[72ch] px-6 py-10 sm:px-10 sm:py-12 [&_a]:text-accent-color [&_a]:no-underline hover:[&_a]:underline [&_blockquote]:border-border [&_code]:font-mono [&_code]:font-normal [&_code::after]:content-none [&_code::before]:content-none [&_h1]:text-balance [&_h2]:text-balance [&_h3]:text-balance [&_img]:rounded-md [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-4 [&_table]:block [&_table]:overflow-x-auto">
          <ReactMarkdown
            remarkPlugins={LOCAL_FILE_REMARK_PLUGINS}
            rehypePlugins={LOCAL_FILE_REHYPE_PLUGINS}
            urlTransform={markdownUrlTransform}
          >
            {content}
          </ReactMarkdown>
        </article>
      );
    }

    return (
      <pre className="mx-auto min-h-full w-full max-w-[100ch] overflow-auto whitespace-pre-wrap break-words px-6 py-10 font-mono text-sm leading-6 text-foreground sm:px-10">
        {content}
      </pre>
    );
  };

  return (
    <>
      <Head>
        <title>{fileName || 'Local file'} - purplemux</title>
      </Head>
      <div className="h-screen overflow-auto bg-background text-foreground">
        {renderContent()}
      </div>
    </>
  );
};

export const getServerSideProps: GetServerSideProps<ILocalViewerPageProps> = async ({ query }) => {
  const { loadMessagesServer } = await import('@/lib/load-messages');
  const { resolveLocalFilePath } = await import('@/lib/local-file-server');
  const filePath = typeof query.path === 'string' ? query.path : '';
  const basePath = typeof query.base === 'string' ? query.base : undefined;
  const resolvedPath = resolveLocalFilePath(filePath, basePath) ?? '';
  if (resolvedPath && resolvedPath !== filePath) {
    return {
      redirect: {
        destination: localFilePathToViewerUrl(resolvedPath),
        permanent: false,
      },
    };
  }
  const messages = await loadMessagesServer();
  return { props: { messages, resolvedPath } };
};

export default LocalViewerPage;
