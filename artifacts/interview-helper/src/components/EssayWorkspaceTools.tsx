import { useState, type FormEvent } from "react";
import { BookOpen, Check, Plus, Quote, RotateCcw, X } from "lucide-react";
import type {
  EssayCitationStyle,
  EssayPlan,
  EssaySource,
  EssaySuggestion,
} from "@/lib/essay-tools";

export type EssayWorkspaceToolsProps = {
  plan: EssayPlan;
  sources: EssaySource[];
  citationStyle: EssayCitationStyle;
  suggestions: EssaySuggestion[];
  notice?: string;
  isProofreading: boolean;
  isBusy: boolean;
  canProofread: boolean;
  citationPreviews: Record<string, { inText: string; reference: string; warnings: string[] }>;
  onPlanChange: (partial: Partial<EssayPlan>) => void;
  onCitationStyleChange: (style: EssayCitationStyle) => void;
  onAddSource: (source: Omit<EssaySource, "id">) => void;
  onRemoveSource: (id: string) => void;
  onInsertCitation: (sourceId: string) => void;
  onProofread: () => void;
  onAcceptSuggestion: (id: string) => void;
  onRejectSuggestion: (id: string) => void;
};

type SourceDraft = Omit<EssaySource, "id" | "type"> & { type: EssaySource["type"] | "" };

const EMPTY_SOURCE: SourceDraft = {
  type: "",
  authors: "",
  authorIsOrganization: false,
  title: "",
  containerTitle: "",
  publisher: "",
  year: "",
  month: "",
  day: "",
  volume: "",
  issue: "",
  pages: "",
  doi: "",
  url: "",
  accessedDate: "",
  pageNumber: "",
};

const planFields: { key: keyof EssayPlan; label: string; hint: string; rows: number }[] = [
  { key: "assignment", label: "Assignment", hint: "What are you responding to?", rows: 2 },
  { key: "thesis", label: "Thesis", hint: "Your central claim", rows: 2 },
  { key: "outline", label: "Outline", hint: "Map the order of your ideas", rows: 4 },
  { key: "argument", label: "Argument", hint: "How will you support the claim?", rows: 3 },
  { key: "evidence", label: "Evidence", hint: "Notes on sources or examples", rows: 3 },
  { key: "revisionGoal", label: "Revision goal", hint: "What will you focus on next?", rows: 2 },
];

const sourceFields: { key: keyof Omit<EssaySource, "id" | "type" | "authorIsOrganization">; label: string; placeholder?: string }[] = [
  { key: "authors", label: "Author(s)", placeholder: "Separate multiple names with semicolons" },
  { key: "title", label: "Title" },
  { key: "containerTitle", label: "Book / journal / site" },
  { key: "publisher", label: "Publisher" },
  { key: "year", label: "Year" },
  { key: "month", label: "Month" },
  { key: "day", label: "Day" },
  { key: "volume", label: "Volume" },
  { key: "issue", label: "Issue" },
  { key: "pages", label: "Pages" },
  { key: "doi", label: "DOI" },
  { key: "url", label: "URL" },
  { key: "accessedDate", label: "Accessed date" },
  { key: "pageNumber", label: "Page number" },
];

const fieldClass =
  "w-full rounded border border-white/[0.08] bg-black/25 px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none transition-colors focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/10";
const smallLabel = "mb-1.5 block text-[11px] font-medium tracking-wide text-zinc-400";

