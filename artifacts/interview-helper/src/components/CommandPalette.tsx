import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Loader2, Search, CornerDownLeft, ArrowRight, MessageSquare, ExternalLink } from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { apiFetch } from "@/lib/api-client";
import { sanitizeReturnPath } from "@/lib/safe-path";
import { onOpenCommandPalette } from "@/lib/command-palette-bus";
import { searchCatalog, catalogForPrompt, labelForPath, type PageEntry } from "@/lib/page-catalog";
import { useFeatureLabel } from "@/hooks/use-feature-label";

// The classroom/conference area is named dynamically per org. The static
// catalog always labels /creative/classroom "Classroom"; override the DISPLAYED
// label so non-education users see "Conference" in the palette too.
const CLASSROOM_PATH = "/creative/classroom";

type PabloAction =
  | { kind: "navigate"; path: string }
  | { kind: "logout" }
  | { kind: "search"; query: string }
  | { kind: "external"; url: string }
  | { kind: "suggest"; items: Array<{ label: string; path: string }> };

type Suggestion = { label: string; path: string };

// The palette's Pablo-driven outcome. Local instant matches render
// independently from this.
type Outcome =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "reply"; say: string }
  | { type: "suggest"; say: string; items: Suggestion[] }
  | { type: "external"; say: string; url: string };

