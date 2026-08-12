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
    const html = renderMarkdown('Open /workspace/output/aios-main.png');
    expect(html).toContain('href="/viewer/local?path=%2Fworkspace%2Foutput%2Faios-main.png"');
  });

  it('links home and cwd-relative paths in prose', () => {
    const html = renderMarkdown('Open ~/mockups/main.png, .note/ddd.md, src/app/page.tsx, and README.md.');
    expect(html).toContain('href="/viewer/local?path=~%2Fmockups%2Fmain.png"');
    expect(html).toContain('href="/viewer/local?path=.note%2Fddd.md"');
    expect(html).toContain('href="/viewer/local?path=src%2Fapp%2Fpage.tsx"');
    expect(html).toContain('href="/viewer/local?path=README.md"');
  });

  it('links a relative path when inline code is followed by prose', () => {
    const html = renderMarkdown('문서는 `.note/ddd.md`에 작성했습니다');
    expect(html).toContain('href="/viewer/local?path=.note%2Fddd.md"');
    expect(html).toContain('<code>.note/ddd.md</code>');
  });

  it('links private temporary paths in inline code', () => {
    const html = renderMarkdown('`/private/tmp/aios-chat-session-c2/c2-full.png`');
    expect(html).toContain(
      'href="/viewer/local?path=%2Fprivate%2Ftmp%2Faios-chat-session-c2%2Fc2-full.png"',
    );
    expect(html).toContain('<code>/private/tmp/aios-chat-session-c2/c2-full.png</code>');
  });

  it('does not link inline code containing a command', () => {
    expect(renderMarkdown('`open /tmp/aios-main.png`')).not.toContain('<a ');
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
