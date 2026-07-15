import { describe, it, expect } from 'vitest';
import { htmlToMarkdown } from '@/lib/selection-markdown';

describe('htmlToMarkdown', () => {
  it('preserves headings, emphasis, and links', () => {
    const md = htmlToMarkdown('<h2>Title</h2><p>Some <strong>bold</strong> and <a href="https://x.com">link</a>.</p>');
    expect(md).toContain('## Title');
    expect(md).toContain('**bold**');
    expect(md).toContain('[link](https://x.com)');
  });

  it('preserves fenced code blocks with language, stripping highlight spans', () => {
    const html = '<pre><code class="hljs language-js"><span class="hljs-keyword">const</span> x = <span class="hljs-number">1</span>;</code></pre>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('```js');
    expect(md).toContain('const x = 1;');
    expect(md).not.toContain('hljs');
    expect(md).not.toContain('<span');
  });

  it('preserves GFM tables', () => {
    const html = '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('| A | B |');
    expect(md).toContain('| 1 | 2 |');
  });

  it('preserves unordered lists', () => {
    const md = htmlToMarkdown('<ul><li>item 1</li><li>item 2</li></ul>');
    expect(md).toMatch(/item 1/);
    expect(md).toMatch(/item 2/);
    expect(md.split('\n').filter((l) => l.trim().startsWith('-'))).toHaveLength(2);
  });

  it('returns empty string for empty input', () => {
    expect(htmlToMarkdown('')).toBe('');
    expect(htmlToMarkdown('   ')).toBe('');
  });
});
