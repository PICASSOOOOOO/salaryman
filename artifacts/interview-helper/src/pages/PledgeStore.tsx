import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@workspace/replit-auth-web";
import { apiFetch, apiUrl } from "@/lib/api-client";
import { PabloNebula3D } from "@/components/PabloNebula3D";
import {
  ChevronLeft, Loader2, Check, Sparkles, Bot, Crown, ExternalLink,
  ShoppingBag, Radio,
} from "lucide-react";

const PRIME_PAYMENT_LINK = "https://buy.stripe.com/7sYaEZfg3c3h2Kd8CteZ200";

interface PledgeItem {
  id: string;
  category: string;
  name: string;
  blurb: string;
  effect: string;
  priceUsd: number;
  icon: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  property: "Property",
  bots: "Pixel Agents",
  weapons: "Gear",
  furniture: "Furniture",
  technology: "Technology",
  office_supplies: "Supplies",
  decor: "Decor",
  skins: "Skins",
  terminals: "Terminals",
};

export default function PledgeStore() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [items, setItems] = useState<PledgeItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [activeCat, setActiveCat] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const reqs: Promise<Response>[] = [apiFetch("/api/pledge/catalog")];
      if (isAuthenticated) reqs.push(apiFetch("/api/pledge/owned"));
      const [catRes, ownedRes] = await Promise.all(reqs);
      const cat = await catRes.json();
      setItems(cat.items ?? []);
      setCategories(cat.categories ?? []);
      if (ownedRes && ownedRes.ok) {
        const o = await ownedRes.json();
        setOwned(new Set<string>(o.itemIds ?? []));
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("purchase") === "success") {
      setNotice("Pledge secured. Your advantage is being unlocked.");
      load();
    } else if (params.get("purchase") === "cancel") {
      setNotice("Checkout canceled — no charge made.");
    }
  }, [load]);

  const buy = async (item: PledgeItem) => {
    if (!isAuthenticated) {
      window.location.href = apiUrl("/auth/login");
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
        setNotice(`${item.name} granted — owner privileges.`);
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

  const visible = activeCat === "all" ? items : items.filter((i) => i.category === activeCat);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#03060c] text-zinc-100">
      {/* Pablo nebula energy */}
      <div aria-hidden className="fixed inset-0 z-0 opacity-50 pointer-events-none">
        <PabloNebula3D status="idle" size={typeof window !== "undefined" ? Math.max(window.innerWidth, window.innerHeight) : 1200} />
      </div>
      <div aria-hidden className="fixed inset-0 z-[1] pointer-events-none" style={{ background: "radial-gradient(ellipse at center, rgba(3,6,12,.35) 0%, rgba(3,6,12,.82) 80%)" }} />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => navigate("/world")} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
            <ChevronLeft className="w-4 h-4" /> World
          </button>
          <button onClick={() => navigate("/pablo/deck")} className="flex items-center gap-1.5 text-xs text-emerald-300/80 hover:text-emerald-200 transition-colors">
            <Radio className="w-3.5 h-3.5" /> Command Deck
          </button>
        </div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 text-[10px] font-mono uppercase tracking-widest mb-3">
            <ShoppingBag className="w-3 h-3" /> Pledge Store
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">Equip your empire.</h1>
          <p className="text-zinc-400 text-sm max-w-xl mx-auto leading-relaxed">
            Pledge real backing and get a real edge — property, pixel agents, gear, tech, and decor that give you the advantage in SALARYMAN. Every tool you need to build the ultimate app or business, deployed from your Command Deck.
          </p>
        </div>

        {notice && (
          <div className="mb-6 px-4 py-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-200 text-sm text-center">
            {notice}
          </div>
        )}

        {/* Premium row — PABLO PRIME + Pixel Agents */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          <div className="relative rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] p-5 overflow-hidden">
            <div className="flex items-center gap-2 mb-2">
              <Crown className="w-4 h-4 text-emerald-400" />
              <span className="font-bold tracking-wide">PABLO PRIME</span>
              <span className="ml-auto text-emerald-300 font-mono text-sm">$145<span className="text-emerald-300/50">/mo</span></span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              The whole platform in one subscription — Jean Claw and 77 specialist bots, Live Listen, Screen Scan, Say This, and the full Phone System with AI secretary.
            </p>
            <button
              onClick={() => {
                const url = user?.id ? `${PRIME_PAYMENT_LINK}?client_reference_id=${encodeURIComponent(user.id)}` : PRIME_PAYMENT_LINK;
                window.location.href = url;
              }}
              className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm transition-colors"
            >
              Go Prime
            </button>
          </div>

          <div className="relative rounded-2xl border border-violet-500/30 bg-violet-500/[0.07] p-5 overflow-hidden">
            <div className="flex items-center gap-2 mb-2">
              <Bot className="w-4 h-4 text-violet-400" />
              <span className="font-bold tracking-wide">PIXEL AGENTS</span>
              <span className="ml-auto text-violet-300 font-mono text-xs">Jean Claw</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Jean Claw's 78-bot workforce that actively builds your ventures. Deploy them from the Command Deck to ship apps and run businesses while you sleep.
            </p>
            <button
              onClick={() => navigate("/bots")}
              className="w-full py-2.5 rounded-lg border border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/20 text-violet-200 font-semibold text-sm transition-colors flex items-center justify-center gap-1.5"
            >
              Meet the Agents <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setActiveCat("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-mono uppercase tracking-wide border transition-colors ${activeCat === "all" ? "border-amber-400/60 bg-amber-500/15 text-amber-200" : "border-white/10 text-zinc-400 hover:text-zinc-200"}`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCat(c)}
              className={`px-3 py-1.5 rounded-full text-xs font-mono uppercase tracking-wide border transition-colors ${activeCat === c ? "border-amber-400/60 bg-amber-500/15 text-amber-200" : "border-white/10 text-zinc-400 hover:text-zinc-200"}`}
            >
              {CATEGORY_LABEL[c] ?? c}
            </button>
          ))}
        </div>

        {/* Catalog grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-zinc-500">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map((item) => {
              const isOwned = owned.has(item.id);
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="text-2xl leading-none">{item.icon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm truncate">{item.name}</h3>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{CATEGORY_LABEL[item.category] ?? item.category}</span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed mb-1">{item.blurb}</p>
                  <p className="text-[11px] text-emerald-300/70 leading-relaxed mb-4 flex items-start gap-1">
                    <Sparkles className="w-3 h-3 mt-0.5 shrink-0" /> {item.effect}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-3">
                    <span className="font-mono text-sm text-zinc-200">${item.priceUsd}</span>
                    {isOwned ? (
                      <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold"><Check className="w-3.5 h-3.5" /> Owned</span>
                    ) : (
                      <button
                        onClick={() => buy(item)}
                        disabled={buying === item.id}
                        className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black font-semibold text-xs transition-colors flex items-center gap-1.5"
                      >
                        {buying === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Pledge"}
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Backer form */}
        <BackerForm />

        <p className="text-center text-[10px] text-zinc-600 mt-8 font-mono">
          Pledges are real-money purchases processed by PICASSO AI LLC. Advantages apply within SALARYMAN.
        </p>
      </div>
    </div>
  );
}

