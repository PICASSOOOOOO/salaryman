import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { usePlan, type FeatureKey } from "@/hooks/use-plan";
import { apiFetch } from "@/lib/api-client";
import { Loader2, X, Lock, Check, ShoppingBag } from "lucide-react";

interface PledgePopupItem {
  id: string;
  category: string;
  name: string;
  blurb: string;
  effect: string;
  priceUsd: number;
  icon: string;
  subscriptionFeature: FeatureKey;
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
  const { features } = usePlan();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [items, setItems] = useState<PledgePopupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("");

  const load = useCallback(async () => {
    if (authLoading) return;
    setLoading(true);
    try {
      const popRes = await apiFetch("/api/pledge/popup");
      const pop = await popRes.json();
      setItems(pop.items ?? []);
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
    if (features.has(item.subscriptionFeature)) {
      setNotice(`${item.name} is already active on your account.`);
      return;
    }
    setBuying(item.id);
    setNotice("");
    try {
      const res = await apiFetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature: item.subscriptionFeature }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setNotice(data.message || data.error || "Monthly checkout is unavailable right now.");
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
              aria-label="Monthly plans"
              className="relative z-10 w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl border border-black bg-[#fffdf8] text-black shadow-2xl"
              initial={{ scale: 0.94, y: 16, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, y: 12, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
            >
              {/* Header */}
              <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4 border-b border-black/15 bg-[#fffdf8]/95 backdrop-blur">
                <div className="flex items-center gap-2">
                  <span className="grid place-items-center w-8 h-8 border border-black">
                    <ShoppingBag className="w-4 h-4" />
                  </span>
                  <div>
                    <h2 className="font-bold tracking-wide leading-none">Monthly plans</h2>
                    <p className="text-[11px] text-black/55 mt-1 leading-tight">
                      {reason || "Choose a SALARYMAN service plan."}
                    </p>
                  </div>
                </div>
                <button
                  onClick={closePledgePopup}
                  aria-label="Close"
                  className="shrink-0 grid place-items-center w-8 h-8 text-black/55 hover:text-black hover:bg-black/5 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="px-5 py-4 space-y-3">
                {notice && (
                  <div className="px-3 py-2 border border-black text-xs">
                    {notice}
                  </div>
                )}

                {loading && items.length === 0 ? (
                  <div className="flex items-center justify-center py-10 text-black/45">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : items.length === 0 ? (
                    <p className="py-8 text-center text-sm text-black/55">
                    No monthly plans are available right now.
                  </p>
                ) : (
                  items.map((item) => {
                    const isOwned = features.has(item.subscriptionFeature);
                    return (
                      <div
                        key={item.id}
                        className="flex gap-3 border border-black/15 bg-white p-3"
                      >
                        {/* Artwork */}
                        <div className="shrink-0 grid place-items-center w-14 h-14 border border-black/15 bg-black/[0.03] text-lg font-bold text-black/65">
                          {item.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-semibold text-sm truncate">{item.name}</h3>
                            <span className="shrink-0 text-sm font-bold">
                              ${item.priceUsd}/mo
                            </span>
                          </div>
                          <p className="text-[11px] leading-relaxed text-black/60 mt-0.5">{item.effect}</p>
                          <div className="mt-2">
                            {isOwned ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-black bg-black text-white text-xs font-semibold">
                                <Check className="w-3.5 h-3.5" /> Active
                              </span>
                            ) : (
                              <button
                                onClick={() => buy(item)}
                                disabled={buying === item.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-black bg-black hover:bg-white hover:text-black disabled:opacity-60 text-white text-xs font-bold transition-colors"
                              >
                                {buying === item.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Lock className="w-3.5 h-3.5" />
                                )}
                                Subscribe
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
