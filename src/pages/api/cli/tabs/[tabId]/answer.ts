import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyCliToken } from '@/lib/cli-token';
import { findTab } from '@/lib/cli-utils';
import { buildKeySequence, type TAskCustomAnswers, type TAskSelections } from '@/lib/ask-question-keys';
import { getStatusManager } from '@/lib/status-manager';
import { hasSession, sendInputSequence, type ITmuxInputStep } from '@/lib/tmux';

interface IAnswerInput {
  option?: number;
  options?: number[];
  text?: string;
}

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
  if (!Array.isArray(req.body?.answers)) {
    return res.status(400).json({ error: 'answers array is required' });
  }
  const answers = req.body.answers as IAnswerInput[];

  const found = await findTab(workspaceId, tabId);
  if (!found) return res.status(404).json({ error: 'Tab not found' });
  if (!(await hasSession(found.tab.sessionName))) {
    return res.status(409).json({ error: 'Tab session is not running' });
  }

  const questions = getStatusManager().getTabForClient(tabId)?.pendingQuestions;
  if (!questions?.length) {
    return res.status(409).json({ error: 'The tab has no pending AskUserQuestion prompt' });
  }
  if (answers.length !== questions.length) {
    return res.status(400).json({ error: `answers must contain ${questions.length} item(s)` });
  }

  const selections: TAskSelections = {};
  const customAnswers: TAskCustomAnswers = {};
  for (let qIdx = 0; qIdx < questions.length; qIdx += 1) {
    const question = questions[qIdx];
    const answer = answers[qIdx] ?? {};
    const text = typeof answer.text === 'string' ? answer.text.trim() : '';
    if (text) {
      if (question.multiSelect || question.allowCustomAnswer === false) {
        return res.status(400).json({ error: `question ${qIdx + 1} does not accept a custom answer` });
      }
      customAnswers[qIdx] = text;
      selections[qIdx] = [question.options.length];
      continue;
    }

    const oneBased = Array.isArray(answer.options)
      ? answer.options
      : answer.option !== undefined
        ? [answer.option]
        : [];
    if (oneBased.length === 0 || (!question.multiSelect && oneBased.length !== 1)) {
      return res.status(400).json({ error: `question ${qIdx + 1} requires ${question.multiSelect ? 'one or more options' : 'one option'}` });
    }
    if (oneBased.some((index) => !Number.isInteger(index) || index < 1 || index > question.options.length)) {
      return res.status(400).json({ error: `question ${qIdx + 1} contains an invalid 1-based option index` });
    }
    selections[qIdx] = [...new Set(oneBased)].map((index) => index - 1);
  }

  const sequence: ITmuxInputStep[] = buildKeySequence(questions, selections, customAnswers).map((step) =>
    typeof step === 'string' ? { type: 'key', value: step } : step,
  );
  await sendInputSequence(found.tab.sessionName, sequence);
  return res.status(200).json({ status: 'answered', questionCount: questions.length });
};

export default handler;
