import fs from 'fs/promises';
import { watch, type FSWatcher } from 'fs';
import path from 'path';
import os from 'os';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import type { ISessionInfo } from '@/types/timeline';
import type { ISessionWatcher } from '@/lib/providers/types';
import { getShellPath } from '@/lib/preflight';
import {
  getChildPids,
  getProcessArgs,
  getProcessCwd,
  isProcessRunning,
} from '@/lib/process-utils';

const execFile = promisify(execFileCb);

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SESSIONS_DIR = path.join(CLAUDE_DIR, 'sessions');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const CLAUDE_KNOWN_PATHS = [path.join(os.homedir(), '.local', 'bin', 'claude')];
const PID_POLL_INTERVAL = 10_000;
const SESSION_DIR_DEBOUNCE = 200;
const INSTALL_CHECK_INTERVAL = 60_000;

interface IPidFileData {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  kind?: string;
  jobId?: string;
  parkedJobId?: string;
  updatedAt?: number;
}

interface IPidFileRecord {
  filePath: string;
  data: IPidFileData;
}

const MAX_SANITIZED_LENGTH = 200;

const simpleHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
};

export const toClaudeProjectName = (dirPath: string): string => {
  const sanitized = dirPath.replace(/[^a-zA-Z0-9]/g, '-');
  if (sanitized.length <= MAX_SANITIZED_LENGTH) {
    return sanitized;
  }
  const hash = simpleHash(dirPath);
  return `${sanitized.slice(0, MAX_SANITIZED_LENGTH)}-${hash}`;
};

const getClaudeSessionFromArgs = async (
  childPids: number[],
): Promise<{ pid: number; sessionId: string; cwd: string | null } | null> => {
  for (const pid of childPids) {
    const args = await getProcessArgs(pid);
    if (!args) continue;
    const match = args.match(/claude\s+--resume\s+([0-9a-f-]{36})/);
    if (match) {
      const cwd = await getProcessCwd(pid);
      return { pid, sessionId: match[1], cwd };
    }
  }
  return null;
};

const readPidFile = async (filePath: string): Promise<IPidFileData | null> => {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.pid || !data.sessionId) return null;
    return data as IPidFileData;
  } catch {
    return null;
  }
};

const readPidFileRecord = async (filePath: string): Promise<IPidFileRecord | null> => {
  const data = await readPidFile(filePath);
  return data ? { filePath, data } : null;
};

const orderSessionCandidates = (
  records: IPidFileRecord[],
  childPidSet: Set<number>,
): IPidFileRecord[] => {
  const interactive = records.filter(({ data }) => childPidSet.has(data.pid));
  const parkedJobIds = new Set(
    interactive.flatMap(({ data }) => data.parkedJobId ? [data.parkedJobId] : []),
  );
  const parked = records
    .filter(({ data }) => data.kind === 'bg' && !!data.jobId && parkedJobIds.has(data.jobId))
    .sort((a, b) => (b.data.updatedAt ?? b.data.startedAt) - (a.data.updatedAt ?? a.data.startedAt));

  return [...parked, ...interactive.filter((record) => !parked.includes(record))];
};

const findJsonlPath = async (projectDir: string, sessionId: string): Promise<string | null> => {
  const jsonlPath = path.join(projectDir, `${sessionId}.jsonl`);
  try {
    await fs.access(jsonlPath);
    return jsonlPath;
  } catch {
    return null;
  }
};

const isClaudeInstalled = async (): Promise<boolean> => {
  try {
    await execFile('claude', ['--version'], { timeout: 5000, env: { ...process.env, PATH: await getShellPath() } });
    return true;
  } catch {
    for (const p of CLAUDE_KNOWN_PATHS) {
      try {
        await fs.access(p);
        return true;
      } catch {
        // not found
      }
    }
    return false;
  }
};

export const isClaudeRunning = async (panePid: number, preloadedChildPids?: number[]): Promise<boolean> => {
  const childPids = preloadedChildPids ?? await getChildPids(panePid);
  for (const pid of childPids) {
    const args = await getProcessArgs(pid);
    if (args?.includes('claude')) return true;
  }
  return false;
};

