import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Megaphone, Loader2, Link2, Unlink, Check, X, Lock, Zap, ArrowRight,
  Cloud, MessageSquare, Twitter, Linkedin, Instagram, Facebook, AtSign,
  Music2, Youtube, ExternalLink, AlertTriangle, ShieldCheck,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { usePlan } from "@/hooks/use-plan";

const CRT = "#38bdf8";
const FONT = "var(--font-sans)";

type AuthType = "app_password" | "webhook" | "oauth";

interface CredentialField {
  key: string;
  label: string;
  type: "text" | "password";
  placeholder?: string;
}

interface Connection {
  provider: string;
  label: string;
  authType: AuthType;
  available: boolean;
  requiresAppConfig: boolean;
  configured: boolean;
  credentialFields: CredentialField[];
  connectHint: string;
  status: string;
  accountHandle: string | null;
  accountName: string | null;
  connectedAt: string | null;
  lastError: string | null;
}

const PROVIDER_ICON: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  bluesky: Cloud,
  discord: MessageSquare,
  twitter: Twitter,
  linkedin: Linkedin,
  instagram: Instagram,
  facebook: Facebook,
  threads: AtSign,
  tiktok: Music2,
  youtube: Youtube,
};

const TOOLS: Array<{ label: string; desc: string; path: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }> = [
  { label: "SOCIAL COMPOSER", desc: "Draft, schedule & publish posts", path: "/marketing/social", icon: Megaphone },
  { label: "AD GENERATOR", desc: "AI ad creative for every channel", path: "/marketing/ads", icon: Zap },
  { label: "CAMPAIGNS", desc: "Email & SMS blasts to your leads", path: "/marketing/campaigns", icon: MessageSquare },
  { label: "LEADS / CRM", desc: "Your contact pipeline", path: "/marketing/leads", icon: Link2 },
  { label: "SEO INTEL", desc: "Rank & keyword tooling", path: "/marketing/seo", icon: ArrowRight },
  { label: "BILLBOARDS", desc: "In-world out-of-home ads", path: "/profile/admin/billboards", icon: ExternalLink },
];

const panel: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(56,189,248,0.18)",
  borderRadius: 12,
};