function BackerForm() {
  const [form, setForm] = useState({ name: "", email: "", company: "", investmentRange: "", message: "" });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    try {
      const res = await fetch(apiUrl("investors"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Something went wrong.");
        setStatus("error");
      } else {
        setStatus("success");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
    }
  };

  return (
    <div className="mt-12 rounded-2xl border border-sky-500/20 bg-sky-500/[0.05] p-6">
      <div className="flex items-center gap-2 mb-1">
        <Crown className="w-4 h-4 text-sky-400" />
        <h2 className="font-bold tracking-wide">Become a Backer</h2>
      </div>
      <p className="text-xs text-zinc-400 mb-5 leading-relaxed">
        Want to back SALARYMAN at a bigger level — or invest in Picasso? Drop your details and we'll be in touch personally.
      </p>

      {status === "success" ? (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-300 text-sm">
          <Check className="w-5 h-5 shrink-0 mt-0.5" />
          <span>Inquiry received{form.name ? `, ${form.name}` : ""}. We read every one personally.</span>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required placeholder="Your name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm focus:border-sky-500/50 outline-none" />
            <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm focus:border-sky-500/50 outline-none" />
            <input placeholder="Company (optional)" value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} className="px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm focus:border-sky-500/50 outline-none" />
            <select value={form.investmentRange} onChange={(e) => setForm((f) => ({ ...f, investmentRange: e.target.value }))} className="px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm focus:border-sky-500/50 outline-none text-zinc-300">
              <option value="">Backing range...</option>
              <option value="under_25k">Under $25K</option>
              <option value="25k_100k">$25K – $100K</option>
              <option value="100k_500k">$100K – $500K</option>
              <option value="500k_1m">$500K – $1M</option>
              <option value="1m_plus">$1M+</option>
            </select>
          </div>
          <textarea placeholder="Anything you want us to know" value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} rows={3} className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm focus:border-sky-500/50 outline-none resize-none" />
          {status === "error" && <p className="text-xs text-red-400">{errorMsg}</p>}
          <button type="submit" disabled={status === "loading"} className="px-5 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-black font-semibold text-sm transition-colors flex items-center gap-2">
            {status === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send inquiry"}
          </button>
        </form>
      )}
    </div>
  );
}
