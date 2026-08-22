import { getDangerouslySkipPermissions } from '@/lib/config-store';
import { HOOK_SETTINGS_PATH } from '@/lib/hook-settings';

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'"'"'`)}'`;

/** Claude session with purplemux hooks, but no user/project/local customizations. */
export const buildNaiveClaudeCommand = async (mcpConfigs: string[] = []): Promise<string> => {
  const parts = [
    'claude',
    '--setting-sources',
    "''",
    '--strict-mcp-config',
    '--settings',
    shellQuote(HOOK_SETTINGS_PATH),
  ];
  if (mcpConfigs.length > 0) {
    parts.push('--mcp-config', ...mcpConfigs.map(shellQuote));
  }
  if (await getDangerouslySkipPermissions()) {
    parts.push('--dangerously-skip-permissions');
  }
  return parts.join(' ');
};
