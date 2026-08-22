import { describe, expect, it } from 'vitest';
import { buildClaudePromptBody } from '@/lib/claude-prompt';
import { buildCodexPromptBody } from '@/lib/providers/codex/prompt';
import type { IWorkspace } from '@/types/terminal';

const workspace: IWorkspace = {
  id: 'ws-test123',
  name: 'Test',
  directories: ['/tmp/test'],
};

describe('purplemux agent launch prompt', () => {
  it.each([
    ['Claude', buildClaudePromptBody(workspace)],
    ['Codex', buildCodexPromptBody(workspace)],
  ])('gives %s the workspace-aware purplemux launch commands', (_provider, prompt) => {
    expect(prompt).toContain(
      `purplemux tab create -w ws-test123 -t codex-cli -c "node '/Users/donghojo/.purplemux/codex-launcher.js' --workspace-id 'ws-test123'"`,
    );
    expect(prompt).toContain(
      'purplemux tab create -w ws-test123 -t claude-code -c "claude --settings ~/.purplemux/hooks.json --append-system-prompt-file ~/.purplemux/workspaces/ws-test123/claude-prompt.md --dangerously-skip-permissions"',
    );
    expect(prompt).toContain('`inputState`');
    expect(prompt).toContain('`placeholder`');
    expect(prompt).toContain('purplemux workspace delete WS');
    expect(prompt).toContain('purplemux tab answer -w ws-test123 TAB_ID --option N');
    expect(prompt).toContain('persistent delivery queue');
  });
});
