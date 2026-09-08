import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { SignInPage } from "@/components/SignInPrompt";
import { useBoomerMode } from "@/hooks/use-mobile";
import { Loader2, Plus, User, Trash2, Pencil, Check, X, Star } from "lucide-react";

interface PlayerProfile {
  id: string;
  userId: string;
  playerName: string;
  avatarColor: string;
  createdAt: string;
  lastUsedAt: string;
}

const PRESET_COLORS = [
  "#a78bfa", "#f0abfc", "#67e8f9", "#fbbf24", "#84cc16",
  "#f472b6", "#38bdf8", "#fb923c", "#10b981", "#ef4444",
];

function initial(name: string): string {
  const t = (name || "?").trim();
  return t.length > 0 ? t[0].toUpperCase() : "?";
}

export default function ProfilePicker() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [boomerMode] = useBoomerMode();
  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [economicUserId, setEconomicUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Create-form state
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(PRESET_COLORS[0]);

  const refresh = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await apiFetch("/api/profiles");
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Load failed (${r.status})`);
      setProfiles(j.profiles || []);
      setActiveId(j.activeProfileId || null);
      setEconomicUserId(j.economicUserId || null);
    } catch (e: any) {
      setErr(e?.message || "Could not load profiles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isAuthenticated) refresh(); }, [isAuthenticated, refresh]);

  const switchTo = async (id: string) => {
    setBusy(id); setErr(null);
    try {
      const r = await apiFetch(`/api/profiles/${id}/switch`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Switch failed (${r.status})`);
      setActiveId(id);
      // Hard reload routes that key off active profile so cached game data
      // refreshes against the new playerName.
      window.location.assign("/");
    } catch (e: any) {
      setErr(e?.message || "Could not switch profile");
      setBusy(null);
    }
  };

  const create = async () => {
    if (!newName.trim()) { setErr("Pick a name first."); return; }
    setBusy("__new"); setErr(null);
    try {
      const r = await apiFetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName: newName.trim(), avatarColor: newColor, makeActive: true }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Create failed (${r.status})`);
      setCreating(false); setNewName(""); setNewColor(PRESET_COLORS[0]);
      window.location.assign("/");
    } catch (e: any) {
      setErr(e?.message || "Could not create profile");
      setBusy(null);
    }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this profile? Their saved business data is preserved and can be revived by re-creating a profile with the same name.")) return;
    setBusy(id); setErr(null);
    try {
      const r = await apiFetch(`/api/profiles/${id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Delete failed (${r.status})`);
      await refresh();
    } catch (e: any) {
      setErr(e?.message || "Could not delete profile");
    } finally {
      setBusy(null);
    }
  };

  const startEdit = (p: PlayerProfile) => {
    setEditingId(p.id);
    setEditName(p.playerName);
    setEditColor(p.avatarColor);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setBusy(editingId); setErr(null);
    try {
      const r = await apiFetch(`/api/profiles/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName: editName.trim(), avatarColor: editColor }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Save failed (${r.status})`);
      setEditingId(null);
      await refresh();
    } catch (e: any) {
      setErr(e?.message || "Could not save");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }
  if (!isAuthenticated) return <SignInPage />;

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="profile-picker-page">
      <div className="max-w-5xl mx-auto px-4 py-12 sm:py-20">
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-5xl font-display tracking-wider text-foreground mb-2" data-testid="picker-title">
            {boomerMode ? "WHO'S PLAYING?" : "SELECT PROFILE"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {boomerMode
              ? "Pick a character to play as. You can keep more than one on this account."
              : "Each account holds up to 12 in-game characters. Use them for testing or alt runs."}
          </p>
          {economicUserId && (
            <p className="mt-3 text-[10px] font-mono text-muted-foreground break-all">
              ECONOMIC USER ID · {economicUserId} · SHARED BY EVERY PROFILE ON THIS ACCOUNT
            </p>
          )}
        </div>

        {err && (
          <div className="max-w-md mx-auto mb-6 p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-sm text-destructive" data-testid="picker-error">
            {err}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6">
            {profiles.map(p => {
              const isActive = p.id === activeId;
              const isEditing = editingId === p.id;
              const thisBusy = busy === p.id;
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`relative group rounded-2xl border p-4 flex flex-col items-center gap-3 transition-colors ${isActive ? "border-amber-500/60 bg-amber-500/5" : "border-border bg-card hover:border-primary/40"}`}
                  data-testid={`profile-tile-${p.playerName}`}
                >
                  {isActive && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold">
                      <Star className="w-2.5 h-2.5 fill-current" /> ACTIVE
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => !isEditing && !thisBusy && !isActive && switchTo(p.id)}
                    disabled={thisBusy || isEditing}
                    className="relative w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-bold text-white shadow-lg disabled:opacity-60 hover-elevate active-elevate-2"
                    style={{ backgroundColor: isEditing ? editColor : p.avatarColor }}
                    aria-label={`Switch to ${p.playerName}`}
                    data-testid={`profile-avatar-${p.playerName}`}
                  >
                    {thisBusy ? <Loader2 className="w-6 h-6 animate-spin" /> : initial(isEditing ? editName : p.playerName)}
                  </button>

                  {isEditing ? (
                    <div className="w-full flex flex-col gap-2">
                      <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value.toUpperCase().slice(0, 32))}
                        className="w-full px-2 py-1 text-sm font-mono tracking-wider bg-background border border-border rounded text-center"
                        maxLength={32}
                      />
                      <div className="flex gap-1 flex-wrap justify-center">
                        {PRESET_COLORS.map(c => (
                          <button
                            key={c}
                            type="button"
                            className={`w-5 h-5 rounded-full ${editColor === c ? "ring-2 ring-foreground ring-offset-1 ring-offset-card" : ""}`}
                            style={{ backgroundColor: c }}
                            onClick={() => setEditColor(c)}
                          />
                        ))}
                      </div>
                      <div className="flex gap-1 justify-center">
                        <button onClick={saveEdit} disabled={thisBusy} className="px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover-elevate disabled:opacity-50">
                          {thisBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        </button>
                        <button onClick={() => setEditingId(null)} className="px-2 py-1 text-xs rounded bg-secondary text-secondary-foreground hover-elevate">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-center">
                        <div className="font-mono text-sm font-bold tracking-wider text-foreground truncate max-w-[140px]" title={p.playerName}>
                          {p.playerName}
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); startEdit(p); }}
                          className="p-1.5 rounded bg-secondary/60 hover-elevate text-muted-foreground"
                          title="Rename"
                          data-testid={`profile-edit-${p.playerName}`}
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        {!isActive && profiles.length > 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); del(p.id); }}
                            className="p-1.5 rounded bg-destructive/15 hover-elevate text-destructive"
                            title="Delete"
                            data-testid={`profile-delete-${p.playerName}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </motion.div>
              );
            })}

            {/* Create-new tile */}
            {creating ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-primary/40 bg-card p-4 flex flex-col items-center gap-3"
                data-testid="profile-tile-new"
              >
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-bold text-white shadow-lg"
                  style={{ backgroundColor: newColor }}
                >
                  {initial(newName) || "?"}
                </div>
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value.toUpperCase().slice(0, 32))}
                  placeholder="NAME"
                  className="w-full px-2 py-1 text-sm font-mono tracking-wider bg-background border border-border rounded text-center"
                  maxLength={32}
                  data-testid="input-new-profile-name"
                />
                <div className="flex gap-1 flex-wrap justify-center">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      className={`w-5 h-5 rounded-full ${newColor === c ? "ring-2 ring-foreground ring-offset-1 ring-offset-card" : ""}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setNewColor(c)}
                    />
                  ))}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={create}
                    disabled={busy === "__new" || !newName.trim()}
                    className="px-3 py-1 text-xs rounded bg-primary text-primary-foreground hover-elevate disabled:opacity-50"
                    data-testid="btn-confirm-new-profile"
                  >
                    {busy === "__new" ? <Loader2 className="w-3 h-3 animate-spin" /> : "CREATE"}
                  </button>
                  <button
                    onClick={() => { setCreating(false); setNewName(""); }}
                    className="px-3 py-1 text-xs rounded bg-secondary text-secondary-foreground hover-elevate"
                  >
                    CANCEL
                  </button>
                </div>
              </motion.div>
            ) : profiles.length < 12 ? (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setCreating(true)}
                className="rounded-2xl border-2 border-dashed border-border hover:border-primary/60 bg-card/40 p-4 flex flex-col items-center justify-center gap-3 min-h-[200px] hover-elevate active-elevate-2"
                data-testid="btn-add-profile"
              >
                <div className="w-20 h-20 rounded-2xl bg-secondary/40 flex items-center justify-center text-muted-foreground">
                  <Plus className="w-8 h-8" />
                </div>
                <div className="font-mono text-xs tracking-wider text-muted-foreground">
                  {boomerMode ? "ADD A CHARACTER" : "+ NEW PROFILE"}
                </div>
              </motion.button>
            ) : null}
          </div>
        )}

        <div className="text-center mt-10">
          <button
            onClick={() => navigate("/profile")}
            className="text-xs font-mono tracking-wider text-muted-foreground hover:text-foreground"
            data-testid="btn-back-to-profile"
          >
            ← {boomerMode ? "BACK TO MY ACCOUNT" : "BACK TO ACCOUNT SETTINGS"}
          </button>
        </div>
      </div>
    </div>
  );
}
