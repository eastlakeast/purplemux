import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createLogger } from '@/lib/logger';

const log = createLogger('global-rules');

// System-prompt payloads survive context compaction, unlike CLAUDE.md/AGENTS.md
// context injections — this file is the compaction-proof channel for global rules.
export const GLOBAL_RULES_FILE = path.join(os.homedir(), '.purplemux', 'global-rules.md');

const MAX_IMPORT_DEPTH = 3;
const IMPORT_LINE_RE = /^@(\S+)$/;

const expandTilde = (target: string): string =>
  target === '~' || target.startsWith('~/') ? path.join(os.homedir(), target.slice(1)) : target;

const expandImports = async (
  content: string,
  baseDir: string,
  depth: number,
  seen: Set<string>,
): Promise<string> => {
  const out: string[] = [];
  for (const line of content.split('\n')) {
    const match = line.trim().match(IMPORT_LINE_RE);
    if (!match || depth >= MAX_IMPORT_DEPTH) {
      out.push(line);
      continue;
    }
    const target = expandTilde(match[1]);
    const absPath = path.isAbsolute(target) ? target : path.resolve(baseDir, target);
    if (seen.has(absPath)) continue;
    seen.add(absPath);
    let imported: string;
    try {
      imported = await fs.readFile(absPath, 'utf-8');
    } catch {
      log.warn({ path: absPath }, 'global-rules import not readable; skipped');
      continue;
    }
    out.push(await expandImports(imported, path.dirname(absPath), depth + 1, seen));
  }
  return out.join('\n');
};

export const loadGlobalRules = async (filePath: string = GLOBAL_RULES_FILE): Promise<string | null> => {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
  const expanded = (await expandImports(raw, path.dirname(filePath), 0, new Set())).trim();
  return expanded.length > 0 ? expanded : null;
};

export const buildGlobalRulesSection = (rules: string): string =>
  `\n---\n\n# Global rules (injected into the system prompt; survives context compaction)\n\n${rules}\n`;
