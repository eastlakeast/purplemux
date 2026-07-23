import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TimelineMarkdownLink } from '@/components/features/timeline/timeline-markdown-link';

describe('TimelineMarkdownLink', () => {
  it('renders local file paths with internal viewer URLs', () => {
    const html = renderToStaticMarkup(
      React.createElement(TimelineMarkdownLink, { href: '/tmp/aios-screen-mockup/aios-revised.png' }, 'mockup'),
    );
    expect(html).toContain('href="/viewer/local?path=%2Ftmp%2Faios-screen-mockup%2Faios-revised.png"');
  });
});
