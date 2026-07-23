import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const MANAGED_MARKER = '# Managed by purplemux. Changes will be replaced.';

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'"'"'`)}'`;

export const buildCliShim = (options: {
  executablePath: string;
  appDir: string;
  electron: boolean;
}): string => {
  const command = [
    'exec',
    shellQuote(options.executablePath),
    shellQuote(path.join(options.appDir, 'bin', 'purplemux.js')),
    '"$@"',
  ].join(' ');
  return [
    '#!/bin/sh',
    MANAGED_MARKER,
    ...(options.electron ? ['export ELECTRON_RUN_AS_NODE=1'] : []),
    command,
    '',
  ].join('\n');
};

const writeManagedShim = async (filePath: string, body: string, replaceExisting: boolean): Promise<boolean> => {
  if (!replaceExisting) {
    try {
      const current = await fs.readFile(filePath, 'utf-8');
      if (!current.includes(MANAGED_MARKER)) return false;
    } catch {
      // Missing files are created below.
    }
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, body, { encoding: 'utf-8', mode: 0o755 });
  await fs.chmod(filePath, 0o755);
  return true;
};

export const ensureCliShim = async (): Promise<string[]> => {
  const home = os.homedir();
  const appDir = process.env.__PMUX_APP_DIR || process.cwd();
  const body = buildCliShim({
    executablePath: process.execPath,
    appDir,
    electron: Boolean(process.versions.electron),
  });
  const installed: string[] = [];
  const canonicalDir = path.join(home, '.purplemux', 'bin');
  const pathDir = path.join(home, '.local', 'bin');

  for (const name of ['purplemux', 'pmux']) {
    const canonicalPath = path.join(canonicalDir, name);
    await writeManagedShim(canonicalPath, body, true);
    installed.push(canonicalPath);

    const pathShim = path.join(pathDir, name);
    if (await writeManagedShim(pathShim, body, false)) installed.push(pathShim);
  }
  return installed;
};