export const detectActiveSession = async (panePid: number, preloadedChildPids?: number[]): Promise<ISessionInfo> => {
  try {
    await fs.access(CLAUDE_DIR);
  } catch {
    const installed = await isClaudeInstalled();
    const status = installed ? 'not-initialized' : 'not-installed';
    return { status, sessionId: null, jsonlPath: null, pid: null, startedAt: null, cwd: null };
  }

  const directChildPids = preloadedChildPids ?? await getChildPids(panePid);

  if (directChildPids.length === 0) {
    return { status: 'not-running', sessionId: null, jsonlPath: null, pid: null, startedAt: null, cwd: null };
  }

  // Claude CLI may spawn a child process (e.g. for --resume), so the session
  // PID file can belong to a grandchild of the pane. Include one extra level.
  const grandchildPids = (await Promise.all(directChildPids.map(getChildPids))).flat();
  const allPids = [...directChildPids, ...grandchildPids];
  const childPidSet = new Set(allPids);

  try {
    let records = (await Promise.all(
      allPids.map((pid) => readPidFileRecord(path.join(SESSIONS_DIR, `${pid}.json`))),
    )).filter((record): record is IPidFileRecord => record !== null);

    if (records.length === 0 || records.some(({ data }) => data.parkedJobId)) {
      const knownPaths = new Set(records.map(({ filePath }) => filePath));
      const pidFiles = await fs.readdir(SESSIONS_DIR);
      const additional = await Promise.all(
        pidFiles
          .filter((file) => file.endsWith('.json'))
          .map((file) => path.join(SESSIONS_DIR, file))
          .filter((filePath) => !knownPaths.has(filePath))
          .map(readPidFileRecord),
      );
      records = [
        ...records,
        ...additional.filter((record): record is IPidFileRecord => record !== null),
      ];
    }

    for (const { filePath, data } of orderSessionCandidates(records, childPidSet)) {
      const processArgs = await getProcessArgs(data.pid);
      if (processArgs === null) {
        try { await fs.unlink(filePath); } catch {}
        continue;
      }

      if (!processArgs.includes('claude')) {
        try { await fs.unlink(filePath); } catch {}
        continue;
      }

      const projectName = toClaudeProjectName(data.cwd);
      const projectDir = path.join(PROJECTS_DIR, projectName);
      let jsonlPath = await findJsonlPath(projectDir, data.sessionId);
      let effectiveSessionId = data.sessionId;

      if (!jsonlPath && data.kind !== 'bg') {
        const resumeMatch = processArgs.match(/--resume\s+([0-9a-f-]{36})/);
        if (resumeMatch) {
          const resumeSessionId = resumeMatch[1];
          const resumeJsonlPath = await findJsonlPath(projectDir, resumeSessionId);
          if (resumeJsonlPath) {
            jsonlPath = resumeJsonlPath;
            effectiveSessionId = resumeSessionId;
          }
        }
      }

      return {
        status: 'running',
        sessionId: effectiveSessionId,
        jsonlPath,
        pid: data.pid,
        startedAt: data.startedAt,
        cwd: data.cwd,
      };
    }
  } catch {
    // sessions dir doesn't exist yet
  }

  const fromArgs = await getClaudeSessionFromArgs(allPids);
  if (fromArgs) {
    const cwd = fromArgs.cwd;
    if (cwd) {
      const projectName = toClaudeProjectName(cwd);
      const projectDir = path.join(PROJECTS_DIR, projectName);
      const jsonlPath = await findJsonlPath(projectDir, fromArgs.sessionId);
      return {
        status: 'running',
        sessionId: fromArgs.sessionId,
        jsonlPath,
        pid: fromArgs.pid,
        startedAt: null,
        cwd,
      };
    }
  }

  return { status: 'not-running', sessionId: null, jsonlPath: null, pid: null, startedAt: null, cwd: null };
};

export const watchSessionsDir = (
  panePid: number,
  onChange: (info: ISessionInfo) => void,
  options?: { skipInitial?: boolean },
): ISessionWatcher => {
  let watcher: FSWatcher | null = null;
  let pidPollTimer: ReturnType<typeof setInterval> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let installCheckTimer: ReturnType<typeof setInterval> | null = null;
  let currentPid: number | null = null;
  let stopped = false;

  const pollPid = async () => {
    if (stopped || !currentPid) return;
    const running = await isProcessRunning(currentPid);
    if (!running && !stopped) {
      currentPid = null;
      const info = await detectActiveSession(panePid);
      onChange(info);
    }
  };

  const handleSessionDirChange = () => {
    if (stopped) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (stopped) return;
      const info = await detectActiveSession(panePid);
      if (info.pid) currentPid = info.pid;
      onChange(info);
    }, SESSION_DIR_DEBOUNCE);
  };

  const tryWatch = () => {
    if (stopped) return;
    try {
      watcher = watch(SESSIONS_DIR, handleSessionDirChange);
      watcher.on('error', () => {});
      if (installCheckTimer) {
        clearInterval(installCheckTimer);
        installCheckTimer = null;
      }
    } catch {
      if (!installCheckTimer) {
        installCheckTimer = setInterval(async () => {
          if (stopped) return;
          try {
            await fs.access(SESSIONS_DIR);
            tryWatch();
            const info = await detectActiveSession(panePid);
            if (info.pid) currentPid = info.pid;
            onChange(info);
          } catch {}
        }, INSTALL_CHECK_INTERVAL);
      }
    }
  };

  tryWatch();
  pidPollTimer = setInterval(pollPid, PID_POLL_INTERVAL);

  if (!options?.skipInitial) {
    detectActiveSession(panePid).then((info) => {
      if (stopped) return;
      if (info.pid) currentPid = info.pid;
      onChange(info);
    });
  }

  return {
    stop: () => {
      stopped = true;
      if (watcher) watcher.close();
      if (pidPollTimer) clearInterval(pidPollTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (installCheckTimer) clearInterval(installCheckTimer);
    },
  };
};
