import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';
import { remarkLocalFileLinks } from '@/lib/remark-local-file-links';
import { timelineUrlTransform } from '@/lib/timeline-markdown-url';
import { TimelineMarkdownLink } from '@/components/features/timeline/timeline-markdown-link';
import { TimelineMarkdownPre } from '@/components/features/timeline/timeline-markdown-pre';

const renderMarkdown = (markdown: string): string =>
  renderToStaticMarkup(
    React.createElement(
      ReactMarkdown,
      {
        remarkPlugins: [remarkGfm, remarkLocalFileLinks],
        urlTransform: timelineUrlTransform,
        components: {
          a: TimelineMarkdownLink,
          pre: TimelineMarkdownPre,
        },
      },
      markdown,
    ),
  );

describe('remarkLocalFileLinks', () => {
  it('links bare local file paths and opens them in the internal viewer', () => {
    const html = renderMarkdown('Open /tmp/aios-screen-mockup/aios-main.png');
    expect(html).toContain('href="/viewer/local?path=%2Ftmp%2Faios-screen-mockup%2Faios-main.png"');
  });

  it('does not link app-relative paths or inline code', () => {
    expect(renderMarkdown('Open /api/timeline/entries')).not.toContain('<a ');
    expect(renderMarkdown('`/tmp/aios-main.png`')).not.toContain('<a ');
  });

  it('links local file paths inside code blocks', () => {
    const html = renderMarkdown([
      '```',
      '/tmp/aios-chat-session-tabs-dark.png',
      '/tmp/aios-chat-session-tabs-light.png',
      '```',
    ].join('\n'));

    expect(html).toContain('href="/viewer/local?path=%2Ftmp%2Faios-chat-session-tabs-dark.png"');
    expect(html).toContain('href="/viewer/local?path=%2Ftmp%2Faios-chat-session-tabs-light.png"');
    expect(html).toContain('<pre><code>');
  });

  it('rewrites existing localhost local-file links', () => {
    const html = renderMarkdown('[mockup](http://localhost:8022/tmp/aios-main.png)');
    expect(html).toContain('href="/viewer/local?path=%2Ftmp%2Faios-main.png"');
    expect(html).toContain('>mockup</a>');
  });
});
