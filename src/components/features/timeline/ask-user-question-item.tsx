import { useState, useMemo, memo } from 'react';
import { useTranslations } from 'next-intl';
import { MessageCircleQuestion, Check, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { buildKeySequence, type TAskSelections } from '@/lib/ask-question-keys';
import type { ITimelineAskUserQuestion, IAskUserQuestionItem } from '@/types/timeline';

interface IAskUserQuestionItemProps {
  entry: ITimelineAskUserQuestion;
  sessionName?: string;
}

const postKeys = async (session: string, keys: string[]): Promise<boolean> => {
  try {
    const res = await fetch('/api/tmux/send-input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session, keys }),
    });
    return res.ok;
  } catch {
    return false;
  }
};

const answeredLabels = (entry: ITimelineAskUserQuestion, question: IAskUserQuestionItem): string[] => {
  const raw = entry.answers?.[question.header] ?? (entry.questions.length === 1 ? entry.answer : undefined);
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim());
};

const AskUserQuestionItem = ({ entry, sessionName }: IAskUserQuestionItemProps) => {
  const t = useTranslations('timeline');
  const [selections, setSelections] = useState<TAskSelections>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isAnswered = entry.status === 'success';
  const canInteract = !isAnswered && !submitted && !!sessionName;

  const allAnswered = useMemo(
    () => entry.questions.every((_, qIdx) => (selections[qIdx]?.length ?? 0) > 0),
    [entry.questions, selections],
  );

  if (entry.questions.length === 0) return null;

  const toggle = (qIdx: number, optIdx: number, multi: boolean) => {
    if (!canInteract) return;
    setSelections((prev) => {
      const cur = prev[qIdx] ?? [];
      if (multi) {
        const next = cur.includes(optIdx) ? cur.filter((i) => i !== optIdx) : [...cur, optIdx];
        return { ...prev, [qIdx]: next };
      }
      return { ...prev, [qIdx]: [optIdx] };
    });
  };

  const handleSubmit = async () => {
    if (!canInteract || !allAnswered || !sessionName) return;
    setSubmitting(true);
    const ok = await postKeys(sessionName, buildKeySequence(entry.questions, selections));
    setSubmitting(false);
    if (!ok) {
      toast.error(t('selectionFailed'));
      return;
    }
    setSubmitted(true);
  };

  const isOptionSelected = (question: IAskUserQuestionItem, qIdx: number, optIdx: number): boolean => {
    if (isAnswered) return answeredLabels(entry, question).includes(question.options[optIdx]?.label ?? '');
    return (selections[qIdx] ?? []).includes(optIdx);
  };

  return (
    <div className="animate-in fade-in flex flex-col gap-2 duration-150">
      {entry.questions.map((question, qIdx) => (
        <div
          key={qIdx}
          className="rounded-lg border border-claude-active/20 bg-claude-active/5 px-4 py-3"
        >
          <div className="mb-2.5 flex items-center gap-2 text-xs font-medium text-claude-active">
            <MessageCircleQuestion size={14} />
            <span>{question.header}</span>
            {question.multiSelect && !isAnswered && (
              <span className="text-[10px] font-normal text-muted-foreground">
                {t('askMultiSelectHint')}
              </span>
            )}
          </div>

          <p className="mb-3 text-sm">{question.question}</p>

          <div className="flex flex-col gap-1.5">
            {question.options.map((option, optIdx) => {
              const selected = isOptionSelected(question, qIdx, optIdx);
              const dimmed = (isAnswered || submitted) && !selected;

              return (
                <button
                  key={optIdx}
                  type="button"
                  disabled={!canInteract}
                  onClick={() => toggle(qIdx, optIdx, question.multiSelect)}
                  className={cn(
                    'flex items-start gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                    selected
                      ? 'border-claude-active/40 bg-claude-active/10'
                      : dimmed
                        ? 'border-border/30 opacity-50'
                        : 'border-border/50',
                    canInteract && 'cursor-pointer hover:border-claude-active/30 hover:bg-claude-active/5',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-xs font-medium',
                      question.multiSelect ? 'rounded-sm' : 'rounded',
                      selected ? 'bg-claude-active text-white' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {selected ? <Check size={12} /> : optIdx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{option.label}</span>
                    {option.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{option.description}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {canInteract && (
        <button
          type="button"
          disabled={!allAnswered || submitting}
          onClick={handleSubmit}
          className={cn(
            'flex items-center justify-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
            allAnswered && !submitting
              ? 'cursor-pointer border-claude-active/40 bg-claude-active/10 text-claude-active hover:bg-claude-active/15'
              : 'border-border/40 text-muted-foreground opacity-60',
          )}
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {t('askSubmit')}
        </button>
      )}
    </div>
  );
};

export default memo(AskUserQuestionItem);
