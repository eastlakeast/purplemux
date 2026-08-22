import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyCliToken } from '@/lib/cli-token';
import { findTab } from '@/lib/cli-utils';
import { hasSession, sendInputSequence, type ITmuxInputStep } from '@/lib/tmux';

type TInputSequenceItem = string | { type?: unknown; value?: unknown };

const NAMED_KEYS = new Set([
  'Enter', 'Escape', 'Space', 'Tab', 'BSpace', 'DC',
  'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PPage', 'NPage',
  ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`),
]);
const MODIFIED_KEY_RE = /^(?:C|M)-(?:[A-Za-z0-9]|Space|Enter|Tab|Up|Down|Left|Right)$/;

const isAllowedKey = (value: string): boolean =>
  NAMED_KEYS.has(value) || MODIFIED_KEY_RE.test(value);

const normalizeSequenceItem = (item: TInputSequenceItem): ITmuxInputStep | null => {
  if (typeof item === 'string') {
    return isAllowedKey(item) ? { type: 'key', value: item } : null;
  }
  if (!item || typeof item !== 'object') return null;
  if (item.type !== 'literal' || typeof item.value !== 'string' || !item.value || item.value.length > 100_000) return null;
  return { type: 'literal', value: item.value };
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!verifyCliToken(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const tabId = req.query.tabId as string;
  const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const rawSequence = Array.isArray(req.body?.sequence)
    ? req.body.sequence as TInputSequenceItem[]
    : Array.isArray(req.body?.keys)
      ? req.body.keys as TInputSequenceItem[]
      : [];
  if (rawSequence.length === 0 || rawSequence.length > 256) {
    return res.status(400).json({ error: 'keys or sequence must contain 1 to 256 items' });
  }
  const sequence = rawSequence.map(normalizeSequenceItem);
  if (sequence.some((item) => item === null)) {
    return res.status(400).json({ error: 'sequence contains an unsupported key or literal item' });
  }

  const found = await findTab(workspaceId, tabId);
  if (!found) return res.status(404).json({ error: 'Tab not found' });
  if (!(await hasSession(found.tab.sessionName))) {
    return res.status(409).json({ error: 'Tab session is not running' });
  }

  await sendInputSequence(found.tab.sessionName, sequence as ITmuxInputStep[]);
  return res.status(200).json({ status: 'sent', count: sequence.length });
};

export default handler;
