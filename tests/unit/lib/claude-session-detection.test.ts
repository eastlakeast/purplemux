import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockHome = vi.hoisted(() => ({ value: '' }));
const processUtils = vi.hoisted(() => ({
  getChildPids: vi.fn(),
  getProcessArgs: vi.fn(),
  getProcessCwd: vi.fn(),
  isProcessRunning: vi.fn(),
}));

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    default: { ...actual, homedir: () => mockHome.value },
    homedir: () => mockHome.value,
  };
});

vi.mock('@/lib/process-utils', () => processUtils);

const MAIN_SESSION_ID = '11111111-1111-4111-8111-111111111111';
const PARKED_SESSION_ID = '22222222-2222-4222-8222-222222222222';
const CWD = '/tmp/project';

const writeSessionFixture = async (
  pid: number,
  sessionId: string,
  extra: Record<string, unknown>,
) => {
  const sessionsDir = path.join(mockHome.value, '.claude', 'sessions');
  const projectDir = path.join(mockHome.value, '.claude', 'projects', '-tmp-project');
  await fs.mkdir(sessionsDir, { recursive: true });
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(path.join(sessionsDir, `${pid}.json`), JSON.stringify({
    pid,
    sessionId,
    cwd: CWD,
    startedAt: pid,
    ...extra,
  }));
  const jsonlPath = path.join(projectDir, `${sessionId}.jsonl`);
  await fs.writeFile(jsonlPath, '{}\n');
  return jsonlPath;
};

describe('Claude active session detection', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockHome.value = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-claude-home-'));
    processUtils.getChildPids.mockImplementation(async (pid: number) => {
      if (pid === 999) return [100];
      if (pid === 100) return [200];
      return [];
    });
    processUtils.getProcessArgs.mockResolvedValue('claude');
  });

  it('follows the live background session linked by parkedJobId', async () => {
    await writeSessionFixture(100, MAIN_SESSION_ID, {
      kind: 'interactive',
      parkedJobId: 'job-1',
      updatedAt: 100,
    });
    const parkedPath = await writeSessionFixture(400, PARKED_SESSION_ID, {
      kind: 'bg',
      jobId: 'job-1',
      updatedAt: 400,
    });

    const { detectActiveSession } = await import('@/lib/providers/claude/session-detection');
    const result = await detectActiveSession(999);

    expect(result).toMatchObject({
      status: 'running',
      sessionId: PARKED_SESSION_ID,
      jsonlPath: parkedPath,
      pid: 400,
      cwd: CWD,
    });
  });

  it('falls back to the interactive session when the parked process is stale', async () => {
    const mainPath = await writeSessionFixture(100, MAIN_SESSION_ID, {
      kind: 'interactive',
      parkedJobId: 'job-1',
      updatedAt: 100,
    });
    await writeSessionFixture(400, PARKED_SESSION_ID, {
      kind: 'bg',
      jobId: 'job-1',
      updatedAt: 400,
    });
    processUtils.getProcessArgs.mockImplementation(async (pid: number) =>
      pid === 400 ? null : 'claude');

    const { detectActiveSession } = await import('@/lib/providers/claude/session-detection');
    const result = await detectActiveSession(999);

    expect(result).toMatchObject({
      status: 'running',
      sessionId: MAIN_SESSION_ID,
      jsonlPath: mainPath,
      pid: 100,
      cwd: CWD,
    });
  });
});
