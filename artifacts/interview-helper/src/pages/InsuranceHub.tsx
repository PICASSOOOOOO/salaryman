import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Shield,
  Plus,
  Phone,
  Users,
  FileText,
  Link2,
  Activity,
  ChevronRight,
  Search,
  X,
  TestTube,
  Trash2,
  Edit3,
  PhoneCall,
  PhoneOutgoing,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL;

interface Carrier {
  id: number;
  slug: string;
  name: string;
  shortName: string;
  logoColor: string;
  apiBaseUrl: string | null;
}

interface Connection {
  connection: {
    id: number;
    carrierId: number;
    agencyName: string | null;
    npn: string | null;
    apiToken: string | null;
    isActive: boolean;
  };
  carrier: Carrier;
}

interface Client {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  state: string | null;
  zipCode: string | null;
  source: string;
  createdAt: string;
}

interface Policy {
  policy: {
    id: number;
    clientId: number;
    carrierId: number;
    policyNumber: string | null;
    planName: string | null;
    planType: string | null;
    status: string;
    premiumMonthly: number | null;
    effectiveDate: string | null;
    notes: string | null;
  };
  carrier: Carrier;
}

interface Stats {
  totalClients: number;
  totalPolicies: number;
  activePolicies: number;
  pendingPolicies: number;
  carrierConnections: number;
  totalCalls: number;
}

type Tab = "overview" | "clients" | "policies" | "connections" | "calls";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "overview", label: "OVERVIEW", icon: <Activity size={14} /> },
  { key: "clients", label: "CLIENTS", icon: <Users size={14} /> },
  { key: "policies", label: "POLICIES", icon: <FileText size={14} /> },
  { key: "connections", label: "CARRIERS", icon: <Link2 size={14} /> },
  { key: "calls", label: "CALLS", icon: <Phone size={14} /> },
];

const STATUS_COLORS: Record<string, string> = {
  quoted: "#f59e0b",
  submitted: "#3b82f6",
  pending: "#a78bfa",
  active: "#22c55e",
  cancelled: "#ef4444",
  lapsed: "#6b7280",
  declined: "#dc2626",
  expired: "#9ca3af",
};

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await apiFetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div
      style={{
        background: "rgba(15,15,20,0.8)",
        border: `1px solid ${color}33`,
        borderRadius: 8,
        padding: "16px 20px",
        flex: "1 1 140px",
        minWidth: 140,
      }}
    >
      <div style={{ color: `${color}99`, fontSize: 10, letterSpacing: "0.15em", fontFamily: "monospace", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ color, fontSize: 28, fontWeight: 700, fontFamily: "monospace" }}>{value}</div>
    </div>
  );
}

