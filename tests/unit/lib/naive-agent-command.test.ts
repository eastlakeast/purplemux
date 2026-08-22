import { beforeEach, describe, expect, it, vi } from 'vitest';

const config = vi.hoisted(() => ({ getDangerouslySkipPermissions: vi.fn() }));

vi.mock('@/lib/config-store', () => config);
vi.mock('@/lib/hook-settings', () => ({ HOOK_SETTINGS_PATH: "/tmp/purple mux/hooks'file.json" }));

describe('naive Claude launch command', () => {
  beforeEach(() => {
    config.getDangerouslySkipPermissions.mockResolvedValue(false);
  });

  it('disables inherited settings while retaining explicit purplemux hooks and MCPs', async () => {
    const { buildNaiveClaudeCommand } = await import('@/lib/naive-agent-command');
    const command = await buildNaiveClaudeCommand(['/tmp/mcp one.json']);

    expect(command).toContain("--setting-sources ''");
    expect(command).toContain('--strict-mcp-config');
    expect(command).toContain("--settings '/tmp/purple mux/hooks'\"'\"'file.json'");
    expect(command).toContain("--mcp-config '/tmp/mcp one.json'");
    expect(command).not.toContain('--append-system-prompt-file');
  });

  it('preserves the configured permission bypass mode', async () => {
    config.getDangerouslySkipPermissions.mockResolvedValue(true);
    const { buildNaiveClaudeCommand } = await import('@/lib/naive-agent-command');

    expect(await buildNaiveClaudeCommand()).toContain('--dangerously-skip-permissions');
  });
});
