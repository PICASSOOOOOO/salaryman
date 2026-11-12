import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  TowerShopStaffAssignment,
  TowerShopStaffAssignmentInput,
  TowerShopStaffRoster,
} from "@workspace/api-zod";
import { apiFetch } from "@/lib/api-client";

async function readError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : "The request could not be completed.";
}

export function TowerShopStaffPanel() {
  const [roster, setRoster] = useState<TowerShopStaffRoster | null>(null);
  const [businessKey, setBusinessKey] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const shopByKey = useMemo(
    () => new Map((roster?.shops ?? []).map((shop) => [shop.businessKey, shop] as const)),
    [roster],
  );

  const loadRoster = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch("/api/admin/tower-shop-staff");
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json() as TowerShopStaffRoster;
      setRoster(data);
      setBusinessKey((current) =>
        data.shops.some((shop) => shop.businessKey === current)
          ? current
          : data.shops[0]?.businessKey ?? "",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load shop staff.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  const assignStaff = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!businessKey || !email.trim()) return;
    setBusyAction("assign");
    setError(null);
    setNotice(null);
    try {
      const body: TowerShopStaffAssignmentInput = { businessKey, email: email.trim() };
      const response = await apiFetch("/api/admin/tower-shop-staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await readError(response));
      setEmail("");
      setNotice("Shop access assigned.");
      await loadRoster();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not assign shop staff.");
    } finally {
      setBusyAction(null);
    }
  };

  const revokeStaff = async (assignment: TowerShopStaffAssignment) => {
    const actionKey = `${assignment.businessKey}:${assignment.userId}`;
    setBusyAction(actionKey);
    setError(null);
    setNotice(null);
    try {
      const response = await apiFetch(
        `/api/admin/tower-shop-staff/${encodeURIComponent(assignment.businessKey)}/${encodeURIComponent(assignment.userId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(await readError(response));
      setNotice("Shop access removed.");
      await loadRoster();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove shop staff.");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="space-y-5 text-black">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold tracking-wide">TOWER SHOP STAFF</h2>
          <p className="mt-1 text-xs text-black/60">
            Assign shelf-restocking access one shop at a time.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadRoster()}
          disabled={loading}
          className="rounded border border-black/20 px-3 py-1.5 text-xs hover:bg-black/5 disabled:opacity-50"
        >
          {loading ? "LOADING…" : "REFRESH"}
        </button>
      </header>

      <form onSubmit={assignStaff} className="grid gap-3 rounded-lg border border-black/15 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <label className="grid gap-1.5 text-xs font-medium">
          Shop
          <select
            value={businessKey}
            onChange={(event) => setBusinessKey(event.target.value)}
            disabled={loading || !roster?.shops.length}
            className="h-10 min-w-0 rounded border border-black/20 bg-white px-2 text-sm"
          >
            {(roster?.shops ?? []).map((shop) => (
              <option key={shop.businessKey} value={shop.businessKey}>
                {shop.name} · {shop.locationLabel}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-medium">
          SALARYMAN account email
          <input
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="staff@example.com"
            className="h-10 min-w-0 rounded border border-black/20 bg-white px-3 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={loading || busyAction !== null || !businessKey || !email.trim()}
          className="h-10 rounded bg-black px-4 text-xs font-semibold text-white hover:bg-black/80 disabled:opacity-40"
        >
          {busyAction === "assign" ? "ASSIGNING…" : "ASSIGN ACCESS"}
        </button>
      </form>

      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}

      <div className="overflow-hidden rounded-lg border border-black/15 bg-white">
        <div className="border-b border-black/10 px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide">Current assignments</h3>
        </div>
        {loading && !roster ? (
          <p className="px-4 py-5 text-sm text-black/60">Loading assignments…</p>
        ) : roster?.assignments.length ? (
          <ul className="divide-y divide-black/10">
            {roster.assignments.map((assignment) => {
              const shop = shopByKey.get(assignment.businessKey);
              const actionKey = `${assignment.businessKey}:${assignment.userId}`;
              const fullName = [assignment.firstName, assignment.lastName].filter(Boolean).join(" ");
              return (
                <li key={actionKey} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{fullName || assignment.email || assignment.userId}</p>
                    {fullName && assignment.email && (
                      <p className="truncate text-xs text-black/60">{assignment.email}</p>
                    )}
                    <p className="mt-1 text-xs text-black/60">
                      {shop?.name ?? assignment.businessKey}
                      {shop?.locationLabel ? ` · ${shop.locationLabel}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void revokeStaff(assignment)}
                    disabled={busyAction !== null}
                    className="shrink-0 rounded border border-black/20 px-3 py-1.5 text-xs hover:bg-black/5 disabled:opacity-50"
                  >
                    {busyAction === actionKey ? "REMOVING…" : "REMOVE"}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 py-5 text-sm text-black/60">
            {loading ? "Loading assignments…" : "No shop staff assignments yet."}
          </p>
        )}
      </div>
    </section>
  );
}