function AddConnectionModal({
  carriers,
  onClose,
  onSave,
}: {
  carriers: Carrier[];
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const [carrierId, setCarrierId] = useState<number>(carriers[0]?.id ?? 0);
  const [agencyName, setAgencyName] = useState("");
  const [npn, setNpn] = useState("");
  const [apiToken, setApiToken] = useState("");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.7)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0f0f14",
          border: "1px solid rgba(56,189,248,0.2)",
          borderRadius: 12,
          padding: 28,
          width: "100%",
          maxWidth: 480,
        }}
      >
        <h3 style={{ color: "#38bdf8", fontFamily: "monospace", fontSize: 14, letterSpacing: "0.15em", marginBottom: 20 }}>
          ADD CARRIER CONNECTION
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ color: "#71717a", fontSize: 10, fontFamily: "monospace", letterSpacing: "0.1em" }}>CARRIER</label>
            <select
              value={carrierId}
              onChange={(e) => setCarrierId(Number(e.target.value))}
              style={{
                width: "100%",
                background: "#1a1a24",
                border: "1px solid #27272a",
                borderRadius: 6,
                color: "#e4e4e7",
                padding: "8px 12px",
                fontFamily: "monospace",
                fontSize: 13,
                marginTop: 4,
              }}
            >
              {carriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ color: "#71717a", fontSize: 10, fontFamily: "monospace", letterSpacing: "0.1em" }}>AGENCY NAME</label>
            <input
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              placeholder="E.G. PLAN B INSURANCE GROUP"
              style={{
                width: "100%",
                background: "#1a1a24",
                border: "1px solid #27272a",
                borderRadius: 6,
                color: "#e4e4e7",
                padding: "8px 12px",
                fontFamily: "monospace",
                fontSize: 13,
                marginTop: 4,
              }}
            />
          </div>
          <div>
            <label style={{ color: "#71717a", fontSize: 10, fontFamily: "monospace", letterSpacing: "0.1em" }}>NPN (NATIONAL PRODUCER NUMBER)</label>
            <input
              value={npn}
              onChange={(e) => setNpn(e.target.value)}
              placeholder="E.G. 19877329"
              style={{
                width: "100%",
                background: "#1a1a24",
                border: "1px solid #27272a",
                borderRadius: 6,
                color: "#e4e4e7",
                padding: "8px 12px",
                fontFamily: "monospace",
                fontSize: 13,
                marginTop: 4,
              }}
            />
          </div>
          <div>
            <label style={{ color: "#71717a", fontSize: 10, fontFamily: "monospace", letterSpacing: "0.1em" }}>API TOKEN (JWT / KEY)</label>
            <textarea
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="PASTE YOUR API TOKEN HERE..."
              rows={3}
              style={{
                width: "100%",
                background: "#1a1a24",
                border: "1px solid #27272a",
                borderRadius: 6,
                color: "#e4e4e7",
                padding: "8px 12px",
                fontFamily: "monospace",
                fontSize: 11,
                marginTop: 4,
                resize: "vertical",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button
              onClick={onClose}
              style={{
                flex: 1,
                padding: "10px 16px",
                background: "#27272a",
                border: "none",
                borderRadius: 6,
                color: "#a1a1aa",
                fontFamily: "monospace",
                fontSize: 12,
                cursor: "pointer",
                letterSpacing: "0.1em",
              }}
            >
              CANCEL
            </button>
            <button
              onClick={() => onSave({ carrierId, agencyName, npn, apiToken })}
              style={{
                flex: 1,
                padding: "10px 16px",
                background: "rgba(56,189,248,0.15)",
                border: "1px solid rgba(56,189,248,0.3)",
                borderRadius: 6,
                color: "#38bdf8",
                fontFamily: "monospace",
                fontSize: 12,
                cursor: "pointer",
                letterSpacing: "0.1em",
              }}
            >
              CONNECT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddClientModal({ onClose, onSave }: { onClose: () => void; onSave: (data: any) => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.7)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0f0f14",
          border: "1px solid rgba(34,197,94,0.2)",
          borderRadius: 12,
          padding: 28,
          width: "100%",
          maxWidth: 480,
        }}
      >
        <h3 style={{ color: "#22c55e", fontFamily: "monospace", fontSize: 14, letterSpacing: "0.15em", marginBottom: 20 }}>
          ADD CLIENT
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="FIRST NAME *"
              style={inputStyle}
            />
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="LAST NAME *"
              style={inputStyle}
            />
          </div>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="EMAIL" style={inputStyle} />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="PHONE" style={inputStyle} />
          <div style={{ display: "flex", gap: 10 }}>
            <input value={dob} onChange={(e) => setDob(e.target.value)} placeholder="DOB (MM/DD/YYYY)" style={inputStyle} />
            <input value={state} onChange={(e) => setState(e.target.value)} placeholder="STATE" style={{ ...inputStyle, maxWidth: 80 }} />
            <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="ZIP" style={{ ...inputStyle, maxWidth: 100 }} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button onClick={onClose} style={cancelBtnStyle}>CANCEL</button>
            <button
              onClick={() => {
                if (!firstName || !lastName) return;
                onSave({ firstName, lastName, email, phone, dateOfBirth: dob, state, zipCode: zip });
              }}
              style={{
                ...saveBtnStyle,
                background: "rgba(34,197,94,0.15)",
                border: "1px solid rgba(34,197,94,0.3)",
                color: "#22c55e",
              }}
            >
              ADD CLIENT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: "#1a1a24",
  border: "1px solid #27272a",
  borderRadius: 6,
  color: "#e4e4e7",
  padding: "8px 12px",
  fontFamily: "monospace",
  fontSize: 13,
};

const cancelBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: "10px 16px",
  background: "#27272a",
  border: "none",
  borderRadius: 6,
  color: "#a1a1aa",
  fontFamily: "monospace",
  fontSize: 12,
  cursor: "pointer",
  letterSpacing: "0.1em",
};

const saveBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: "10px 16px",
  borderRadius: 6,
  fontFamily: "monospace",
  fontSize: 12,
  cursor: "pointer",
  letterSpacing: "0.1em",
};

export default function InsuranceHub() {
  const [location, navigate] = useLocation();
  const urlTab = new URLSearchParams(window.location.search).get("tab") as Tab | null;
  const [tab, setTabState] = useState<Tab>(urlTab && ["overview", "clients", "policies", "connections", "calls"].includes(urlTab) ? urlTab : "overview");

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    const newUrl = t === "overview" ? "/insurance" : `/insurance?tab=${t}`;
    window.history.replaceState(null, "", `${BASE.replace(/\/$/, "")}${newUrl}`);
  }, []);
  const [stats, setStats] = useState<Stats | null>(null);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [callLogs, setCallLogs] = useState<any[]>([]);
  const [showAddConnection, setShowAddConnection] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [testResults, setTestResults] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    api<Carrier[]>("/insurance/carriers").then(setCarriers).catch(() => {});
    try {
      const [s, co, cl, po, logs] = await Promise.all([
        api<Stats>("/insurance/stats"),
        api<Connection[]>("/insurance/connections"),
        api<Client[]>("/insurance/clients"),
        api<Policy[]>("/insurance/policies"),
        api<any[]>("/insurance/call-logs"),
      ]);
      setStats(s);
      setConnections(co);
      setClients(cl);
      setPolicies(po);
      setCallLogs(logs);
    } catch {}
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAddConnection = async (data: any) => {
    await api("/insurance/connections", { method: "POST", body: JSON.stringify(data) });
    setShowAddConnection(false);
    load();
  };

  const handleDeleteConnection = async (id: number) => {
    await api(`/insurance/connections/${id}`, { method: "DELETE" });
    load();
  };

  const handleTestConnection = async (id: number) => {
    setTestResults((p) => ({ ...p, [id]: "TESTING..." }));
    try {
      const r = await api<{ status: string; message: string }>("/insurance/carrier/test", {
        method: "POST",
        body: JSON.stringify({ connectionId: id }),
      });
      setTestResults((p) => ({ ...p, [id]: r.message }));
    } catch {
      setTestResults((p) => ({ ...p, [id]: "TEST FAILED" }));
    }
  };

  const handleAddClient = async (data: any) => {
    await api("/insurance/clients", { method: "POST", body: JSON.stringify(data) });
    setShowAddClient(false);
    load();
  };

  const filteredClients = clients.filter((c) => {
    if (!searchQ) return true;
    const q = searchQ.toUpperCase();
    return (
      c.firstName.toUpperCase().includes(q) ||
      c.lastName.toUpperCase().includes(q) ||
      (c.email?.toUpperCase().includes(q) ?? false) ||
      (c.phone?.includes(q) ?? false)
    );
  });

  return (
    <div style={{ minHeight: "100vh", background: "#09090b", color: "#e4e4e7" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 20px",
          borderBottom: "1px solid #1a1a24",
          background: "rgba(9,9,11,0.95)",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <button onClick={() => navigate("/")} style={{ background: "none", border: "none", color: "#71717a", cursor: "pointer", padding: 4 }}>
          <ArrowLeft size={18} />
        </button>
        <Shield size={20} style={{ color: "#38bdf8" }} />
        <div>
          <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, letterSpacing: "0.15em", color: "#38bdf8" }}>
            INSURANCE API
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 9, color: "#52525b", letterSpacing: "0.1em" }}>
            CARRIER CONNECTIONS & POLICY MANAGEMENT
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #1a1a24", overflowX: "auto" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 18px",
              background: tab === t.key ? "rgba(56,189,248,0.08)" : "transparent",
              border: "none",
              borderBottom: tab === t.key ? "2px solid #38bdf8" : "2px solid transparent",
              color: tab === t.key ? "#38bdf8" : "#71717a",
              fontFamily: "monospace",
              fontSize: 11,
              letterSpacing: "0.12em",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px" }}>
        {/* OVERVIEW TAB */}
        {tab === "overview" && stats && (
          <div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
              <StatCard label="TOTAL CLIENTS" value={stats.totalClients} color="#22c55e" />
              <StatCard label="ACTIVE POLICIES" value={stats.activePolicies} color="#38bdf8" />
              <StatCard label="PENDING" value={stats.pendingPolicies} color="#f59e0b" />
              <StatCard label="TOTAL POLICIES" value={stats.totalPolicies} color="#a78bfa" />
              <StatCard label="CARRIERS" value={stats.carrierConnections} color="#e879f9" />
              <StatCard label="TOTAL CALLS" value={stats.totalCalls} color="#fb923c" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Recent Clients */}
              <div style={{ background: "rgba(15,15,20,0.8)", border: "1px solid #1a1a24", borderRadius: 8, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ color: "#22c55e", fontFamily: "monospace", fontSize: 11, letterSpacing: "0.12em" }}>RECENT CLIENTS</span>
                  <button onClick={() => setTab("clients")} style={{ background: "none", border: "none", color: "#71717a", cursor: "pointer", fontFamily: "monospace", fontSize: 10 }}>
                    VIEW ALL <ChevronRight size={10} style={{ display: "inline" }} />
                  </button>
                </div>
                {clients.slice(0, 5).map((c) => (
                  <div key={c.id} style={{ padding: "6px 0", borderTop: "1px solid #1a1a24", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 12, color: "#d4d4d8" }}>{c.firstName} {c.lastName}</span>
                    <span style={{ fontFamily: "monospace", fontSize: 10, color: "#52525b" }}>{c.state || "—"}</span>
                  </div>
                ))}
                {clients.length === 0 && (
                  <div style={{ fontFamily: "monospace", fontSize: 11, color: "#3f3f46", padding: "16px 0", textAlign: "center" }}>
                    NO CLIENTS YET
                  </div>
                )}
              </div>

              {/* Carrier Connections */}
              <div style={{ background: "rgba(15,15,20,0.8)", border: "1px solid #1a1a24", borderRadius: 8, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ color: "#a78bfa", fontFamily: "monospace", fontSize: 11, letterSpacing: "0.12em" }}>CARRIER CONNECTIONS</span>
                  <button onClick={() => setTab("connections")} style={{ background: "none", border: "none", color: "#71717a", cursor: "pointer", fontFamily: "monospace", fontSize: 10 }}>
                    VIEW ALL <ChevronRight size={10} style={{ display: "inline" }} />
                  </button>
                </div>
                {connections.map((co) => (
                  <div key={co.connection.id} style={{ padding: "6px 0", borderTop: "1px solid #1a1a24", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: co.carrier.logoColor }} />
                      <span style={{ fontFamily: "monospace", fontSize: 12, color: "#d4d4d8" }}>{co.carrier.name}</span>
                    </div>
                    <span style={{ fontFamily: "monospace", fontSize: 10, color: "#52525b" }}>{co.connection.agencyName || "—"}</span>
                  </div>
                ))}
                {connections.length === 0 && (
                  <div style={{ fontFamily: "monospace", fontSize: 11, color: "#3f3f46", padding: "16px 0", textAlign: "center" }}>
                    NO CONNECTIONS — ADD A CARRIER
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* CLIENTS TAB */}
        {tab === "clients" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
                <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "#52525b" }} />
                <input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="SEARCH CLIENTS..."
                  style={{ ...inputStyle, paddingLeft: 32, width: "100%" }}
                />
              </div>
              <button
                onClick={() => setShowAddClient(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 16px",
                  background: "rgba(34,197,94,0.15)",
                  border: "1px solid rgba(34,197,94,0.3)",
                  borderRadius: 6,
                  color: "#22c55e",
                  fontFamily: "monospace",
                  fontSize: 11,
                  cursor: "pointer",
                  letterSpacing: "0.1em",
                }}
              >
                <Plus size={14} />
                ADD CLIENT
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {filteredClients.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 14px",
                    background: "rgba(15,15,20,0.8)",
                    border: "1px solid #1a1a24",
                    borderRadius: 6,
                  }}
                >
                  <div>
                    <div style={{ fontFamily: "monospace", fontSize: 13, color: "#e4e4e7" }}>
                      {c.firstName} {c.lastName}
                    </div>
                    <div style={{ fontFamily: "monospace", fontSize: 10, color: "#52525b", marginTop: 2 }}>
                      {c.email || "NO EMAIL"} {c.phone ? `| ${c.phone}` : ""} {c.state ? `| ${c.state}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontSize: 9,
                        color: c.source === "phone" ? "#fb923c" : "#52525b",
                        background: c.source === "phone" ? "rgba(251,146,60,0.1)" : "rgba(63,63,70,0.2)",
                        padding: "2px 8px",
                        borderRadius: 4,
                        letterSpacing: "0.1em",
                      }}
                    >
                      {c.source.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
              {filteredClients.length === 0 && (
                <div style={{ fontFamily: "monospace", fontSize: 12, color: "#3f3f46", padding: 32, textAlign: "center" }}>
                  {searchQ ? "NO MATCHING CLIENTS" : "NO CLIENTS YET — ADD YOUR FIRST CLIENT"}
                </div>
              )}
            </div>
          </div>
        )}

        {/* POLICIES TAB */}
        {tab === "policies" && (
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {policies.map((p) => (
                <div
                  key={p.policy.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 14px",
                    background: "rgba(15,15,20,0.8)",
                    border: "1px solid #1a1a24",
                    borderRadius: 6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.carrier.logoColor }} />
                    <div>
                      <div style={{ fontFamily: "monospace", fontSize: 13, color: "#e4e4e7" }}>
                        {p.policy.planName || p.carrier.name} {p.policy.policyNumber ? `#${p.policy.policyNumber}` : ""}
                      </div>
                      <div style={{ fontFamily: "monospace", fontSize: 10, color: "#52525b", marginTop: 2 }}>
                        {p.carrier.shortName} | {p.policy.planType || "—"} {p.policy.effectiveDate ? `| EFF ${p.policy.effectiveDate}` : ""}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {p.policy.premiumMonthly && (
                      <span style={{ fontFamily: "monospace", fontSize: 12, color: "#22c55e" }}>
                        ${p.policy.premiumMonthly}/MO
                      </span>
                    )}
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontSize: 9,
                        color: STATUS_COLORS[p.policy.status] || "#71717a",
                        background: `${STATUS_COLORS[p.policy.status] || "#71717a"}15`,
                        padding: "2px 8px",
                        borderRadius: 4,
                        letterSpacing: "0.1em",
                      }}
                    >
                      {p.policy.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
              {policies.length === 0 && (
                <div style={{ fontFamily: "monospace", fontSize: 12, color: "#3f3f46", padding: 32, textAlign: "center" }}>
                  NO POLICIES YET — CREATE ONE FROM A CLIENT RECORD
                </div>
              )}
            </div>
          </div>
        )}

        {/* CONNECTIONS TAB */}
        {tab === "connections" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontFamily: "monospace", fontSize: 12, color: "#71717a" }}>
                {connections.length} CARRIER{connections.length !== 1 ? "S" : ""} CONNECTED
              </span>
              <button
                onClick={() => setShowAddConnection(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 16px",
                  background: "rgba(56,189,248,0.15)",
                  border: "1px solid rgba(56,189,248,0.3)",
                  borderRadius: 6,
                  color: "#38bdf8",
                  fontFamily: "monospace",
                  fontSize: 11,
                  cursor: "pointer",
                  letterSpacing: "0.1em",
                }}
              >
                <Plus size={14} />
                ADD CARRIER
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
              {connections.map((co) => (
                <div
                  key={co.connection.id}
                  style={{
                    background: "rgba(15,15,20,0.8)",
                    border: `1px solid ${co.carrier.logoColor}33`,
                    borderRadius: 8,
                    padding: 16,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 6,
                          background: `${co.carrier.logoColor}20`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontFamily: "monospace",
                          fontSize: 11,
                          fontWeight: 700,
                          color: co.carrier.logoColor,
                        }}
                      >
                        {co.carrier.shortName}
                      </div>
                      <div>
                        <div style={{ fontFamily: "monospace", fontSize: 13, color: "#e4e4e7", fontWeight: 600 }}>{co.carrier.name}</div>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#52525b" }}>{co.connection.agencyName || "NO AGENCY"}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteConnection(co.connection.id)}
                      style={{ background: "none", border: "none", color: "#3f3f46", cursor: "pointer", padding: 4 }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: 10, color: "#52525b", marginBottom: 8 }}>
                    NPN: {co.connection.npn || "—"} | TOKEN: {co.connection.apiToken && co.connection.apiToken !== "null" ? "CONFIGURED" : "NOT SET"}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => handleTestConnection(co.connection.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "6px 12px",
                        background: "rgba(167,139,250,0.1)",
                        border: "1px solid rgba(167,139,250,0.2)",
                        borderRadius: 4,
                        color: "#a78bfa",
                        fontFamily: "monospace",
                        fontSize: 10,
                        cursor: "pointer",
                      }}
                    >
                      <TestTube size={12} />
                      TEST
                    </button>
                  </div>
                  {testResults[co.connection.id] && (
                    <div style={{ fontFamily: "monospace", fontSize: 10, color: "#f59e0b", marginTop: 8, padding: "6px 8px", background: "rgba(245,158,11,0.05)", borderRadius: 4 }}>
                      {testResults[co.connection.id]}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Available Carriers */}
            <div style={{ marginTop: 24 }}>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: "#71717a", letterSpacing: "0.12em", marginBottom: 12 }}>
                AVAILABLE CARRIERS
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                {carriers.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 12px",
                      background: "rgba(15,15,20,0.6)",
                      border: `1px solid ${c.logoColor}22`,
                      borderRadius: 6,
                    }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.logoColor }} />
                    <span style={{ fontFamily: "monospace", fontSize: 11, color: "#a1a1aa" }}>{c.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CALLS TAB */}
        {tab === "calls" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontFamily: "monospace", fontSize: 12, color: "#71717a" }}>
                INSURANCE CALL LOG
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    background: "rgba(34,197,94,0.15)",
                    border: "1px solid rgba(34,197,94,0.3)",
                    borderRadius: 6,
                    color: "#22c55e",
                    fontFamily: "monospace",
                    fontSize: 11,
                    cursor: "pointer",
                    letterSpacing: "0.1em",
                  }}
                  onClick={() => navigate("/phone")}
                >
                  <PhoneCall size={14} />
                  INBOUND
                </button>
                <button
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    background: "rgba(56,189,248,0.15)",
                    border: "1px solid rgba(56,189,248,0.3)",
                    borderRadius: 6,
                    color: "#38bdf8",
                    fontFamily: "monospace",
                    fontSize: 11,
                    cursor: "pointer",
                    letterSpacing: "0.1em",
                  }}
                  onClick={() => navigate("/phone")}
                >
                  <PhoneOutgoing size={14} />
                  OUTBOUND
                </button>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {callLogs.map((log: any) => (
                <div
                  key={log.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 14px",
                    background: "rgba(15,15,20,0.8)",
                    border: "1px solid #1a1a24",
                    borderRadius: 6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {log.direction === "inbound" ? <PhoneCall size={14} style={{ color: "#22c55e" }} /> : <PhoneOutgoing size={14} style={{ color: "#38bdf8" }} />}
                    <div>
                      <div style={{ fontFamily: "monospace", fontSize: 12, color: "#e4e4e7" }}>
                        {log.callerPhone || "UNKNOWN"} — {log.callType?.toUpperCase() || "GENERAL"}
                      </div>
                      <div style={{ fontFamily: "monospace", fontSize: 10, color: "#52525b" }}>
                        {log.duration ? `${Math.floor(log.duration / 60)}m ${log.duration % 60}s` : "—"} | {log.outcome?.toUpperCase() || "—"}
                      </div>
                    </div>
                  </div>
                  <span style={{ fontFamily: "monospace", fontSize: 10, color: "#3f3f46" }}>
                    {new Date(log.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
              {callLogs.length === 0 && (
                <div style={{ fontFamily: "monospace", fontSize: 12, color: "#3f3f46", padding: 32, textAlign: "center" }}>
                  NO INSURANCE CALLS LOGGED YET
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showAddConnection && <AddConnectionModal carriers={carriers} onClose={() => setShowAddConnection(false)} onSave={handleAddConnection} />}
      {showAddClient && <AddClientModal onClose={() => setShowAddClient(false)} onSave={handleAddClient} />}
    </div>
  );
}
