import { useEffect, useState } from "react";
import { AlertCircle, Check, Loader2, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

interface WageTarget {
  businessId: number;
  playerName: string;
  companyName: string;
}

const today = () => new Date().toISOString().slice(0, 10);

export function PaidWageAttestationPanel() {
  const [targets, setTargets] = useState<WageTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WageTarget | null>(null);
  const [paidAmount, setPaidAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [paidAt, setPaidAt] = useState(today);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [ownerConfirmed, setOwnerConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const response = await apiFetch("/api/world/paid-wage-attestation-targets");
      if (!response.ok) throw new Error("Unable to load eligible employees.");
      const data = await response.json();
      setTargets(Array.isArray(data.employees) ? data.employees : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load eligible employees.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await apiFetch("/api/world/attest-paid-wage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: selected.businessId,
          paidAmount,
          currencyCode,
          paidAt,
          payPeriodStart: periodStart,
          payPeriodEnd: periodEnd,
          paymentReference,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to record wage confirmation.");
      setSuccess(`Confirmed paid wages for ${selected.playerName}.`);
      setSelected(null);
      setPaidAmount("");
      setPeriodStart("");
      setPeriodEnd("");
      setPaymentReference("");
      setOwnerConfirmed(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to record wage confirmation.");
    } finally {
      setSaving(false);
    }
  };

  if (!loading && targets.length === 0 && !error && !success) return null;

  return (
    <section className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.035] p-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">Confirm wages paid</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Only confirm a payment you personally verified. Confirmations are permanent and duplicate pay periods are rejected.
          </p>
          {loading ? (
            <Loader2 className="mt-3 h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {targets.map((target) => (
                <button
                  key={target.businessId}
                  type="button"
                  onClick={() => { setError(""); setOwnerConfirmed(false); setSelected(target); setPaidAt(today()); }}
                  className="rounded-lg border border-emerald-500/25 px-3 py-2 text-left text-xs text-foreground hover:bg-emerald-500/10"
                >
                  {target.playerName} <span className="text-muted-foreground">· {target.companyName}</span>
                </button>
              ))}
              {targets.length === 0 && <p className="text-xs text-muted-foreground">No eligible organization members to verify.</p>}
            </div>
          )}
          {(error || success) && (
            <p role="status" className={`mt-3 flex items-center gap-1.5 text-xs ${error ? "text-red-400" : "text-emerald-400"}`}>
              {error ? <AlertCircle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
              {error || success}
            </p>
          )}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
          <form onSubmit={submit} className="my-auto w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <h3 className="font-semibold text-foreground">Attest payment to {selected.playerName}</h3>
            <p className="mt-1 text-xs text-muted-foreground">This confirms one real-world wage payment for progression records; it does not issue FIAT.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="text-xs text-muted-foreground">Amount paid
                <input required min="0.01" max="100000000" step="0.01" type="number" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground" />
              </label>
              <label className="text-xs text-muted-foreground">Currency
                <input required maxLength={3} pattern="[A-Za-z]{3}" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 uppercase text-foreground" />
              </label>
              <label className="text-xs text-muted-foreground">Paid date
                <input required type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground" />
              </label>
              <label className="text-xs text-muted-foreground">Pay period start
                <input required type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground" />
              </label>
              <label className="text-xs text-muted-foreground">Pay period end
                <input required type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground" />
              </label>
              <label className="col-span-2 text-xs text-muted-foreground">Payment reference
                <input required minLength={4} maxLength={120} value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground" />
                <span className="mt-1 block text-[10px]">Use a payroll/check reference. It is hashed before storage.</span>
              </label>
              <label className="col-span-2 flex items-start gap-2 text-xs text-foreground">
                <input required type="checkbox" checked={ownerConfirmed} onChange={(e) => setOwnerConfirmed(e.target.checked)} className="mt-0.5 accent-emerald-500" />
                <span>I confirm I verified this payment was actually made and that these details are accurate.</span>
              </label>
            </div>
            {error && <p role="alert" className="mt-3 text-xs text-red-400">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setSelected(null)} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted">Cancel</button>
              <button disabled={saving} className="flex items-center gap-2 rounded-lg bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-400 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Confirm paid
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
