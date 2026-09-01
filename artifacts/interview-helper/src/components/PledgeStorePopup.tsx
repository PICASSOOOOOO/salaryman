import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch, apiUrl } from "@/lib/api-client";
import { Loader2, X, Lock, Check, ShoppingBag } from "lucide-react";

interface PledgePopupItem {
  id: string;
  category: string;
  name: string;
  blurb: string;
  effect: string;
  priceUsd: number;
  icon: string;
}

interface OpenOptions {
  /** Optional context line explaining why the popup appeared. */
  reason?: string;
}

interface PledgePopupContextValue {
  openPledgePopup: (opts?: OpenOptions) => void;
  closePledgePopup: () => void;
}

const PledgePopupContext = createContext<PledgePopupContextValue>({
  openPledgePopup: () => {},
  closePledgePopup: () => {},
});

/** Trigger the reusable Pledge Store popup from anywhere in the terminal. */
export function usePledgePopup(): PledgePopupContextValue {
  return useContext(PledgePopupContext);
}

export function PledgeStorePopupProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading, login } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [items, setItems] = useState<PledgePopupItem[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("");

  const load = useCallback(async () => {
    if (authLoading) return;
    setLoading(true);
    try {
      const reqs: Promise<Response>[] = [apiFetch("/api/pledge/popup")];
      if (isAuthenticated) reqs.push(apiFetch("/api/pledge/owned"));
      const [popRes, ownedRes] = await Promise.all(reqs);
      const pop = await popRes.json();
      setItems(pop.items ?? []);
      if (ownedRes && ownedRes.ok) {
        const o = await ownedRes.json();
        setOwned(new Set<string>(o.itemIds ?? []));
      }
      setLoaded(true);
    } catch {
      /* ignore — surface nothing rather than a dead-end */
    } finally {
      setLoading(false);
    }
  }, [authLoading, isAuthenticated]);

  const openPledgePopup = useCallback(
    (opts?: OpenOptions) => {
      setReason(opts?.reason ?? "");
      setNotice("");
      setOpen(true);
      if (!loaded) load();
    },
    [load, loaded],
  );

  const closePledgePopup = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const buy = async (item: PledgePopupItem) => {
    if (authLoading) {
      setNotice("Restoring your session — try again in a moment.");
      return;
    }
    if (!isAuthenticated) {
      closePledgePopup();
      login(window.location.pathname + window.location.search);
      return;
    }
    setBuying(item.id);
    setNotice("");
    try {
      const res = await apiFetch("/api/pledge/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.granted) {
        setNotice(`${item.name} unlocked — owner privileges.`);
        setOwned((prev) => new Set(prev).add(item.id));
      } else {
        setNotice(data.error ?? "Checkout is unavailable right now.");
      }
    } catch {
      setNotice("Network error — try again.");
    } finally {
      setBuying(null);
    }
  };

  return (
    <PledgePopupContext.Provider value={{ openPledgePopup, closePledgePopup }}>
      {children}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Backdrop — clicking it is a decline path. */}
            <div
              aria-hidden
              onClick={closePledgePopup}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />

            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Pledge Store"
              className="relative z-10 w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl border border-sky-500/25 bg-[#06090f] shadow-2xl"
              initial={{ scale: 0.94, y: 16, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, y: 12, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
            >
              {/* Header */}
              <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4 border-b border-white/10 bg-[#06090f]/95 backdrop-blur">
                <div className="flex items-center gap-2">
                  <span className="grid place-items-center w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30">
                    <ShoppingBag className="w-4 h-4 text-sky-400" />
                  </span>
                  <div>
                    <h2 className="font-bold tracking-wide leading-none text-zinc-100">Pledge Store</h2>
                    <p className="text-[11px] text-zinc-400 mt-1 leading-tight">
                      {reason || "Unlock this with a one-time pledge."}
                    </p>
                  </div>
                </div>
                <button
                  onClick={closePledgePopup}
                  aria-label="Close"
                  className="shrink-0 grid place-items-center w-8 h-8 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="px-5 py-4 space-y-3">
                {notice && (
                  <div className="px-3 py-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-300 text-xs">
                    {notice}
                  </div>
                )}

                {loading && items.length === 0 ? (
                  <div className="flex items-center justify-center py-10 text-zinc-500">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : items.length === 0 ? (
                  <p className="py-8 text-center text-sm text-zinc-500">
                    Nothing for sale here right now.
                  </p>
                ) : (
                  items.map((item) => {
                    const isOwned = owned.has(item.id);
                    return (
                      <div
                        key={item.id}
                        className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3"
                      >
                        {/* Artwork */}
                        <div className="shrink-0 grid place-items-center w-14 h-14 rounded-lg bg-gradient-to-br from-sky-500/15 to-indigo-500/10 border border-white/10 text-lg font-bold text-zinc-400">
                          {item.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-semibold text-sm text-zinc-100 truncate">{item.name}</h3>
                            <span className="shrink-0 text-sm font-bold text-sky-300">
                              ${item.priceUsd}
                            </span>
                          </div>
                          <p className="text-[11px] leading-relaxed text-zinc-400 mt-0.5">{item.effect}</p>
                          <div className="mt-2">
                            {isOwned ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 text-xs font-semibold">
                                <Check className="w-3.5 h-3.5" /> Owned
                              </span>
                            ) : (
                              <button
                                onClick={() => buy(item)}
                                disabled={buying === item.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-black text-xs font-bold transition-colors"
                              >
                                {buying === item.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Lock className="w-3.5 h-3.5" />
                                )}
                                Unlock
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer — explicit decline path */}
              <div className="px-5 pb-4 pt-1">
                <button
                  onClick={closePledgePopup}
                  className="w-full py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
                >
                  Maybe later
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PledgePopupContext.Provider>
  );
}