export default function EssayWorkspaceTools({
  plan,
  sources,
  citationStyle,
  suggestions,
  notice,
  isProofreading,
  isBusy,
  canProofread,
  citationPreviews,
  onPlanChange,
  onCitationStyleChange,
  onAddSource,
  onRemoveSource,
  onInsertCitation,
  onProofread,
  onAcceptSuggestion,
  onRejectSuggestion,
}: EssayWorkspaceToolsProps) {
  const [sourceFormOpen, setSourceFormOpen] = useState(false);
  const [sourceDraft, setSourceDraft] = useState<SourceDraft>({ ...EMPTY_SOURCE });

  const hasSourceDetails = Object.entries(sourceDraft).some(
    ([key, value]) => key !== "type" && key !== "authorIsOrganization" && typeof value === "string" && value.trim().length > 0,
  );

  const submitSource = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasSourceDetails || !sourceDraft.type) return;
    onAddSource({ ...sourceDraft, type: sourceDraft.type });
    setSourceDraft({ ...EMPTY_SOURCE });
    setSourceFormOpen(false);
  };

  return (
    <section
      aria-label="Essay tools"
      className="min-w-0 space-y-5 text-zinc-200"
      data-testid="essay-workspace-tools"
    >
      {notice && (
        <p role="status" aria-live="polite" className="rounded border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-100/80" data-testid="status-essay-notice">
          {notice}
        </p>
      )}
      <section
        aria-labelledby="essay-plan-heading"
        className="rounded-lg border border-white/[0.07] bg-[#101114]/90 p-4 sm:p-5"
        data-testid="section-essay-plan"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-400/75">Start with the shape</p>
            <h2 id="essay-plan-heading" className="text-base font-semibold text-zinc-100">Plan your essay</h2>
          </div>
          <BookOpen aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-amber-400/70" />
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {planFields.map(({ key, label, hint, rows }) => (
            <div className={key === "outline" || key === "evidence" ? "sm:col-span-2" : ""} key={key}>
              <label className={smallLabel} htmlFor={`essay-plan-${key}`}>{label}</label>
              <textarea
                id={`essay-plan-${key}`}
                data-testid={`input-plan-${key}`}
                value={plan[key]}
                onChange={(event) => onPlanChange({ [key]: event.target.value })}
                placeholder={hint}
                rows={rows}
                className={`${fieldClass} resize-y`}
              />
            </div>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="essay-sources-heading"
        className="rounded-lg border border-white/[0.07] bg-[#101114]/90 p-4 sm:p-5"
        data-testid="section-essay-sources"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-400/75">Your research</p>
            <h2 id="essay-sources-heading" className="text-base font-semibold text-zinc-100">Sources & citations</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="essay-citation-style">Citation style</label>
            <select
              id="essay-citation-style"
              data-testid="select-citation-style"
              value={citationStyle}
              onChange={(event) => onCitationStyleChange(event.target.value as EssayCitationStyle)}
              className={`${fieldClass} min-h-10 w-auto min-w-[132px] py-2`}
            >
              <option value="APA7">APA 7</option>
              <option value="MLA9">MLA 9</option>
            </select>
            <button
              type="button"
              onClick={() => setSourceFormOpen((open) => !open)}
              aria-expanded={sourceFormOpen}
              aria-controls="essay-source-form"
              data-testid="button-toggle-source-form"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded border border-amber-500/25 bg-amber-500/10 px-3 text-xs font-semibold text-amber-200 transition-colors hover:border-amber-400/50 hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
            >
              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
              Add source
            </button>
          </div>
        </div>

        {sourceFormOpen && (
          <form
            id="essay-source-form"
            onSubmit={submitSource}
            className="mt-4 rounded-md border border-white/[0.07] bg-black/20 p-3 sm:p-4"
            data-testid="form-add-source"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-zinc-200">Source details</h3>
              <button
                type="button"
                onClick={() => {
                  setSourceFormOpen(false);
                  setSourceDraft({ ...EMPTY_SOURCE });
                }}
                aria-label="Close source form"
                data-testid="button-close-source-form"
                className="mobile-tap-target inline-flex h-9 w-9 items-center justify-center rounded text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={smallLabel} htmlFor="essay-source-type">Type</label>
                <select
                  id="essay-source-type"
                  data-testid="input-source-type"
                  value={sourceDraft.type}
                  onChange={(event) => setSourceDraft((draft) => ({ ...draft, type: event.target.value as SourceDraft["type"] }))}
                  className={fieldClass}
                >
                  <option value="">Choose a type</option>
                  <option value="book">Book</option>
                  <option value="journal">Journal</option>
                  <option value="website">Website</option>
                </select>
              </div>
              {sourceFields.map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className={smallLabel} htmlFor={`essay-source-${key}`}>{label}</label>
                  <input
                    id={`essay-source-${key}`}
                    data-testid={`input-source-${key}`}
                    type="text"
                    value={sourceDraft[key]}
                    onChange={(event) => setSourceDraft((draft) => ({ ...draft, [key]: event.target.value }))}
                    placeholder={placeholder}
                    className={fieldClass}
                  />
                </div>
              ))}
            </div>
            <label className="mt-3 inline-flex min-h-10 items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                data-testid="checkbox-source-organization"
                checked={Boolean(sourceDraft.authorIsOrganization)}
                onChange={(event) => setSourceDraft((draft) => ({ ...draft, authorIsOrganization: event.target.checked }))}
                className="h-4 w-4 accent-amber-400"
              />
              Author is an organization
            </label>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setSourceFormOpen(false);
                  setSourceDraft({ ...EMPTY_SOURCE });
                }}
                data-testid="button-cancel-source"
                className="min-h-11 rounded border border-white/[0.1] px-4 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!hasSourceDetails || !sourceDraft.type}
                data-testid="button-save-source"
                className="min-h-11 rounded border border-amber-500/30 bg-amber-500/10 px-4 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Save source
              </button>
            </div>
          </form>
        )}

        {sources.length === 0 ? (
          <div
            className="mt-4 rounded-md border border-dashed border-white/[0.1] px-4 py-6 text-center"
            data-testid="empty-essay-sources"
          >
            <p className="text-sm text-zinc-400">No sources added yet.</p>
            <p className="mt-1 text-xs text-zinc-600">Add details from your own research to build citations.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {sources.map((source) => {
              const preview = citationPreviews[source.id];
              return (
                <article
                  key={source.id}
                  className="min-w-0 rounded-md border border-white/[0.07] bg-black/20 p-3 sm:p-4"
                  data-testid={`card-essay-source-${source.id}`}
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{source.type}</p>
                      <h3 className="mt-1 break-words text-sm font-medium text-zinc-200">{source.title || "Untitled source"}</h3>
                      {source.authors && <p className="mt-1 break-words text-xs text-zinc-500">{source.authors}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveSource(source.id)}
                      aria-label={`Remove ${source.title || "source"}`}
                      data-testid={`button-remove-source-${source.id}`}
                      className="mobile-tap-target inline-flex h-10 w-10 shrink-0 items-center justify-center rounded border border-white/[0.08] text-zinc-500 transition-colors hover:border-red-400/30 hover:bg-red-400/5 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
                    >
                      <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">
                    <div className="min-w-0 rounded bg-white/[0.025] p-3">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">In-text</p>
                      <p className="break-words text-xs leading-relaxed text-zinc-300" data-testid={`text-citation-intext-${source.id}`}>
                        {preview?.inText || "Preview unavailable"}
                      </p>
                    </div>
                    <div className="min-w-0 rounded bg-white/[0.025] p-3">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Reference</p>
                      <p className="break-words text-xs leading-relaxed text-zinc-300" data-testid={`text-citation-reference-${source.id}`}>
                        {preview?.reference || "Preview unavailable"}
                      </p>
                    </div>
                  </div>

                  {preview?.warnings?.length ? (
                    <ul className="mt-3 space-y-1" aria-label="Citation warnings" data-testid={`list-citation-warnings-${source.id}`}>
                      {preview.warnings.map((warning, index) => (
                        <li key={`${source.id}-warning-${index}`} className="text-xs leading-relaxed text-amber-200/80">
                          {warning}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => onInsertCitation(source.id)}
                    data-testid={`button-insert-citation-${source.id}`}
                    className="mt-3 inline-flex min-h-10 items-center gap-2 rounded border border-white/[0.1] px-3 text-xs font-medium text-zinc-300 transition-colors hover:border-amber-400/30 hover:bg-amber-400/5 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
                  >
                    <Quote aria-hidden="true" className="h-3.5 w-3.5" />
                    Insert citation
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section
        aria-labelledby="essay-revision-heading"
        className="rounded-lg border border-white/[0.07] bg-[#101114]/90 p-4 sm:p-5"
        data-testid="section-essay-revision"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-400/75">Your words stay yours</p>
            <h2 id="essay-revision-heading" className="text-base font-semibold text-zinc-100">Proofreading</h2>
          </div>
          <button
            type="button"
            onClick={onProofread}
            disabled={isProofreading || isBusy || !canProofread}
            data-testid="button-proofread"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded border border-amber-500/25 bg-amber-500/10 px-4 text-xs font-semibold text-amber-200 transition-colors hover:border-amber-400/45 hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 disabled:cursor-wait disabled:opacity-60"
          >
            <RotateCcw aria-hidden="true" className={`h-3.5 w-3.5 ${isProofreading ? "animate-spin" : ""}`} />
            {isProofreading ? "Reviewing…" : "Review writing"}
          </button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-zinc-500">
          {canProofread
            ? "Suggestions are optional. Nothing changes in your draft until you choose an action."
            : "Add draft text before requesting a review."}
        </p>

        {isProofreading && (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 rounded border border-white/[0.07] bg-black/20 p-3"
            data-testid="status-proofreading"
          >
            <span className="inline-block h-3 w-28 animate-pulse rounded bg-white/[0.08] align-middle" aria-hidden="true" />
            <span className="sr-only">Reviewing your writing</span>
          </div>
        )}

        {!isProofreading && suggestions.length === 0 && (
          <div className="mt-4 rounded-md border border-dashed border-white/[0.1] px-4 py-6 text-center" data-testid="empty-essay-suggestions">
            <p className="text-sm text-zinc-400">No suggestions to review.</p>
            <p className="mt-1 text-xs text-zinc-600">Request a review when you are ready.</p>
          </div>
        )}

        {!isProofreading && suggestions.length > 0 && (
          <div className="mt-4 space-y-3" aria-label="Proofreading suggestions">
            {suggestions.map((suggestion) => (
              <article
                key={suggestion.id}
                className="rounded-md border border-white/[0.07] bg-black/20 p-3 sm:p-4"
                data-testid={`card-suggestion-${suggestion.id}`}
              >
                <div className="mb-3 flex items-center gap-2">
                  <span className="rounded border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] font-medium capitalize text-zinc-400">
                    {suggestion.category}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="min-w-0 rounded border border-white/[0.05] p-3">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Original</p>
                    <p className="break-words text-sm leading-relaxed text-zinc-400">{suggestion.original}</p>
                  </div>
                  <div className="min-w-0 rounded border border-amber-500/10 bg-amber-500/[0.035] p-3">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400/65">Suggestion</p>
                    <p className="break-words text-sm leading-relaxed text-zinc-200">{suggestion.replacement}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-zinc-500" data-testid={`text-suggestion-explanation-${suggestion.id}`}>
                  {suggestion.explanation}
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => onRejectSuggestion(suggestion.id)}
                    data-testid={`button-reject-suggestion-${suggestion.id}`}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded border border-white/[0.09] px-3 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
                  >
                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                    Keep original
                  </button>
                  <button
                    type="button"
                    onClick={() => onAcceptSuggestion(suggestion.id)}
                    data-testid={`button-accept-suggestion-${suggestion.id}`}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded border border-amber-500/25 bg-amber-500/10 px-3 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
                  >
                    <Check aria-hidden="true" className="h-3.5 w-3.5" />
                    Accept
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