export default function MarketingCommandCenter() {
  const [, navigate] = useLocation();
  const { isPro, isOwner, loading: planLoading } = usePlan();
  const hasPrime = isOwner || isPro;

  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Connection | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/social/connections");
      if (res.ok) {
        const data = await res.json();
        setConnections(data.connections ?? []);
      }
    } catch {
      /* leave empty */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasPrime) load();
  }, [hasPrime, load]);

  const openConnect = (c: Connection) => {
    setActive(c);
    setForm({});
    setFormError(null);
  };

  const submitConnect = async () => {
    if (!active) return;
    setBusy(true);
    setFormError(null);
    try {
      const res = await apiFetch(`/api/social/connections/${active.provider}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credentials: form }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error || "Connection failed.");
        return;
      }
      setActive(null);
      await load();
    } catch {
      setFormError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (provider: string) => {
    setBusy(true);
    try {
      await apiFetch(`/api/social/connections/${provider}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  };

  // ── PRIME gate ───────────────────────────────────────────────────────────
  if (planLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#07090d" }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: CRT }} />
      </div>
    );
  }

  if (!hasPrime) {
    return (
      <div style={{ minHeight: "100vh", background: "#07090d", color: "#e4e4e7", fontFamily: FONT, display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ ...panel, maxWidth: 460, padding: 32, textAlign: "center", borderColor: "rgba(245,158,11,0.35)" }}>
          <div style={{ width: 56, height: 56, margin: "0 auto 16px", borderRadius: 14, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", display: "grid", placeItems: "center" }}>
            <Lock className="w-7 h-7" style={{ color: "#f59e0b" }} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fbbf24", marginBottom: 8, letterSpacing: 1 }}>MARKETING COMMAND CENTER</h1>
          <p style={{ fontSize: 13, color: "rgba(228,228,231,0.7)", marginBottom: 20, lineHeight: 1.6 }}>
            Connect live social accounts and post for real across 9 platforms. This is a PABLO PRIME module.
          </p>
          <button
            onClick={() => navigate("/upgrade")}
            style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", cursor: "pointer", background: "linear-gradient(90deg,#f59e0b,#fbbf24)", color: "#1a1205", fontWeight: 700, fontFamily: FONT, letterSpacing: 1 }}
          >
            UNLOCK WITH PABLO PRIME
          </button>
        </div>
      </div>
    );
  }

  const connected = connections.filter((c) => c.status === "connected").length;

  return (
    <div style={{ minHeight: "100vh", background: "#07090d", color: "#e4e4e7", fontFamily: FONT, padding: "24px 16px 80px" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.25)", display: "grid", placeItems: "center" }}>
            <Megaphone className="w-6 h-6" style={{ color: CRT }} />
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: 1.5, color: CRT }}>MARKETING COMMAND CENTER</h1>
            <p style={{ fontSize: 12, color: "rgba(228,228,231,0.55)" }}>
              {connected} of {connections.length} channels connected
            </p>
          </div>
        </div>

        {/* Connections */}
        <h2 style={{ fontSize: 13, letterSpacing: 2, color: "rgba(56,189,248,0.7)", margin: "26px 0 12px" }}>CHANNELS</h2>
        {loading ? (
          <div style={{ display: "grid", placeItems: "center", padding: 40 }}>
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: CRT }} />
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
            {connections.map((c) => {
              const Icon = PROVIDER_ICON[c.provider] ?? Megaphone;
              const isConnected = c.status === "connected";
              const needsAppConfig = c.status === "needs_app_config";
              return (
                <div key={c.provider} style={{ ...panel, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", display: "grid", placeItems: "center" }}>
                      <Icon className="w-5 h-5" style={{ color: isConnected ? "#34d399" : CRT }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{c.label}</div>
                      <div style={{ fontSize: 11, color: "rgba(228,228,231,0.5)" }}>
                        {isConnected ? c.accountHandle || "Connected" : c.authType === "oauth" ? "OAuth" : c.authType === "webhook" ? "Webhook" : "App password"}
                      </div>
                    </div>
                    {isConnected ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "#34d399", border: "1px solid rgba(52,211,153,0.3)", padding: "2px 6px", borderRadius: 6 }}>
                        <Check className="w-3 h-3" /> LIVE
                      </span>
                    ) : needsAppConfig ? (
                      <span style={{ fontSize: 10, color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)", padding: "2px 6px", borderRadius: 6 }}>SETUP</span>
                    ) : null}
                  </div>

                  {c.lastError && (
                    <div style={{ fontSize: 10, color: "#f87171", display: "flex", alignItems: "center", gap: 4 }}>
                      <AlertTriangle className="w-3 h-3" /> {c.lastError}
                    </div>
                  )}

                  {isConnected ? (
                    <button
                      onClick={() => disconnect(c.provider)}
                      disabled={busy}
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px", borderRadius: 8, border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.06)", color: "#f87171", cursor: "pointer", fontFamily: FONT, fontSize: 12 }}
                    >
                      <Unlink className="w-3.5 h-3.5" /> Disconnect
                    </button>
                  ) : needsAppConfig ? (
                    <div style={{ fontSize: 11, color: "rgba(228,228,231,0.5)", lineHeight: 1.5 }}>{c.connectHint}</div>
                  ) : (
                    <button
                      onClick={() => openConnect(c)}
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px", borderRadius: 8, border: "1px solid rgba(56,189,248,0.3)", background: "rgba(56,189,248,0.08)", color: CRT, cursor: "pointer", fontFamily: FONT, fontSize: 12 }}
                    >
                      <Link2 className="w-3.5 h-3.5" /> Connect
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Tools */}
        <h2 style={{ fontSize: 13, letterSpacing: 2, color: "rgba(56,189,248,0.7)", margin: "32px 0 12px" }}>TOOLS</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
          {TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.path}
                onClick={() => navigate(t.path)}
                style={{ ...panel, padding: 16, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, fontFamily: FONT, color: "#e4e4e7" }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.2)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <Icon className="w-5 h-5" style={{ color: CRT }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5 }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: "rgba(228,228,231,0.5)" }}>{t.desc}</div>
                </div>
                <ArrowRight className="w-4 h-4" style={{ color: "rgba(56,189,248,0.5)" }} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Connect modal */}
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !busy && setActive(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "grid", placeItems: "center", zIndex: 60, padding: 16 }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              style={{ ...panel, width: "100%", maxWidth: 420, padding: 24, background: "#0b0f14" }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: CRT }}>Connect {active.label}</h3>
                <button onClick={() => !busy && setActive(null)} style={{ background: "none", border: "none", color: "rgba(228,228,231,0.5)", cursor: "pointer" }}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p style={{ fontSize: 11, color: "rgba(228,228,231,0.55)", marginBottom: 16, lineHeight: 1.5 }}>{active.connectHint}</p>

              {active.credentialFields.map((f) => (
                <div key={f.key} style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: 11, color: "rgba(228,228,231,0.6)", marginBottom: 4 }}>{f.label}</label>
                  <input
                    type={f.type}
                    value={form[f.key] ?? ""}
                    placeholder={f.placeholder}
                    autoComplete="off"
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                    style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e4e4e7", fontFamily: FONT, fontSize: 13, padding: "10px 12px", borderRadius: 8, outline: "none" }}
                  />
                </div>
              ))}

              {formError && (
                <div style={{ fontSize: 11, color: "#f87171", marginBottom: 12, display: "flex", alignItems: "center", gap: 5 }}>
                  <AlertTriangle className="w-3.5 h-3.5" /> {formError}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "rgba(228,228,231,0.4)", marginBottom: 14 }}>
                <ShieldCheck className="w-3.5 h-3.5" /> Stored securely on your account. Only used to post on your behalf.
              </div>

              <button
                onClick={submitConnect}
                disabled={busy}
                style={{ width: "100%", padding: "11px", borderRadius: 8, border: "none", cursor: busy ? "default" : "pointer", background: "linear-gradient(90deg,#0891b2,#38bdf8)", color: "#04121a", fontWeight: 700, fontFamily: FONT, letterSpacing: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                {busy ? "VERIFYING…" : "CONNECT & VERIFY"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
