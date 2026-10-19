import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { apiFetch, apiUrl } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";

export default function MeetLaunchPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [title, setTitle] = useState("TOWER OFFICE MEETING");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate(`/sign-in?returnTo=${encodeURIComponent("/meet/new")}`, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  const createAndJoin = async () => {
    if (!title.trim() || creating) return;
    setCreating(true);
    setError("");
    try {
      const response = await apiFetch(apiUrl("meetings"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || typeof body?.meeting?.roomCode !== "string") {
        setError(body?.error || "Could not create the meeting room.");
        return;
      }
      navigate(`/meet/${encodeURIComponent(body.meeting.roomCode)}`);
    } catch {
      setError("Could not reach SALARYMAN. Check your connection and try again.");
    } finally {
      setCreating(false);
    }
  };

  if (isLoading || !isAuthenticated) {
    return <main className="min-h-screen bg-[#050b09] text-emerald-100 grid place-items-center font-mono text-sm">CONNECTING TO SALARYMAN…</main>;
  }

  return (
    <main className="min-h-screen bg-[#050b09] text-emerald-100 grid place-items-center px-4 py-10 font-mono">
      <section className="w-full max-w-md border border-emerald-400/25 bg-[#07120f] p-6 sm:p-8 shadow-2xl">
        <p className="text-xs tracking-[0.2em] text-cyan-300/70">SALARYMAN · TOWER LINK</p>
        <h1 className="mt-3 text-xl font-semibold tracking-wide">START A VIDEO MEETING</h1>
        <p className="mt-2 text-sm leading-6 text-emerald-100/60">Create a room and open the live browser meeting. Share its link to invite remote guests.</p>
        <label className="mt-6 block text-xs tracking-widest text-emerald-100/50" htmlFor="meeting-title">MEETING TITLE</label>
        <input
          id="meeting-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          className="mt-2 w-full border border-emerald-400/20 bg-black/40 px-3 py-3 text-sm text-emerald-50 outline-none focus:border-cyan-300/60"
          onKeyDown={(event) => { if (event.key === "Enter") void createAndJoin(); }}
        />
        {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
        <button
          type="button"
          onClick={() => void createAndJoin()}
          disabled={creating || !title.trim()}
          className="mt-5 w-full border border-cyan-300/50 bg-cyan-300/10 px-4 py-3 text-sm font-semibold tracking-widest text-cyan-100 hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {creating ? "OPENING ROOM…" : "CREATE & JOIN"}
        </button>
      </section>
    </main>
  );
}
