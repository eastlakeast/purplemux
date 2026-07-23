import { describe, expect, it } from 'vitest';
import { buildCliShim } from '@/lib/cli-shim';

describe('CLI shim', () => {
  it('launches the packaged CLI through Electron in Node mode', () => {
    const body = buildCliShim({
      executablePath: '/Applications/purplemux.app/Contents/MacOS/purplemux',
      appDir: '/Applications/purplemux.app/Contents/Resources/app.asar',
      electron: true,
    });

    expect(body).toContain('export ELECTRON_RUN_AS_NODE=1');
    expect(body).toContain("'/Applications/purplemux.app/Contents/Resources/app.asar/bin/purplemux.js'");
    expect(body).toContain('"$@"');
  });

  it('does not enable Electron Node mode for the source CLI', () => {
    const body = buildCliShim({
      executablePath: '/usr/local/bin/node',
      appDir: '/workspace/purplemux',
      electron: false,
    });

    expect(body).not.toContain('ELECTRON_RUN_AS_NODE');
    expect(body).toContain("'/workspace/purplemux/bin/purplemux.js'");
  });
});
