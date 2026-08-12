import { capturePaneSnapshot, type IPaneSnapshot } from '@/lib/tmux';
import type { TPanelType } from '@/types/terminal';
import type { TCliState } from '@/types/timeline';

export type TAgentInputState = 'empty' | 'placeholder' | 'typed' | 'unavailable' | 'unknown';

interface IAnsiCell {
  char: string;
  dim: boolean;
}

const parseAnsiCells = (line: string): IAnsiCell[] => {
  const cells: IAnsiCell[] = [];
  let dim = false;

  for (let index = 0; index < line.length;) {
    if (line[index] === '\x1b' && line[index + 1] === '[') {
      const end = line.slice(index + 2).search(/[A-Za-z]/);
      if (end === -1) break;
      const finalIndex = index + 2 + end;
      if (line[finalIndex] === 'm') {
        const params = line.slice(index + 2, finalIndex)
          .split(';')
          .map((value) => value === '' ? 0 : Number(value));
        for (const param of params) {
          if (param === 0 || param === 22) dim = false;
          if (param === 2) dim = true;
        }
      }
      index = finalIndex + 1;
      continue;
    }

    const codePoint = line.codePointAt(index);
    if (codePoint === undefined) break;
    const char = String.fromCodePoint(codePoint);
    cells.push({ char, dim });
    index += char.length;
  }

  return cells;
};

const isInputPromptLine = (cells: IAnsiCell[]): boolean => {
  const firstVisible = cells.findIndex(({ char }) => !/\s/u.test(char));
  return firstVisible >= 0 && cells[firstVisible].char === '❯';
};

const isDividerLine = (cells: IAnsiCell[]): boolean =>
  cells.some(({ char }) => char === '─');

export const classifyClaudeInputSnapshot = (snapshot: IPaneSnapshot): TAgentInputState => {
  const lines = snapshot.ansiContent.replace(/\r/g, '').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (snapshot.cursorY < 0 || snapshot.cursorY >= lines.length) return 'unknown';

  const parsedLines = lines.map(parseAnsiCells);
  let promptRow = -1;
  for (let row = snapshot.cursorY; row >= 0; row -= 1) {
    const cells = parsedLines[row];
    if (isDividerLine(cells)) break;
    if (isInputPromptLine(cells)) {
      promptRow = row;
      break;
    }
  }
  if (promptRow === -1) return 'unavailable';

  const promptCells = parsedLines[promptRow];
  const markerIndex = promptCells.findIndex(({ char }) => char === '❯');
  const hasSeparator = /[\s\u00a0]/u.test(promptCells[markerIndex + 1]?.char ?? '');
  const firstLineStart = markerIndex + 1 + (hasSeparator ? 1 : 0);
  const contentCells = [
    ...promptCells.slice(firstLineStart),
    ...parsedLines.slice(promptRow + 1, snapshot.cursorY + 1).flat(),
  ].filter(({ char }) => !/\s/u.test(char));

  const inputStartColumn = markerIndex + 2;
  const cursorAtInputStart = promptRow === snapshot.cursorY
    && snapshot.cursorX <= inputStartColumn;

  if (contentCells.length === 0) {
    return cursorAtInputStart ? 'empty' : 'unknown';
  }
  if (contentCells.some(({ dim }) => !dim)) return 'typed';
  if (cursorAtInputStart) return 'placeholder';
  return 'unknown';
};

export const detectAgentInputState = async (
  sessionName: string,
  panelType: TPanelType | undefined,
): Promise<TAgentInputState | null> => {
  if (panelType !== 'claude-code') return null;
  const snapshot = await capturePaneSnapshot(sessionName);
  return snapshot ? classifyClaudeInputSnapshot(snapshot) : 'unknown';
};

export class AgentInputBlockedError extends Error {
  constructor(public readonly inputState: 'typed' | 'unavailable' | 'unknown') {
    const message = inputState === 'typed'
      ? 'The target Claude Code tab has unsubmitted input'
      : inputState === 'unavailable'
        ? 'The target Claude Code tab has no safe input editor available'
        : 'The target Claude Code input state could not be determined';
    super(message);
    this.name = 'AgentInputBlockedError';
  }
}

export const getAgentInputBlockReason = (
  inputState: TAgentInputState | null,
  cliState: TCliState | null | undefined,
): AgentInputBlockedError['inputState'] | null => {
  if (inputState === 'typed' || inputState === 'unknown') return inputState;
  if (inputState === 'unavailable' && cliState !== 'busy') return inputState;
  return null;
};

export const assertAgentInputAvailable = async (
  sessionName: string,
  panelType: TPanelType | undefined,
  cliState?: TCliState | null,
): Promise<void> => {
  const inputState = await detectAgentInputState(sessionName, panelType);
  const blockReason = getAgentInputBlockReason(inputState, cliState);
  if (blockReason) throw new AgentInputBlockedError(blockReason);
};
