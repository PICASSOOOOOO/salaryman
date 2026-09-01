import { apiFetch } from "@/lib/api-client";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ScrollText, FileText, Download, Copy, Loader2, Sparkles,
  ShieldCheck, AlertTriangle, Check, RefreshCw, ChevronDown, ChevronUp,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { SignInPage } from "@/components/SignInPrompt";
import { getDefaultBoomerMode } from "@/hooks/use-mobile";

interface ContractType {
  key: string;
  label: string;
  blurb: string;
  sections: string[];
}

type Mode = "draft" | "review";

const EMPTY_DRAFT = {
  type: "nda",
  partyA: "",
  partyB: "",
  governingLaw: "Delaware, USA",
  effectiveDate: new Date().toISOString().slice(0, 10),
  terms: "",
  extraInstructions: "",
};

export default function Contracts() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useState(() => getDefaultBoomerMode());
  const [types, setTypes] = useState<ContractType[]>([]);
  const [mode, setMode] = useState<Mode>("draft");
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [reviewText, setReviewText] = useState("");
  const [reviewPerspective, setReviewPerspective] = useState<"buyer" | "seller" | "employer" | "employee" | "neutral">("neutral");
  const [output, setOutput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch("/api/business/contracts/types")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { types: ContractType[] }) => { if (alive) setTypes(d.types); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Auto-scroll output as tokens stream in.
  useEffect(() => {
    if (!outputRef.current) return;
    outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [output]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  const runStream = useCallback(async (path: string, body: unknown) => {
    setError(null);
    setOutput("");
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await apiFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            const evt = JSON.parse(payload) as { text?: string; error?: string; ok?: boolean };
            if (evt.error) throw new Error(evt.error);
            if (evt.text) setOutput((p) => p + evt.text);
          } catch {
            // partial frame — ignore
          }
        }
      }
    } catch (e: unknown) {
      if ((e as Error)?.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, []);

  const generateDraft = useCallback(() => {
    if (!draft.partyA.trim() || !draft.partyB.trim()) {
      setError("Both party names are required.");
      return;
    }
    void runStream("/api/business/contracts/draft", draft);
  }, [draft, runStream]);

  const reviewContract = useCallback(() => {
    if (!reviewText.trim()) {
      setError("Paste a contract to review.");
      return;
    }
    void runStream("/api/business/contracts/review", { text: reviewText, perspective: reviewPerspective });
  }, [reviewText, reviewPerspective, runStream]);

  const copyOutput = useCallback(async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Copy to clipboard failed.");
    }
  }, [output]);

  const downloadOutput = useCallback(() => {
    if (!output) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const labelKey = mode === "draft" ? draft.type : "review";
    const blob = new Blob([output], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contract-${labelKey}-${stamp}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [output, mode, draft.type]);

  if (!isAuthenticated) {
    return <SignInPage context="CONTRACTS — Pablo's law desk" />;
  }

  const activeType = types.find((t) => t.key === draft.type);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-amber-400/80 text-[10px] font-mono tracking-[0.3em] mb-1">
              <ScrollText className="w-3.5 h-3.5" />
              <span>OPS-CORE / LEGAL</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {boomerMode ? "CONTRACTS" : "Contracts"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Draft enforceable, signature-ready contracts in seconds. Pablo runs the pen — you review and sign. AI-generated drafts are not legal advice; have a licensed attorney in your jurisdiction review before execution.
            </p>
          </div>

          <button
            onClick={() => setShowHowItWorks((v) => !v)}
            className="self-start sm:self-end flex items-center gap-1.5 text-[11px] font-mono tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-how-it-works"
          >
            HOW IT WORKS {showHowItWorks ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </header>

        <AnimatePresence>
          {showHowItWorks && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm space-y-2">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-[11px] tracking-[0.2em]">
                  <ShieldCheck className="w-4 h-4" /> WHAT PABLO KNOWS
                </div>
                <ul className="text-muted-foreground space-y-1 list-disc list-inside">
                  <li>UCC Article 2 (sales of goods), Restatement (Second) of Contracts, common-law agency.</li>
                  <li>Federal Defend Trade Secrets Act (DTSA) and state-level non-compete enforceability (CA / ND / OK ban most).</li>
                  <li>AAA and JAMS arbitration rules. Standard reps & warranties practice.</li>
                  <li>Mark unsupplied facts with [BRACKETED PLACEHOLDERS] so you know what to fill.</li>
                  <li>Always ends with an attorney-review notice plus signature blocks.</li>
                </ul>
                <div className="pt-2 text-[11px] text-amber-400/70 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>Not legal advice. Pablo writes drafts. Lawyers approve them.</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mode toggle */}
        <div className="inline-flex rounded-lg border border-border bg-muted/20 p-1">
          {(["draft", "review"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setOutput(""); setError(null); }}
              className={`px-4 py-1.5 rounded-md text-xs font-mono tracking-[0.2em] transition-colors ${
                mode === m
                  ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`mode-${m}`}
            >
              {m === "draft" ? "DRAFT NEW" : "REVIEW EXISTING"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* INPUT PANEL */}
          <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
            {mode === "draft" ? (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Contract Type</label>
                  <select
                    value={draft.type}
                    onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500/50 transition-colors"
                    data-testid="select-contract-type"
                  >
                    {types.length === 0
                      ? <option value="nda">Loading…</option>
                      : types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                  {activeType && (
                    <p className="text-[11px] text-muted-foreground mt-1">{activeType.blurb}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field
                    label="Party A (your side)"
                    value={draft.partyA}
                    onChange={(v) => setDraft((d) => ({ ...d, partyA: v }))}
                    placeholder="Acme Inc., a Delaware corporation"
                    testId="input-party-a"
                  />
                  <Field
                    label="Party B (counterparty)"
                    value={draft.partyB}
                    onChange={(v) => setDraft((d) => ({ ...d, partyB: v }))}
                    placeholder="Jane Doe / Counterparty LLC"
                    testId="input-party-b"
                  />
                  <Field
                    label="Governing Law / Venue"
                    value={draft.governingLaw}
                    onChange={(v) => setDraft((d) => ({ ...d, governingLaw: v }))}
                    placeholder="Delaware, USA"
                    testId="input-governing-law"
                  />
                  <Field
                    label="Effective Date"
                    type="date"
                    value={draft.effectiveDate}
                    onChange={(v) => setDraft((d) => ({ ...d, effectiveDate: v }))}
                    testId="input-effective-date"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Key Business Terms</label>
                  <textarea
                    value={draft.terms}
                    onChange={(e) => setDraft((d) => ({ ...d, terms: e.target.value }))}
                    placeholder={"e.g. Fee: $5,000/month retainer, net-15. Term: 12 months auto-renew unless 60-day notice. IP: all deliverables work-for-hire to Party A. Confidentiality: 3 years post-term."}
                    rows={5}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500/50 transition-colors resize-y"
                    data-testid="input-terms"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Extra Instructions (optional)</label>
                  <textarea
                    value={draft.extraInstructions}
                    onChange={(e) => setDraft((d) => ({ ...d, extraInstructions: e.target.value }))}
                    placeholder="e.g. Favor Party A. Add mandatory AAA arbitration. Cap liability at fees paid in last 12 months."
                    rows={2}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500/50 transition-colors resize-y"
                    data-testid="input-extras"
                  />
                </div>

                <button
                  onClick={streaming ? stop : generateDraft}
                  disabled={!streaming && (!draft.partyA.trim() || !draft.partyB.trim())}
                  className="w-full flex items-center justify-center gap-2 bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-40 disabled:hover:bg-amber-500/15 border border-amber-500/40 text-amber-200 font-mono text-xs tracking-[0.25em] py-2.5 rounded-lg transition-colors"
                  data-testid="button-generate-draft"
                >
                  {streaming ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> STOP</>
                    : <><Sparkles className="w-3.5 h-3.5" /> DRAFT CONTRACT</>}
                </button>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Reviewing From Whose Perspective</label>
                  <select
                    value={reviewPerspective}
                    onChange={(e) => setReviewPerspective(e.target.value as typeof reviewPerspective)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500/50 transition-colors"
                    data-testid="select-perspective"
                  >
                    <option value="neutral">Neutral (both sides)</option>
                    <option value="buyer">Buyer / Customer</option>
                    <option value="seller">Seller / Vendor</option>
                    <option value="employer">Employer</option>
                    <option value="employee">Employee / Contractor</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Paste Contract Text</label>
                  <textarea
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="Paste the full contract here. Pablo flags high-risk clauses, missing protections, ambiguities, and ranks negotiation priorities."
                    rows={16}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-amber-500/50 transition-colors resize-y"
                    data-testid="input-review-text"
                  />
                  <div className="text-[10px] text-muted-foreground text-right">{reviewText.length.toLocaleString()} / 60,000 chars</div>
                </div>

                <button
                  onClick={streaming ? stop : reviewContract}
                  disabled={!streaming && !reviewText.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-40 disabled:hover:bg-amber-500/15 border border-amber-500/40 text-amber-200 font-mono text-xs tracking-[0.25em] py-2.5 rounded-lg transition-colors"
                  data-testid="button-review-contract"
                >
                  {streaming ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> STOP</>
                    : <><ShieldCheck className="w-3.5 h-3.5" /> REVIEW CONTRACT</>}
                </button>
              </>
            )}

            {error && (
              <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* OUTPUT PANEL */}
          <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3 flex flex-col min-h-[400px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[10px] font-mono tracking-[0.3em] text-muted-foreground">
                <FileText className="w-3.5 h-3.5" />
                {mode === "draft" ? "DRAFT" : "REVIEW"}
                {streaming && <span className="text-amber-400">• STREAMING</span>}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={copyOutput}
                  disabled={!output}
                  className="text-[10px] font-mono tracking-[0.2em] px-2 py-1 rounded border border-border hover:bg-muted/30 disabled:opacity-40 transition-colors flex items-center gap-1"
                  data-testid="button-copy"
                >
                  {copied ? <><Check className="w-3 h-3" /> COPIED</> : <><Copy className="w-3 h-3" /> COPY</>}
                </button>
                <button
                  onClick={downloadOutput}
                  disabled={!output}
                  className="text-[10px] font-mono tracking-[0.2em] px-2 py-1 rounded border border-border hover:bg-muted/30 disabled:opacity-40 transition-colors flex items-center gap-1"
                  data-testid="button-download"
                >
                  <Download className="w-3 h-3" /> .MD
                </button>
                <button
                  onClick={() => { setOutput(""); setError(null); }}
                  disabled={!output || streaming}
                  className="text-[10px] font-mono tracking-[0.2em] px-2 py-1 rounded border border-border hover:bg-muted/30 disabled:opacity-40 transition-colors flex items-center gap-1"
                  data-testid="button-clear"
                >
                  <RefreshCw className="w-3 h-3" /> CLEAR
                </button>
              </div>
            </div>

            <div
              ref={outputRef}
              className="flex-1 bg-background border border-border rounded-lg p-3 overflow-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-foreground/90 min-h-[320px] max-h-[640px]"
              data-testid="output-contract"
            >
              {output || (
                <div className="text-muted-foreground/60 text-xs italic">
                  {mode === "draft"
                    ? "Fill in the parties and click DRAFT CONTRACT. Output will stream here."
                    : "Paste a contract on the left and click REVIEW CONTRACT. Pablo will flag risks here."}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = "text", testId,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; testId?: string; }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={testId}
        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500/50 transition-colors"
      />
    </div>
  );
}
