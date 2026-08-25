import fs from 'fs/promises';
import path from 'path';
import { buildGlobalRulesSection, loadGlobalRules } from '@/lib/global-rules';
import { resolveLayoutDir } from '@/lib/layout-store';
import type { IWorkspace } from '@/types/terminal';

export const getClaudePromptPath = (workspaceId: string): string =>
  path.join(resolveLayoutDir(workspaceId), 'claude-prompt.md');

export const buildClaudePromptBody = (ws: IWorkspace): string => {
  return `# purplemux context

You are running inside a purplemux workspace tab.

- **Workspace ID**: \`${ws.id}\`

Use \`purplemux workspaces\` if you need the workspace name or directories.

## purplemux CLI

The \`purplemux\` CLI lets you inspect and control other tabs in this workspace.
It reads port and token from \`~/.purplemux/{port,cli-token}\` automatically,
so no environment setup is needed.

### Commands

\`\`\`bash
purplemux workspaces                                # list all workspaces
purplemux workspace create -n NAME [-g GROUP_PATH] [-d DIR]... [--worker TYPE] [--worker-name NAME] [--json]  # create workspace; optionally launch its only tab as a worker
purplemux workspace rename WS NEW_NAME              # rename a workspace
purplemux workspace delete WS                       # delete a workspace and its tabs
purplemux tab list -w ${ws.id}                        # list tabs in this workspace
purplemux tab create -w ${ws.id} [-n NAME] [-t TYPE] [-c CMD]  # create a tab (type: terminal | claude-code | codex-cli | agent-sessions | web-browser | diff)
purplemux tab create -w ${ws.id} --preset naive [--mcp-config FILE]... # clean Claude worker with purplemux hooks
purplemux tab rename -w ${ws.id} TAB_ID NEW_NAME      # rename a tab
purplemux tab send -w ${ws.id} TAB_ID CONTENT...      # send input to a tab
purplemux tab send -w ${ws.id} TAB_ID --replace CONTENT... # replace typed input and send
purplemux tab clear -w ${ws.id} TAB_ID                 # clear unsubmitted input
purplemux tab keys -w ${ws.id} TAB_ID KEY...           # send interactive keys
purplemux tab answer -w ${ws.id} TAB_ID --option N     # answer AskUserQuestion (1-based)
purplemux tab status -w ${ws.id} TAB_ID               # tab status
purplemux tab result -w ${ws.id} TAB_ID               # capture current pane content
purplemux tab watch -w ${ws.id} TAB_ID                # stream state transitions
purplemux tab close -w ${ws.id} TAB_ID                # close a tab
purplemux usage                                    # Claude/Codex usage and reset times
\`\`\`

If this workspace belongs to an enabled group agent team, these commands
automatically identify the current workspace and tab:

\`\`\`bash
purplemux team show                         # members, aliases, and your role
purplemux team send TARGET CONTENT...       # orchestrator: dispatch to an alias or all
purplemux team status [TARGET]              # inspect member status
purplemux team result TARGET                # capture a member's current pane
purplemux team reply CONTENT...             # worker: report to the orchestrator
purplemux team inbox                        # orchestrator: inspect queued reports
\`\`\`

Use team aliases instead of provider session IDs. Team tasks may arrive while
you are busy and be queued as normal purplemux input. Worker replies use a
persistent delivery queue, so the orchestrator's current input overlay does not
block reporting. Workers should use \`purplemux team reply\` for completion
reports, blockers, and questions.

Before sending input to another Claude Code tab, use \`tab status\` or \`tab result\`
and read \`inputState\`. \`empty\` and \`placeholder\` are safe to send. \`typed\`
means the user has unsubmitted input. \`unknown\` and \`unavailable\` are blocked
while idle, but guarded sends accept them while the agent is \`busy\` so the
message can be queued. Do not infer input occupancy from
visible text: Claude Code renders its suggested prompt as text, but purplemux reports
it as \`placeholder\`. Send commands enforce this check immediately before delivery.

For the full HTTP API reference (including endpoint paths and payloads),
run:

\`\`\`bash
purplemux api-guide
\`\`\`

### When to use

- Delegate work to another tab when a task benefits from isolation
  (long-running builds, different project context, parallel exploration).
- Poll \`status\` and read \`result\` to verify delegated work.
- Prefer small, scoped tabs over cramming everything into one session.
- When creating a new workspace for a worker, initialize its single default tab
  with \`workspace create --worker\`. Use \`--json\` to capture both the workspace
  ID and \`initialTab.tabId\`; do not create a redundant second tab.
- When adding a worker to an existing workspace, create a purplemux tab with the
  matching full launch command below. Do not run plain \`codex\`, plain \`claude\`,
  or the launcher directly inside a terminal tab.

\`\`\`bash
purplemux workspace create -n NAME -d DIR --worker codex-cli --worker-name NAME --json
purplemux workspace create -n NAME -d DIR --worker claude-code --worker-name NAME --json
purplemux tab create -w ${ws.id} -t codex-cli -c "node '/Users/donghojo/.purplemux/codex-launcher.js' --workspace-id '${ws.id}'"
purplemux tab create -w ${ws.id} -t claude-code -c "claude --settings ~/.purplemux/hooks.json --append-system-prompt-file ~/.purplemux/workspaces/${ws.id}/claude-prompt.md --dangerously-skip-permissions"
\`\`\`

### Tab type notes

- **\`web-browser\` tabs**: Electron webviews, not tmux. The \`alive\` field in
  \`tab list\` / \`tab status\` is always \`false\` for these — that is the normal
  value, not a sign the tab is dead. Do not gate actions on \`alive\`. Use the
  browser-specific HTTP endpoints (\`/browser/url\`, \`/browser/screenshot\`, …;
  see \`purplemux api-guide\`) directly.
- **\`terminal\` / \`claude-code\` / \`codex-cli\` tabs**: run inside tmux, so \`alive\` is a valid
  liveness signal.
`;
};

export const writeClaudePromptFile = async (ws: IWorkspace): Promise<void> => {
  const filePath = getClaudePromptPath(ws.id);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const rules = await loadGlobalRules();
  const body = rules
    ? buildClaudePromptBody(ws) + buildGlobalRulesSection(rules)
    : buildClaudePromptBody(ws);
  try {
    const existing = await fs.readFile(filePath, 'utf-8');
    if (existing === body) return;
  } catch {
    // missing — write below
  }
  await fs.writeFile(filePath, body, 'utf-8');
};