export function CommandPalette() {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<Outcome>({ type: "idle" });
  const historyRef = useRef<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const reqIdRef = useRef(0);

  // Open via the global bus (nav search box) ...
  useEffect(() => onOpenCommandPalette(() => setOpen(true)), []);

  // ... and via Cmd/Ctrl+K anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset transient state whenever the palette closes.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setOutcome({ type: "idle" });
    }
  }, [open]);

  const { label: featureLabel } = useFeatureLabel();

  // Swap the static "Classroom" catalog label for the org's dynamic name.
  const displayLabel = useCallback(
    (path: string, label: string) =>
      path.split("?")[0] === CLASSROOM_PATH ? featureLabel : label,
    [featureLabel],
  );

  const go = useCallback((path: string) => {
    const safe = sanitizeReturnPath(path);
    if (!safe) return;
    setOpen(false);
    navigate(safe);
  }, [navigate]);

  const localMatches: PageEntry[] = query.trim() ? searchCatalog(query, 6) : [];

  const askPablo = useCallback(async () => {
    const transcript = query.trim();
    if (!transcript) return;
    const reqId = ++reqIdRef.current;
    setOutcome({ type: "loading" });
    try {
      const res = await apiFetch("api/chat/pablo/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          history: historyRef.current.slice(-10),
          pages: catalogForPrompt(),
        }),
      });
      if (reqId !== reqIdRef.current) return; // superseded by a newer query
      if (!res.ok) {
        let say = "My line dropped — try that again.";
        try {
          const body = await res.json();
          if (body?.say) say = body.say;
        } catch { /* keep default */ }
        setOutcome({ type: "reply", say });
        return;
      }
      const data = (await res.json()) as { say: string; action: PabloAction | null };
      if (reqId !== reqIdRef.current) return;
      const say = data.say ?? "";
      const action = data.action;
      historyRef.current = [
        ...historyRef.current,
        { role: "user" as const, content: transcript },
        { role: "assistant" as const, content: say },
      ].slice(-20);

      if (action && action.kind === "navigate") {
        const safe = sanitizeReturnPath(action.path);
        if (safe) { go(safe); return; }
        setOutcome({ type: "reply", say: say || "I couldn't find a safe page for that." });
        return;
      }
      if (action && action.kind === "suggest") {
        const items = (Array.isArray(action.items) ? action.items : [])
          .map(it => {
            const safe = sanitizeReturnPath(it?.path);
            if (!safe) return null;
            return { label: it.label || labelForPath(safe), path: safe } as Suggestion;
          })
          .filter((x): x is Suggestion => x !== null)
          .slice(0, 6);
        if (items.length === 1) { go(items[0].path); return; }
        if (items.length === 0) {
          // Fall back to local matches so the user is never stranded.
          const local = searchCatalog(transcript, 6).map(e => ({ label: e.label, path: e.path }));
          if (local.length === 1) { go(local[0].path); return; }
          setOutcome(local.length
            ? { type: "suggest", say: say || "Closest matches I've got:", items: local }
            : { type: "reply", say: say || "I'm not sure where that lives." });
          return;
        }
        setOutcome({ type: "suggest", say: say || "A few places that might be it:", items });
        return;
      }
      if (action && action.kind === "external") {
        setOutcome({ type: "external", say: say || "Off-platform link:", url: action.url });
        return;
      }
      if (action && action.kind === "search") {
        const local = searchCatalog(action.query || transcript, 6).map(e => ({ label: e.label, path: e.path }));
        setOutcome(local.length
          ? { type: "suggest", say: say || "Here's what I found:", items: local }
          : { type: "reply", say: say || "Nothing matched that." });
        return;
      }
      if (action && action.kind === "logout") {
        window.location.href = `${import.meta.env.BASE_URL}api/logout`;
        return;
      }
      // No action — a normal spoken/text reply (e.g. "what's my MRR?").
      setOutcome({ type: "reply", say: say || "I'm here." });
    } catch {
      if (reqId !== reqIdRef.current) return;
      setOutcome({ type: "reply", say: "My line dropped — try that again." });
    }
  }, [query, go]);

  const loading = outcome.type === "loading";

  return (
    <CommandDialog open={open} onOpenChange={setOpen} commandProps={{ shouldFilter: false }}>
      <CommandInput
        placeholder="Search pages or ask Pablo where to go…"
        value={query}
        onValueChange={(v) => { setQuery(v); if (outcome.type !== "idle" && outcome.type !== "loading") setOutcome({ type: "idle" }); }}
      />
      <CommandList>
        {query.trim() === "" && (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            Type what you're looking for — e.g. <span className="text-foreground">"payroll"</span>,{" "}
            <span className="text-foreground">"gear store"</span>, or{" "}
            <span className="text-foreground">"where do I see invoices"</span>.
          </div>
        )}

        {/* Ask-Pablo affordance — the smart router. Default-selected so a plain
            Enter on a natural-language query routes through Pablo. */}
        {query.trim() !== "" && (
          <CommandGroup heading="Ask Pablo">
            <CommandItem
              value={`__ask_pablo__ ${query}`}
              onSelect={() => void askPablo()}
              disabled={loading}
            >
              {loading
                ? <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
                : <Search className="h-4 w-4 text-sky-400" />}
              <span className="truncate">
                {loading ? "Pablo is finding it…" : <>Ask Pablo: <span className="text-foreground">"{query.trim()}"</span></>}
              </span>
              {!loading && <CornerDownLeft className="ml-auto h-3.5 w-3.5 text-muted-foreground" />}
            </CommandItem>
          </CommandGroup>
        )}

        {/* Pablo's best-guess suggestions when it wasn't confident in one page. */}
        {outcome.type === "suggest" && outcome.items.length > 0 && (
          <CommandGroup heading="Suggestions">
            {outcome.items.map((s, i) => (
              <CommandItem key={`${s.path}-${i}`} value={`suggest-${s.path}-${i}`} onSelect={() => go(s.path)}>
                <ArrowRight className="h-4 w-4 text-emerald-400" />
                <span className="truncate">{displayLabel(s.path, s.label)}</span>
                <span className="ml-auto truncate text-[11px] text-muted-foreground">{s.path}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Pablo's spoken/text reply for non-navigation questions. */}
        {outcome.type === "reply" && (
          <div className="flex items-start gap-2 px-4 py-4 text-sm text-foreground">
            <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
            <p className="leading-relaxed">{outcome.say}</p>
          </div>
        )}

        {/* Explicit off-platform link — opened only on a deliberate click. */}
        {outcome.type === "external" && (
          <CommandGroup heading="Open externally">
            <CommandItem
              value={`external-${outcome.url}`}
              onSelect={() => { window.open(outcome.url, "_blank", "noopener,noreferrer"); setOpen(false); }}
            >
              <ExternalLink className="h-4 w-4 text-amber-400" />
              <span className="truncate">{outcome.say}</span>
              <span className="ml-auto truncate text-[11px] text-muted-foreground">{outcome.url}</span>
            </CommandItem>
          </CommandGroup>
        )}

        {/* Instant local page matches as you type — free, no Pablo charge. */}
        {localMatches.length > 0 && (
          <CommandGroup heading="Pages">
            {localMatches.map((e) => (
              <CommandItem key={e.path} value={`page-${e.path}`} onSelect={() => go(e.path)}>
                <ArrowRight className="h-4 w-4 text-zinc-500" />
                <span className="truncate">{displayLabel(e.path, e.label)}</span>
                <span className="ml-auto truncate text-[11px] text-muted-foreground">{e.group}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {query.trim() !== "" && localMatches.length === 0 && outcome.type === "idle" && (
          <CommandEmpty>No page matches — press Enter to ask Pablo.</CommandEmpty>
        )}
      </CommandList>
    </CommandDialog>
  );
}
