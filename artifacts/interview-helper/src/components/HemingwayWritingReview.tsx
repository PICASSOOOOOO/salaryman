import { Check, RotateCcw, X } from "lucide-react";
import type { EssaySuggestion } from "@/lib/essay-tools";

export default function HemingwayWritingReview({
  suggestions,
  notice,
  isReviewing,
  isBusy,
  canReview,
  onReview,
  onAccept,
  onReject,
  onAcceptAll,
}: {
  suggestions: EssaySuggestion[];
  notice: string;
  isReviewing: boolean;
  isBusy: boolean;
  canReview: boolean;
  onReview: () => void;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onAcceptAll: () => void;
}) {
  return (
    <section
      aria-label="Grammar and style review"
      className="space-y-3 border-b border-white/[0.06] bg-white/[0.015] px-4 py-3 sm:px-6"
      data-testid="hemingway-writing-review"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[10px] font-semibold tracking-[0.14em] text-amber-200">
            GRAMMAR · CLARITY · STYLE
          </h2>
          <p className="mt-1 text-[10px] text-zinc-600">
            Suggestions never replace your draft until you accept them.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {suggestions.length > 0 && (
            <button
              type="button"
              onClick={onAcceptAll}
              disabled={isBusy}
              data-testid="button-hemingway-apply-safe-edits"
              className="inline-flex min-h-9 items-center gap-1 rounded border border-amber-500/25 px-3 text-[10px] text-amber-200 hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check className="h-3 w-3" /> APPLY SAFE EDITS
            </button>
          )}
          <button
            type="button"
            onClick={onReview}
            disabled={isReviewing || isBusy || !canReview}
            data-testid="button-hemingway-review"
            className="inline-flex min-h-9 items-center gap-1 rounded border border-white/[0.1] px-3 text-[10px] text-zinc-300 hover:border-amber-500/25 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className={`h-3 w-3 ${isReviewing ? "animate-spin" : ""}`} />
            {isReviewing ? "REVIEWING…" : "REVIEW WRITING"}
          </button>
        </div>
      </div>
      {notice && <p role="status" className="text-[10px] text-amber-200/80">{notice}</p>}
      {isReviewing && <p role="status" aria-live="polite" className="text-xs text-zinc-500">Checking grammar, clarity, and voice…</p>}
      {!isReviewing && suggestions.length === 0 && (
        <p className="text-[10px] text-zinc-600">
          {canReview ? "Run a review when you’re ready." : "Add draft text to review."}
        </p>
      )}
      {!isReviewing && suggestions.length > 0 && (
        <div className="grid gap-2 lg:grid-cols-2" aria-label="Writing suggestions">
          {suggestions.map((suggestion) => (
            <article
              key={suggestion.id}
              data-testid={`card-hemingway-suggestion-${suggestion.id}`}
              className="min-w-0 rounded border border-white/[0.07] bg-black/20 p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[9px] uppercase tracking-wider text-amber-200/75">{suggestion.category}</span>
                <span className="text-[9px] text-zinc-600">{suggestion.explanation}</span>
              </div>
              <p className="break-words text-xs text-zinc-500 line-through">{suggestion.original}</p>
              <p className="mt-1 break-words text-xs text-zinc-200">{suggestion.replacement}</p>
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => onReject(suggestion.id)}
                  data-testid={`button-hemingway-keep-${suggestion.id}`}
                  className="inline-flex min-h-8 items-center gap-1 rounded border border-white/[0.08] px-2 text-[9px] text-zinc-500 hover:text-zinc-200"
                >
                  <X className="h-3 w-3" /> KEEP
                </button>
                <button
                  type="button"
                  onClick={() => onAccept(suggestion.id)}
                  data-testid={`button-hemingway-accept-${suggestion.id}`}
                  className="inline-flex min-h-8 items-center gap-1 rounded border border-amber-500/25 px-2 text-[9px] text-amber-200 hover:bg-amber-500/10"
                >
                  <Check className="h-3 w-3" /> ACCEPT
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
