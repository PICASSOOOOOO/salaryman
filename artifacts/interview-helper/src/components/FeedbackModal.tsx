import { useState } from "react";
import { Check, CircleAlert, Loader2, MessageSquare, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useAlpha } from "@/hooks/use-alpha";

const CATEGORIES = ["Bug", "UI Issue", "Feature Request", "Performance", "Other"] as const;
type Category = typeof CATEGORIES[number];
type Kind = "bug" | "feedback";

interface Props {
  onClose: () => void;
}

export function FeedbackModal({ onClose }: Props) {
  const alpha = useAlpha();
  const canSubmitBugs = alpha.canSubmitBugs;
  const [kind, setKind] = useState<Kind>(canSubmitBugs ? "bug" : "feedback");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("Bug");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<"synced" | "pending" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim()) { setError("Add a short title."); return; }
    if (!description.trim()) { setError("Describe what happened."); return; }
    setSaving(true);
    setError(null);
    try {
      const response = await apiFetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category: kind === "bug" ? category : "Other",
          kind,
          screenshotUrl: screenshotUrl.trim() || undefined,
          appVersion: typeof __BUILD_VERSION__ !== "undefined" ? __BUILD_VERSION__ : undefined,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not file this report.");
      setResult(body.githubSync?.status === "synced" ? "synced" : "pending");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Could not file this report.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/35 p-4"
      role="presentation"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        className="w-full max-w-lg border border-black bg-[#FAFAF7] text-black shadow-[5px_5px_0_#000]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
      >
        <div className="flex items-center justify-between border-b border-black px-4 py-3">
          <div className="flex items-center gap-2">
            {kind === "bug" ? <CircleAlert className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
            <h2 id="feedback-title" className="font-mono text-xs font-bold uppercase tracking-[0.16em]">
              {kind === "bug" ? "Report a bug" : "Send feedback"}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 hover:bg-black/5" aria-label="Close feedback form">
            <X className="h-4 w-4" />
          </button>
        </div>

        {result ? (
          <div className="space-y-4 px-4 py-10 text-center">
            <Check className="mx-auto h-8 w-8" />
            <div>
              <p className="font-mono text-sm font-bold uppercase tracking-wider">Report filed</p>
              <p className="mt-2 text-xs text-black/60">
                Saved to SALARYMAN triage{result === "synced" ? " and sent to GitHub." : ". GitHub sync will retry from admin."}
              </p>
            </div>
            <button type="button" onClick={onClose} className="border border-black bg-black px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-white">
              Close
            </button>
          </div>
        ) : (
          <div className="space-y-4 px-4 py-4">
            <div className="grid grid-cols-2 gap-1 border border-black p-1">
              <button type="button" onClick={() => setKind("feedback")} className={`px-2 py-2 font-mono text-[10px] font-bold uppercase tracking-widest ${kind === "feedback" ? "bg-black text-white" : "hover:bg-black/5"}`}>
                Feedback
              </button>
              <button type="button" onClick={() => setKind("bug")} disabled={!canSubmitBugs} className={`px-2 py-2 font-mono text-[10px] font-bold uppercase tracking-widest ${kind === "bug" ? "bg-black text-white" : "hover:bg-black/5"} disabled:cursor-not-allowed disabled:opacity-35`}>
                Bug report
              </button>
            </div>
            <label className="block">
              <span className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-widest">Title</span>
              <input value={title} onChange={(event) => setTitle(event.target.value.slice(0, 500))} className="w-full border border-black bg-transparent px-3 py-2 text-sm outline-none" placeholder="What should we know?" />
            </label>
            {kind === "bug" && (
              <label className="block">
                <span className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-widest">Category</span>
                <select value={category} onChange={(event) => setCategory(event.target.value as Category)} className="w-full border border-black bg-transparent px-3 py-2 text-sm outline-none">
                  {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            )}
            <label className="block">
              <span className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-widest">Details</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value.slice(0, 10000))} rows={5} className="w-full resize-y border border-black bg-transparent px-3 py-2 text-sm outline-none" placeholder={kind === "bug" ? "Steps to reproduce, expected result, and what happened." : "Tell the team what you noticed."} />
            </label>
            <label className="block">
              <span className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-widest">Screenshot URL <span className="font-normal normal-case tracking-normal text-black/50">(optional)</span></span>
              <input value={screenshotUrl} onChange={(event) => setScreenshotUrl(event.target.value.slice(0, 2048))} className="w-full border border-black bg-transparent px-3 py-2 text-sm outline-none" placeholder="https://..." inputMode="url" />
            </label>
            {error && <p className="border border-black px-3 py-2 font-mono text-[11px]">{error}</p>}
            <div className="flex items-center justify-end gap-2 border-t border-black/15 pt-3">
              <button type="button" onClick={onClose} className="border border-black px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-black/5">Cancel</button>
              <button type="button" onClick={submit} disabled={saving} className="flex items-center gap-2 border border-black bg-black px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-white disabled:opacity-50">
                {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                {saving ? "Filing..." : "File report"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}