import { describe, expect, it } from 'vitest';
import {
  getLocalFileMime,
  isLoopbackAddress,
  resolveLocalFilePath,
  resolveLocalFileRequestPath,
} from '@/lib/local-file-server';

describe('local-file-server', () => {
  it('accepts loopback addresses only', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('192.168.0.10')).toBe(false);
  });

  it('resolves arbitrary absolute local roots', () => {
    expect(resolveLocalFileRequestPath(['tmp', 'docs', 'readme.md']))
      .toBe('/tmp/docs/readme.md');
    expect(resolveLocalFileRequestPath(['tmp', '..', 'etc', 'passwd'])).toBe('/etc/passwd');
    expect(resolveLocalFileRequestPath(['etc', 'passwd'])).toBe('/etc/passwd');
  });

  it('resolves home and cwd-relative paths before serving them', () => {
    expect(resolveLocalFilePath('.note/ddd.md', '/Users/donghojo/workspace/project'))
      .toBe('/Users/donghojo/workspace/project/.note/ddd.md');
    expect(resolveLocalFilePath('../mockup.png', '/tmp/project/output'))
      .toBe('/tmp/project/mockup.png');
    expect(resolveLocalFilePath('~/Documents/notes.md')).toMatch(/\/Documents\/notes\.md$/);
    expect(resolveLocalFilePath('.note/ddd.md')).toBeNull();
  });

  it('returns inline-viewable MIME types', () => {
    expect(getLocalFileMime('/tmp/readme.md')).toBe('text/markdown; charset=utf-8');
    expect(getLocalFileMime('/tmp/mockup.png')).toBe('image/png');
    expect(getLocalFileMime('/tmp/page.html')).toBe('text/html; charset=utf-8');
    expect(getLocalFileMime('/tmp/data.json')).toBe('application/json; charset=utf-8');
  });
});
