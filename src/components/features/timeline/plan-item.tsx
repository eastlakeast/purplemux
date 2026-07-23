import { useState, useEffect, memo } from 'react';
import { useTranslations } from 'next-intl';
import { ClipboardList, Eye, TerminalSquare, Check } from 'lucide-react';
import Spinner from '@/components/ui/spinner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { timelineUrlTransform } from '@/lib/timeline-markdown-url';
import { remarkLocalFileLinks } from '@/lib/remark-local-file-links';
import { TimelineMarkdownLink } from '@/components/features/timeline/timeline-markdown-link';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { ITimelinePlan } from '@/types/timeline';

const REMARK_PLUGINS = [remarkGfm, remarkLocalFileLinks];
const REHYPE_PLUGINS = [rehypeHighlight];
const MARKDOWN_COMPONENTS = {
  a: TimelineMarkdownLink,
};

interface IPlanItemProps {
  entry: ITimelinePlan;
  sessionName?: string;
}

const fetchPlanOptions = async (sessionName: string): Promise<string[]> => {
  try {
    const res = await fetch(`/api/tmux/plan-options?session=${encodeURIComponent(sessionName)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.options) ? data.options : [];
  } catch {
    return [];
  }
};

const sendSelection = async (session: string, optionIndex: number): Promise<boolean> => {
  try {
    const res = await fetch('/api/tmux/send-input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session, input: String(optionIndex + 1) }),
    });
    return res.ok;
  } catch {
    return false;
  }
};

const PlanItem = ({ entry, sessionName }: IPlanItemProps) => {
  const t = useTranslations('timeline');
  const [open, setOpen] = useState(false);
  const [terminalOptions, setTerminalOptions] = useState<string[]>([]);
  const [localSelected, setLocalSelected] = useState<number | null>(null);
  const firstLine = entry.markdown.split('\n').find((l) => l.replace(/^#+\s*/, '').trim()) ?? 'Plan';
  const title = firstLine.replace(/^#+\s*/, '').trim();
  const isPending = entry.status === 'pending';
  const isApproved = entry.status === 'success';
  const isSelectable = isPending && localSelected === null && !!sessionName;

  useEffect(() => {
    if (!isPending || !sessionName) return;

    let cancelled = false;

    const tryFetch = async () => {
      // CLI가 선택지를 렌더링할 시간을 줌
      await new Promise((r) => setTimeout(r, 500));
      if (cancelled) return;

      const options = await fetchPlanOptions(sessionName);
      if (!cancelled && options.length > 0) {
        setTerminalOptions(options);
      }
    };

    tryFetch();
    return () => { cancelled = true; };
  }, [isPending, sessionName]);

  const displayOptions = terminalOptions.length > 0 ? terminalOptions : null;

  const handleSelect = async (idx: number) => {
    if (!isSelectable) return;

    setLocalSelected(idx);
    const ok = await sendSelection(sessionName, idx);
    if (!ok) {
      setLocalSelected(null);
      toast.error(t('selectionFailed'));
    }
  };

  return (
    <div className="animate-in fade-in duration-150">
      {isPending ? (
        <div className="rounded-lg border border-claude-active/20 bg-claude-active/5 px-4 py-3">
          <div className="mb-2.5 flex items-center gap-2 text-xs font-medium text-claude-active">
            <ClipboardList size={14} />
            <span>{t('planPendingLabel')}</span>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="ml-auto flex items-center gap-1 rounded-md border border-claude-active/30 bg-claude-active/10 px-2 py-0.5 text-claude-active transition-colors hover:bg-claude-active/20"
            >
              <Eye size={12} />
              <span>{t('planViewDetail')}</span>
            </button>
          </div>

          <p className="mb-3 text-sm">{title}</p>

          {displayOptions ? (
            <div className="mb-2.5 flex flex-col gap-1.5">
              {displayOptions.map((label, idx) => {
                const isSelected = localSelected === idx;
                const dimmed = localSelected !== null && !isSelected;

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={!isSelectable}
                    onClick={() => handleSelect(idx)}
                    className={cn(
                      'flex items-start gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                      isSelected
                        ? 'border-claude-active/40 bg-claude-active/10'
                        : dimmed
                          ? 'border-border/30 opacity-50'
                          : 'border-border/50',
                      isSelectable && 'cursor-pointer hover:border-claude-active/30 hover:bg-claude-active/5',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-medium',
                        isSelected
                          ? 'bg-claude-active text-white'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {isSelected && !isApproved ? (
                        <Spinner size={10} />
                      ) : isSelected ? (
                        <Check size={12} />
                      ) : (
                        idx + 1
                      )}
                    </span>
                    <span className="min-w-0 flex-1">{label}</span>
                  </button>
                );
              })}
            </div>
          ) : entry.allowedPrompts && entry.allowedPrompts.length > 0 ? (
            <div className="mb-2.5 flex flex-col gap-1 text-xs text-muted-foreground">
              {entry.allowedPrompts.map((p, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <TerminalSquare size={11} className="shrink-0 text-claude-active/50" />
                  <span className="truncate">{p.prompt}</span>
                </div>
              ))}
            </div>
          ) : null}

          {!displayOptions && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TerminalSquare size={12} />
              <span>{t('planApproveInTerminal')}</span>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/50"
        >
          <ClipboardList size={14} className="shrink-0 text-claude-active" />
          <span className="shrink-0 font-semibold uppercase text-claude-active">Plan</span>
          <span className="flex-1 truncate">{title}</span>
          {isApproved && <Check size={12} className="shrink-0 text-claude-active/60" />}
          <Eye size={12} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">{t('planDialogDescription')}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm [&_pre]:overflow-x-auto [&_pre]:bg-muted [&_pre]:rounded-md [&_pre]:p-3 [&_pre_code]:text-foreground [&_code]:text-[0.9em] [&_code.hljs]:text-[1em] [&_code]:font-normal [&_code]:font-mono [&_code::before]:content-none [&_code::after]:content-none">
              <ReactMarkdown
                remarkPlugins={REMARK_PLUGINS}
                rehypePlugins={REHYPE_PLUGINS}
                components={MARKDOWN_COMPONENTS}
                urlTransform={timelineUrlTransform}
              >
                {entry.markdown}
              </ReactMarkdown>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default memo(PlanItem);
