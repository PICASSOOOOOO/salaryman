import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bell, AlertTriangle, Calendar, Briefcase, MessageSquare } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@workspace/replit-auth-web";

type FeedItem = {
  id: string;
  kind: "job_offer" | "appointment_soon" | "dm_unread";
  title: string;
  body: string;
  action: { path: string; label: string } | null;
  severity: "info" | "warn" | "urgent";
  createdAt: string;
};

const POLL_MS = 60_000;
const DISMISS_KEY = "pablo-notifier-dismissed-v1";

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { id: string; at: number }[];
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return new Set(parsed.filter((p) => p.at > cutoff).map((p) => p.id));
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>) {
  const arr = Array.from(ids).map((id) => ({ id, at: Date.now() }));
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify(arr)); } catch {}
}

function iconFor(kind: FeedItem["kind"]) {
  switch (kind) {
    case "job_offer": return Briefcase;
    case "appointment_soon": return Calendar;
    case "dm_unread": return MessageSquare;
    default: return Bell;
  }
}

function colorFor(severity: FeedItem["severity"]) {
  switch (severity) {
    case "urgent": return { ring: "ring-red-500/40", bar: "bg-red-500", icon: "text-red-400", glow: "shadow-red-500/20" };
    case "warn": return { ring: "ring-amber-500/40", bar: "bg-amber-500", icon: "text-amber-400", glow: "shadow-amber-500/20" };
    default: return { ring: "ring-sky-500/30", bar: "bg-sky-500", icon: "text-sky-400", glow: "shadow-sky-500/20" };
  }
}

export function PabloNotifier() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());

  const fetchFeed = useCallback(async () => {
    try {
      const res = await apiFetch("/api/me/pablo-feed");
      if (!res.ok) return;
      const data = (await res.json()) as { items: FeedItem[] };
      setItems(data.items ?? []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchFeed();
    const id = setInterval(fetchFeed, POLL_MS);
    return () => clearInterval(id);
  }, [isAuthenticated, fetchFeed]);

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    saveDismissed(next);
  };

  if (!isAuthenticated) return null;

  const visible = items.filter((it) => !dismissed.has(it.id)).slice(0, 3);
  if (visible.length === 0) return null;

  return (
    <div
      className="fixed z-[60] flex flex-col gap-2 pointer-events-none"
      style={{ bottom: 88, right: 16, maxWidth: 340 }}
    >
      <AnimatePresence>
        {visible.map((it) => {
          const Icon = iconFor(it.kind);
          const c = colorFor(it.severity);
          return (
            <motion.div
              key={it.id}
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              className={`pointer-events-auto relative bg-zinc-950/95 backdrop-blur-xl border border-zinc-800 rounded-xl ring-1 ${c.ring} shadow-xl ${c.glow} overflow-hidden`}
              data-testid={`pablo-notifier-${it.kind}`}
            >
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${c.bar}`} />
              <div className="p-3 pl-4">
                <div className="flex items-start gap-2.5">
                  <div className={`mt-0.5 ${c.icon}`}>
                    {it.severity === "urgent" ? <AlertTriangle className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Pablo</span>
                      {it.severity === "urgent" && (
                        <span className="text-[9px] font-mono uppercase text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">Now</span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-zinc-100 leading-tight">{it.title}</div>
                    <div className="text-xs text-zinc-400 mt-1 leading-relaxed">{it.body}</div>
                    {it.action && (
                      <button
                        onClick={() => {
                          if (it.action) navigate(it.action.path);
                          dismiss(it.id);
                        }}
                        className="mt-2 text-xs font-mono uppercase tracking-wider text-sky-400 hover:text-sky-300 transition-colors"
                        data-testid={`pablo-notifier-action-${it.kind}`}
                      >
                        {it.action.label} →
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => dismiss(it.id)}
                    className="text-zinc-600 hover:text-zinc-300 transition-colors -mt-0.5"
                    aria-label="Dismiss"
                    data-testid={`pablo-notifier-dismiss-${it.kind}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
