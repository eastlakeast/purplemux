import { describe, expect, it } from 'vitest';
import {
  getLocalFileMime,
  isLoopbackAddress,
  resolveLocalFileRequestPath,
} from '@/lib/local-file-server';

describe('local-file-server', () => {
  it('accepts loopback addresses only', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('192.168.0.10')).toBe(false);
  });

  it('resolves only allowed local roots', () => {
    expect(resolveLocalFileRequestPath(['tmp', 'docs', 'readme.md']))
      .toBe('/tmp/docs/readme.md');
    expect(resolveLocalFileRequestPath(['tmp', '..', 'etc', 'passwd'])).toBeNull();
    expect(resolveLocalFileRequestPath(['etc', 'passwd'])).toBeNull();
  });

  it('returns inline-viewable MIME types', () => {
    expect(getLocalFileMime('/tmp/readme.md')).toBe('text/markdown; charset=utf-8');
    expect(getLocalFileMime('/tmp/mockup.png')).toBe('image/png');
    expect(getLocalFileMime('/tmp/page.html')).toBe('text/html; charset=utf-8');
    expect(getLocalFileMime('/tmp/data.json')).toBe('application/json; charset=utf-8');
  });
});
