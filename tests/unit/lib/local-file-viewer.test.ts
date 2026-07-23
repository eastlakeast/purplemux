import { describe, expect, it } from 'vitest';
import {
  getLocalFileKind,
  localViewerUrlTransform,
  resolveLocalFileReference,
} from '@/lib/local-file-viewer';

describe('local-file-viewer', () => {
  it('classifies local files by extension', () => {
    expect(getLocalFileKind('/tmp/readme.md')).toBe('markdown');
    expect(getLocalFileKind('/tmp/mockup.png')).toBe('image');
    expect(getLocalFileKind('/tmp/page.html')).toBe('html');
    expect(getLocalFileKind('/tmp/data.json')).toBe('json');
    expect(getLocalFileKind('/tmp/archive.zip')).toBe('document');
  });

  it('resolves references relative to the markdown file', () => {
    expect(resolveLocalFileReference('/tmp/docs/readme.md', '../images/mockup.png#preview'))
      .toEqual({ filePath: '/tmp/images/mockup.png', suffix: '#preview' });
  });

  it('maps relative markdown documents and images to internal routes', () => {
    expect(localViewerUrlTransform('/tmp/docs/readme.md', './guide.md', 'href'))
      .toBe('/viewer/local?path=%2Ftmp%2Fdocs%2Fguide.md');
    expect(localViewerUrlTransform('/tmp/docs/readme.md', './mockup.png', 'src'))
      .toBe('/api/local-file/tmp/docs/mockup.png');
    expect(localViewerUrlTransform('/tmp/docs/readme.md', './data.json', 'href'))
      .toBe('/viewer/local?path=%2Ftmp%2Fdocs%2Fdata.json');
  });

  it('leaves anchors and remote URLs unchanged', () => {
    expect(localViewerUrlTransform('/tmp/readme.md', '#section', 'href')).toBe('#section');
    expect(localViewerUrlTransform('/tmp/readme.md', 'https://example.com', 'href'))
      .toBe('https://example.com');
  });
});
