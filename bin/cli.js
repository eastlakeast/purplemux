#!/usr/bin/env node
// purplemux CLI — workspace-scoped HTTP API wrapper
// Falls back to ~/.purplemux/{port,cli-token} when env vars absent.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const readFileOrNull = (file) => {
  try {
    return fs.readFileSync(file, 'utf-8').trim() || null;
  } catch {
    return null;
  }
};

const PORT = process.env.PMUX_PORT || readFileOrNull(path.join(os.homedir(), '.purplemux', 'port'));
const TOKEN = process.env.PMUX_TOKEN || readFileOrNull(path.join(os.homedir(), '.purplemux', 'cli-token'));
const BASE = `http://localhost:${PORT}`;

const die = (msg) => {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
};

const requireEnv = () => {
  if (!PORT) die('PMUX_PORT not set and ~/.purplemux/port missing (is the server running?)');
  if (!TOKEN) die('PMUX_TOKEN not set and ~/.purplemux/cli-token missing (is the server running?)');
};

const out = (body) => {
  process.stdout.write(JSON.stringify(body, null, 2) + '\n');
};

const api = async (method, path, data) => {
  const url = `${BASE}${path}`;
  const opts = {
    method,
    headers: { 'X-Pmux-Token': TOKEN, 'Content-Type': 'application/json' },
  };
  if (data !== undefined) opts.body = JSON.stringify(data);
  const resp = await fetch(url, opts);
  const body = resp.headers.get('content-type')?.includes('json')
    ? await resp.json()
    : null;
  if (!resp.ok) {
    const msg = body?.error || `HTTP ${resp.status}`;
    die(msg);
  }
  return { resp, body };
};

const apiRaw = async (method, path) => {
  const url = `${BASE}${path}`;
  const resp = await fetch(url, {
    method,
    headers: { 'X-Pmux-Token': TOKEN },
  });
  if (!resp.ok) {
    const ct = resp.headers.get('content-type') || '';
    if (ct.includes('json')) {
      const body = await resp.json();
      die(body?.error || `HTTP ${resp.status}`);
    }
    die(`HTTP ${resp.status}`);
  }
  return resp;
};

const cmdWorkspaces = async () => {
  requireEnv();
  const { body } = await api('GET', '/api/cli/workspaces');
  out(body);
};

