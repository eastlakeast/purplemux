import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildGlobalRulesSection, loadGlobalRules } from '@/lib/global-rules';

describe('global rules', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pmux-global-rules-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const write = (name: string, content: string) =>
    fs.writeFile(path.join(dir, name), content, 'utf-8');

  it('returns null when the rules file is absent or empty', async () => {
    expect(await loadGlobalRules(path.join(dir, 'missing.md'))).toBeNull();
    await write('empty.md', '  \n\n');
    expect(await loadGlobalRules(path.join(dir, 'empty.md'))).toBeNull();
  });

  it('expands @-import lines recursively, relative to the importing file', async () => {
    await write('rules.md', '# top\n@child.md\ntail');
    await write('child.md', 'child body\n@nested.md');
    await write('nested.md', 'nested body');
    expect(await loadGlobalRules(path.join(dir, 'rules.md'))).toBe(
      '# top\nchild body\nnested body\ntail',
    );
  });

  it('skips unreadable imports and keeps the rest', async () => {
    await write('rules.md', 'before\n@nope.md\nafter');
    expect(await loadGlobalRules(path.join(dir, 'rules.md'))).toBe('before\nafter');
  });

  it('includes each file once even with import cycles', async () => {
    await write('a.md', 'A\n@b.md');
    await write('b.md', 'B\n@a.md');
    await write('rules.md', '@a.md');
    expect(await loadGlobalRules(path.join(dir, 'rules.md'))).toBe('A\nB');
  });

  it('leaves import lines literal beyond the depth cap', async () => {
    await write('rules.md', '@d1.md');
    await write('d1.md', '@d2.md');
    await write('d2.md', '@d3.md');
    await write('d3.md', '@d4.md');
    await write('d4.md', 'too deep');
    expect(await loadGlobalRules(path.join(dir, 'rules.md'))).toBe('@d4.md');
  });

  it('wraps rules in a compaction-note section', () => {
    const section = buildGlobalRulesSection('RULES');
    expect(section).toContain('# Global rules');
    expect(section).toContain('RULES');
  });
});
