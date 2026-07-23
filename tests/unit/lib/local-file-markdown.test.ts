import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { describe, expect, it } from 'vitest';
import {
  LOCAL_FILE_REHYPE_PLUGINS,
  LOCAL_FILE_REMARK_PLUGINS,
} from '@/lib/local-file-markdown';

describe('local-file-markdown', () => {
  it('renders safe inline HTML and removes scripts', () => {
    const markdown = '<a href="./guide.md">Guide</a><script>alert(1)</script>';
    const html = renderToStaticMarkup(React.createElement(ReactMarkdown, {
      remarkPlugins: LOCAL_FILE_REMARK_PLUGINS,
      rehypePlugins: LOCAL_FILE_REHYPE_PLUGINS,
    }, markdown));

    expect(html).toContain('<a href="./guide.md">Guide</a>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
  });
});