const currentTmuxSessionName = () => {
  if (!process.env.TMUX) return null;
  try {
    return execFileSync('tmux', ['display-message', '-p', '#S'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).trim() || null;
  } catch {
    return null;
  }
};

const teamContext = (args) => {
  const sessionName = currentTmuxSessionName();
  const inferredWorkspaceId = sessionName?.match(/^pt-(ws-.+?)-pane-/)?.[1] ?? null;
  const workspaceId = flagValue(args, '--workspace') || flagValue(args, '-w') || inferredWorkspaceId;
  if (!workspaceId && !sessionName) {
    die('run this inside a purplemux tab or provide --workspace');
  }
  return { ...(workspaceId ? { workspaceId } : {}), ...(sessionName ? { sessionName } : {}) };
};

const getTeam = async (args) => {
  const context = teamContext(args);
  const params = new URLSearchParams(context);
  const { body } = await api('GET', `/api/cli/team?${params.toString()}`);
  return { team: body, context };
};

const matchTeamMembers = (team, target) => {
  const members = [team.orchestrator, ...team.workers].filter(Boolean);
  if (!target || target.toLowerCase() === 'all') return members;
  const normalized = target.toLowerCase();
  return members.filter((member) =>
    member.alias.toLowerCase() === normalized ||
    member.workspaceId.toLowerCase() === normalized ||
    member.tabId?.toLowerCase() === normalized ||
    member.workspaceName.toLowerCase() === normalized,
  );
};

const cmdTeamShow = async (args) => {
  requireEnv();
  const { team } = await getTeam(args);
  out(team);
};

const cmdTeamSend = async (args) => {
  requireEnv();
  const rest = stripFlags(args, ['--workspace', '-w']);
  const target = rest[0];
  const content = rest.slice(1).join(' ');
  if (!target) die('worker alias or "all" is required');
  if (!content) die('content is required');
  const context = teamContext(args);
  const { body } = await api('POST', '/api/cli/team/send', { ...context, target, content });
  out(body);
};

const cmdTeamReply = async (args) => {
  requireEnv();
  const rest = stripFlags(args, ['--workspace', '-w']);
  const content = rest.join(' ');
  if (!content) die('content is required');
  const context = teamContext(args);
  const { body } = await api('POST', '/api/cli/team/reply', { ...context, content });
  out(body);
};

const cmdTeamStatus = async (args) => {
  requireEnv();
  const rest = stripFlags(args, ['--workspace', '-w']);
  const { team } = await getTeam(args);
  const members = matchTeamMembers(team, rest[0]);
  if (members.length === 0) die(`team member not found: ${rest[0]}`);
  const results = [];
  for (const member of members) {
    if (!member.tabId) {
      results.push({ alias: member.alias, workspaceId: member.workspaceId, available: false });
      continue;
    }
    const { body } = await api(
      'GET',
      `/api/cli/tabs/${member.tabId}/status?workspaceId=${encodeURIComponent(member.workspaceId)}`,
    );
    results.push({ alias: member.alias, role: member.role, ...body });
  }
  out(results);
};

const cmdTeamResult = async (args) => {
  requireEnv();
  const rest = stripFlags(args, ['--workspace', '-w']);
  const target = rest[0];
  if (!target || target.toLowerCase() === 'all') die('one team member alias is required');
  const { team } = await getTeam(args);
  const members = matchTeamMembers(team, target);
  if (members.length !== 1) die(members.length === 0 ? `team member not found: ${target}` : `ambiguous team member: ${target}`);
  const member = members[0];
  if (!member.tabId) die(`team member has no Claude Code or Codex tab: ${target}`);
  const { body } = await api(
    'GET',
    `/api/cli/tabs/${member.tabId}/result?workspaceId=${encodeURIComponent(member.workspaceId)}`,
  );
  out({ alias: member.alias, workspaceId: member.workspaceId, tabId: member.tabId, ...body });
};

const cmdTabList = async (args) => {
  requireEnv();
  const wsId = flagValue(args, '--workspace') || flagValue(args, '-w');
  const qs = wsId ? `?workspaceId=${encodeURIComponent(wsId)}` : '';
  const { body } = await api('GET', `/api/cli/tabs${qs}`);
  out(body);
};

const cmdTabCreate = async (args) => {
  requireEnv();
  const wsId = flagValue(args, '--workspace') || flagValue(args, '-w');
  const name = flagValue(args, '--name') || flagValue(args, '-n');
  const panelType = flagValue(args, '--type') || flagValue(args, '-t');
  const command = flagValue(args, '--command') || flagValue(args, '-c');
  if (!wsId) die('--workspace is required');
  const { body } = await api('POST', '/api/cli/tabs', {
    workspaceId: wsId,
    ...(name ? { name } : {}),
    ...(panelType ? { panelType } : {}),
    ...(command ? { command } : {}),
  });
  out(body);
};

const resolveWsForTab = (args) => {
  const wsId = flagValue(args, '--workspace') || flagValue(args, '-w');
  if (!wsId) die('--workspace is required');
  return wsId;
};

const cmdTabSend = async (args) => {
  requireEnv();
  const rest = stripFlags(args, ['--workspace', '-w']);
  const tabId = rest[0];
  const content = rest.slice(1).join(' ');
  if (!tabId) die('tab ID is required');
  if (!content) die('content is required');
  const wsId = resolveWsForTab(args);
  const { body } = await api(
    'POST',
    `/api/cli/tabs/${tabId}/send?workspaceId=${encodeURIComponent(wsId)}`,
    { content },
  );
  out(body);
};

const cmdTabStatus = async (args) => {
  requireEnv();
  const rest = stripFlags(args, ['--workspace', '-w']);
  const tabId = rest[0];
  if (!tabId) die('tab ID is required');
  const wsId = resolveWsForTab(args);
  const { body } = await api(
    'GET',
    `/api/cli/tabs/${tabId}/status?workspaceId=${encodeURIComponent(wsId)}`,
  );
  out(body);
};

const cmdTabResult = async (args) => {
  requireEnv();
  const rest = stripFlags(args, ['--workspace', '-w']);
  const tabId = rest[0];
  if (!tabId) die('tab ID is required');
  const wsId = resolveWsForTab(args);
  const { body } = await api(
    'GET',
    `/api/cli/tabs/${tabId}/result?workspaceId=${encodeURIComponent(wsId)}`,
  );
  out(body);
};

const cmdTabClose = async (args) => {
  requireEnv();
  const rest = stripFlags(args, ['--workspace', '-w']);
  const tabId = rest[0];
  if (!tabId) die('tab ID is required');
  const wsId = resolveWsForTab(args);
  const { resp } = await api(
    'DELETE',
    `/api/cli/tabs/${tabId}?workspaceId=${encodeURIComponent(wsId)}`,
  );
  if (resp.ok) process.stdout.write('ok\n');
};

const cmdTabBrowser = async (args) => {
  requireEnv();
  const sub = args[0];
  const rest = stripFlags(args.slice(1), ['--workspace', '-w', '-o', '--since', '--level', '--method', '--url', '--status', '--request', '--full']);
  const tabId = rest[0];
  if (!sub) die('browser subcommand required (url | screenshot | console | network | eval)');
  if (!tabId) die('tab ID is required');
  const wsId = resolveWsForTab(args);
  const qs = `workspaceId=${encodeURIComponent(wsId)}`;

  switch (sub) {
    case 'url': {
      const { body } = await api('GET', `/api/cli/tabs/${tabId}/browser/url?${qs}`);
      out(body);
      return;
    }
    case 'screenshot': {
      const outPath = flagValue(args, '-o') || flagValue(args, '--output');
      const full = args.includes('--full') ? '1' : '0';
      const path = `/api/cli/tabs/${tabId}/browser/screenshot?${qs}&full=${full}`;
      if (outPath) {
        const resp = await apiRaw('GET', path);
        const buf = Buffer.from(await resp.arrayBuffer());
        fs.writeFileSync(outPath, buf);
        out({ saved: outPath, bytes: buf.byteLength });
      } else {
        const { body } = await api('GET', `${path}&format=base64`);
        out(body);
      }
      return;
    }
    case 'console': {
      const since = flagValue(args, '--since');
      const level = flagValue(args, '--level');
      const params = [qs];
      if (since) params.push(`since=${encodeURIComponent(since)}`);
      if (level) params.push(`level=${encodeURIComponent(level)}`);
      const { body } = await api('GET', `/api/cli/tabs/${tabId}/browser/console?${params.join('&')}`);
      out(body);
      return;
    }
    case 'network': {
      const since = flagValue(args, '--since');
      const method = flagValue(args, '--method');
      const urlFilter = flagValue(args, '--url');
      const status = flagValue(args, '--status');
      const requestId = flagValue(args, '--request');
      const params = [qs];
      if (requestId) params.push(`requestId=${encodeURIComponent(requestId)}`);
      if (since) params.push(`since=${encodeURIComponent(since)}`);
      if (method) params.push(`method=${encodeURIComponent(method)}`);
      if (urlFilter) params.push(`url=${encodeURIComponent(urlFilter)}`);
      if (status) params.push(`status=${encodeURIComponent(status)}`);
      const { body } = await api('GET', `/api/cli/tabs/${tabId}/browser/network?${params.join('&')}`);
      out(body);
      return;
    }
    case 'eval': {
      const expression = rest.slice(1).join(' ');
      if (!expression) die('expression is required');
      const { body } = await api('POST', `/api/cli/tabs/${tabId}/browser/eval?${qs}`, { expression });
      out(body);
      return;
    }
    default:
      die(`unknown browser subcommand: ${sub}. Use url | screenshot | console | network | eval`);
  }
};

const cmdApiGuide = async () => {
  requireEnv();
  const resp = await fetch(`${BASE}/api/cli/api-guide`, {
    headers: { 'X-Pmux-Token': TOKEN },
  });
  if (!resp.ok) die(`HTTP ${resp.status}`);
  process.stdout.write((await resp.text()) + '\n');
};

const flagValue = (args, name) => {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
};

const stripFlags = (args, names) => {
  const result = [];
  let i = 0;
  while (i < args.length) {
    if (names.includes(args[i])) {
      i += 2;
    } else {
      result.push(args[i]);
      i++;
    }
  }
  return result;
};

const usage = () => {
  process.stdout.write(`purplemux CLI

Usage: purplemux <command> [args...]

Commands:
  workspaces                               List workspaces
  tab list [-w WS]                         List tabs (optionally scoped to workspace)
  tab create -w WS [-n NAME] [-t TYPE] [-c CMD]
                                          Create a tab in workspace (type: terminal | claude-code | codex-cli | agent-sessions | web-browser | diff)
  tab send -w WS TAB_ID CONTENT...         Send input to a tab
  tab status -w WS TAB_ID                  Tab status
  tab result -w WS TAB_ID                  Capture tab pane content
  tab close -w WS TAB_ID                   Close a tab
  tab browser url -w WS TAB_ID             Current URL + title of a web-browser tab
  tab browser screenshot -w WS TAB_ID      Capture tab screenshot (PNG). Use -o FILE to save, --full for full page
                          [-o FILE] [--full]
  tab browser console -w WS TAB_ID         Read recent console entries (ring buffer, 500 entries)
                          [--since MS] [--level LEVEL]
  tab browser network -w WS TAB_ID         Read recent network entries, or with --request ID to fetch body
                          [--since MS] [--method M] [--url SUBSTR] [--status CODE] [--request ID]
  tab browser eval -w WS TAB_ID EXPR       Evaluate JS expression inside the tab; returns serialized value
  team show [-w WS]                        Show the current group team and your role
  team members [-w WS]                     Alias for team show
  team send [-w WS] TARGET CONTENT...      Dispatch a task to a worker alias or all (orchestrator only)
  team reply [-w WS] CONTENT...             Report to the orchestrator (worker only)
  team status [-w WS] [TARGET]             Show status for all members or one alias
  team result [-w WS] TARGET               Capture one member's current pane content
  api-guide                                Print full HTTP API reference
  help                                     Show this usage

Environment:
  PMUX_PORT       Server port (required)
  PMUX_TOKEN      CLI token (required)
`);
};

const main = async () => {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const sub = args[1];
  const rest = args.slice(2);

  switch (cmd) {
    case 'workspaces':
      return cmdWorkspaces();
    case 'tab':
      switch (sub) {
        case 'list': return cmdTabList(rest);
        case 'create': return cmdTabCreate(rest);
        case 'send': return cmdTabSend(rest);
        case 'status': return cmdTabStatus(rest);
        case 'result': return cmdTabResult(rest);
        case 'close': return cmdTabClose(rest);
        case 'browser': return cmdTabBrowser(rest);
        default: die(`unknown tab command: ${sub || '(none)'}. Run 'purplemux help' for usage.`);
      }
      break;
    case 'team':
      switch (sub) {
        case 'show':
        case 'members': return cmdTeamShow(rest);
        case 'send': return cmdTeamSend(rest);
        case 'reply': return cmdTeamReply(rest);
        case 'status': return cmdTeamStatus(rest);
        case 'result': return cmdTeamResult(rest);
        default: die(`unknown team command: ${sub || '(none)'}. Run 'purplemux help' for usage.`);
      }
      break;
    case 'api-guide':
      return cmdApiGuide();
    case 'help':
    case '-h':
    case '--help':
      return usage();
    default:
      die(`unknown command: ${cmd}. Run 'purplemux help' for usage.`);
  }
};

main().catch((err) => {
  die(err.message || String(err));
});
