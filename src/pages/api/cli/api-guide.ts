import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyCliToken } from '@/lib/cli-token';

const GUIDE = `# purplemux CLI HTTP API

All endpoints require header \`x-pmux-token: <PMUX_TOKEN>\`.

## Workspaces

GET /api/cli/workspaces
  Response: { "workspaces": [{ "id": "...", "name": "...", "groupPath": "parent/child" | null, "directories": [...] }] }

POST /api/cli/workspaces
  Body: { "name": "...", "groupPath"?: "parent/child", "directories"?: ["~/workspace/project"],
          "initialTab"?: { "panelType": "claude-code" | "codex-cli", "name"?: "...",
                           "preset"?: "naive", "mcpConfigs"?: ["/path/to/mcp.json"] } }
  Creates missing groups along groupPath and appends the workspace inside the final group.
  initialTab turns the workspace's single default tab into the requested worker and launches
  it with purplemux's canonical provider command. It does not create a second tab.
  The naive preset is Claude-only and enables explicitly supplied MCP configs.
  Requires a loaded local Electron app so the sidebar is updated immediately; otherwise returns HTTP 503.
  Response: { "id": "ws-...", "name": "...", "groupPath": "parent/child" | null,
              "directories": [...], "initialTab": { "tabId", "name", "panelType", "sessionName",
                                                       "agentProviderId", "agentSessionId" } }

PATCH /api/cli/workspaces/<workspaceId>
  Body: { "name": "..." }
  Rename a workspace.

DELETE /api/cli/workspaces/<workspaceId>
  Delete a workspace, kill all of its tmux sessions, and update the sidebar.
  Response: { "ok": true, "id": "ws-..." }

## Tabs

GET /api/cli/tabs?workspaceId=WS
  List tabs. Without workspaceId, lists tabs across all workspaces.
  Response: { "tabs": [{ "tabId", "workspaceId", "name", "sessionName", "panelType", "agentProviderId", "agentSessionId" }] }

POST /api/cli/tabs
  Body: { "workspaceId": "WS", "name"?: "...", "panelType"?: "terminal" | "claude-code" | "codex-cli" | "agent-sessions" | "web-browser" | "diff", "command"?: "...", "preset"?: "naive", "mcpConfigs"?: ["/path/to/mcp.json"] }
  Invalid panelType returns HTTP 400 with validPanelTypes.
  The naive preset creates a Claude Code tab with user/project/local settings disabled,
  while retaining purplemux hooks and only explicitly supplied MCP configs.
  Creates a tab in the first pane of the workspace.
  Response: { "tabId", "workspaceId", "paneId", "sessionName", "name", "panelType", "agentProviderId", "agentSessionId" }

GET /api/cli/tabs/<tabId>?workspaceId=WS
  Tab info.
  Response: { "tabId", "workspaceId", "paneId", "name", "sessionName", "panelType", "agentProviderId", "agentSessionId" }

PATCH /api/cli/tabs/<tabId>?workspaceId=WS
  Body: { "name": "..." }
  Rename a tab.

DELETE /api/cli/tabs/<tabId>?workspaceId=WS
  Close the tab (kills tmux session and removes from layout).

POST /api/cli/tabs/<tabId>/send?workspaceId=WS
  Body: { "content": "...", "mode"?: "safe" | "replace" }
  Send text (bracketed paste) to the tab. Claude Code input is checked immediately
  before safe delivery. Busy agents accept unavailable/unknown editor states for queued
  input. Replace mode explicitly clears existing typed input with C-u before sending.
  Response: { "status": "sent", "mode": "safe" | "replace" }

POST /api/cli/tabs/<tabId>/keys?workspaceId=WS
  Body: { "keys": ["Down", "Enter"] }
  Body alternative: { "sequence": ["Down", { "type": "literal", "value": "text" }, "Enter"] }
  Send named tmux keys and literal text atomically. Supported named keys include arrows,
  Enter, Escape, Space, Tab, Home/End, page keys, F1-F12, and C-/M- modifiers.

POST /api/cli/tabs/<tabId>/answer?workspaceId=WS
  Body: { "answers": [{ "option": 2 }] }
  Multi-select: { "answers": [{ "options": [1, 3] }] }
  Free text: { "answers": [{ "text": "custom answer" }] }
  Answer each pending AskUserQuestion item using 1-based option indexes.

GET /api/cli/tabs/<tabId>/status?workspaceId=WS
  Response: { "tabId", "workspaceId", "sessionName", "alive", "command", "cliState", "agentProviderId", "agentSessionId", "claudeSessionId", "pendingQuestions", "inputState" }

GET /api/cli/tabs/<tabId>/result?workspaceId=WS
  Capture the current pane content.
  Response: { "content": "...", "inputState": "empty" | "placeholder" | "typed" | "unavailable" | "unknown" | null }

GET /api/cli/events[?workspaceId=WS][&tabId=TAB]
  Server-Sent Events stream. Sends an initial status:sync event followed by
  status:update and status:hook-event transitions. Heartbeats are SSE comments.

## LLM usage

GET /api/cli/usage
  Returns the same effective rate-limit windows shown in the sidebar. Expired cached
  windows report 0% and the next calculated reset. Epoch values are seconds.
  Response: { "providers": { "claude": { "updated_at", "updated_at_iso", "five_hour": { "used_percentage", "resets_at", "resets_at_iso", "resets_in_seconds" } | null, "seven_day": { ... } | null } | null, "codex": { ... } | null } }

## Group agent teams

Inside a purplemux tmux tab, the CLI infers workspaceId and sessionName. HTTP
clients can provide either context explicitly.

GET /api/cli/team?workspaceId=WS[&sessionName=TMUX_SESSION]
GET /api/cli/team?sessionName=TMUX_SESSION
  Resolve the configured group team, selected agent tabs, aliases, and caller role.

POST /api/cli/team/send
  Body: { "workspaceId"?: "WS", "sessionName"?: "...", "target": "ALIAS" | "all", "content": "..." }
  Dispatch a structured task from the configured orchestrator tab to workers.

POST /api/cli/team/reply
  Body: { "workspaceId"?: "WS", "sessionName"?: "...", "content": "..." }
  Persist a structured report in a separate queue and return HTTP 202. Delivery retries
  automatically until the orchestrator input is safe, regardless of its current overlay.

GET /api/cli/team/inbox?workspaceId=WS[&sessionName=TMUX_SESSION]
  Orchestrator-only view of replies that are still queued for delivery.

## Web-browser tabs

These endpoints only work when the tab's panelType is "web-browser" and the webview
has attached (dom-ready has fired at least once). Electron runtime required;
503 is returned in headless/remote mode.

GET /api/cli/tabs/<tabId>/browser/url?workspaceId=WS
  Current URL + title of the webview.
  Response: { "tabId", "url", "title" }

GET /api/cli/tabs/<tabId>/browser/screenshot?workspaceId=WS[&full=1][&format=base64]
  PNG screenshot. Default returns image/png; format=base64 returns { base64 } JSON.
  full=1 captures beyond the viewport.

GET /api/cli/tabs/<tabId>/browser/console?workspaceId=WS[&since=MS][&level=LEVEL]
  Ring buffer (last 500 entries) of console messages, Log entries, and exceptions.
  Response: { "tabId", "entries": [{ "level", "text", "ts", "source"?, "url"?, "line"? }] }

GET /api/cli/tabs/<tabId>/browser/network?workspaceId=WS[&since=MS][&method=M][&url=SUBSTR][&status=CODE]
  Ring buffer (last 500 requests).
  Response: { "tabId", "entries": [{ "requestId", "method", "url", "status"?, "mimeType"?,
                                     "resourceType"?, "error"?, "ts", "endedAt"? }] }

GET /api/cli/tabs/<tabId>/browser/network?workspaceId=WS&requestId=RID
  Fetch response body for one request (cached after first call).
  Response: { "tabId", "requestId", "body" }

POST /api/cli/tabs/<tabId>/browser/eval?workspaceId=WS
  Body: { "expression": "..." }
  Evaluates the expression in the webview via CDP Runtime.evaluate
  (returnByValue, awaitPromise, 10s timeout).
  Response: { "tabId", "value" }

## CLI commands

purplemux workspaces
  List workspaces, including groupPath.

purplemux workspace create -n NAME [-g GROUP_PATH] [-d DIRECTORY]...
                           [--worker claude-code|codex-cli] [--worker-name NAME]
                           [--preset naive] [--mcp-config FILE]... [--json]
  Create a workspace. --worker initializes and launches its only tab as that worker.
  Default output is the workspace ID; --json includes initialTab.tabId for direct dispatch.

purplemux workspace rename WS NEW_NAME
  Rename a workspace.

purplemux workspace delete WS
  Delete a workspace and all of its tabs.

purplemux tab create -w WS --preset naive [--mcp-config FILE]...
  Add an uncustomized Claude worker to an existing workspace.

purplemux tab send -w WS TAB_ID --replace CONTENT...
purplemux tab clear -w WS TAB_ID
purplemux tab keys -w WS TAB_ID Down Enter
  Recover or directly control interactive terminal input.

purplemux tab answer -w WS TAB_ID --option 2
purplemux tab answer -w WS TAB_ID --options 1,3
purplemux tab answer -w WS TAB_ID --text "custom answer"
  Answer the pending AskUserQuestion prompt.

purplemux tab watch -w WS TAB_ID
purplemux events [-w WS] [TAB_ID]
  Stream state transitions as JSON Lines.

purplemux team inbox [-w WS]
  Inspect worker reports awaiting safe delivery.

purplemux tab rename -w WS TAB_ID NEW_NAME
  Rename a tab.

purplemux usage
  Print Claude and Codex usage percentages and reset times as JSON.
`;

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!verifyCliToken(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  return res.status(200).send(GUIDE);
};

export default handler;
