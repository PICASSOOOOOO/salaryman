import { ArrowRight, Check, Copy, ExternalLink, Monitor, RefreshCw, ShieldCheck, Smartphone, Unlink } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { apiFetch } from "@/lib/api-client";
import "./device-link.css";

type DeviceLinkRecord = {
  id?: string | number;
  code?: string;
  pairingCode?: string;
  pairing_code?: string;
  status?: string;
  state?: string;
  desktopName?: string;
  desktop_name?: string;
  mobileName?: string;
  mobile_name?: string;
  createdAt?: string;
  [key: string]: unknown;
};

type DeviceLinkMode = "desktop" | "mobile";

const DESKTOP_DEVICE_KEY = "salaryman_desktop_device_id";
const MOBILE_DEVICE_KEY = "salaryman_mobile_device_id";
const DESKTOP_LINK_KEY = "salaryman_desktop_link";
const MOBILE_LINK_KEY = "salaryman_mobile_link";

const remoteRoutes = [
  { path: "/desktop", name: "Desktop", detail: "the office client" },
  { path: "/business", name: "Business", detail: "the operating desk" },
  { path: "/phone", name: "Phone", detail: "calls and SMS" },
  { path: "/settings", name: "Settings", detail: "account controls" },
];

function getDeviceId(storageKey: string): string {
  const stored = window.localStorage.getItem(storageKey);
  if (stored) return stored;
  const next = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(storageKey, next);
  return next;
}

async function readApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await apiFetch(path, options);
  const raw = await response.text();
  let payload: unknown = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = raw;
    }
  }
  if (!response.ok) {
    const message = typeof payload === "object" && payload && "message" in payload
      ? String((payload as { message: unknown }).message)
      : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

function unwrapLink(payload: unknown): DeviceLinkRecord | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  for (const key of ["deviceLink", "link", "data"]) {
    const candidate = record[key];
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      return candidate as DeviceLinkRecord;
    }
  }
  return record as DeviceLinkRecord;
}

function unwrapLinks(payload: unknown): DeviceLinkRecord[] {
  if (Array.isArray(payload)) return payload as DeviceLinkRecord[];
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of ["links", "deviceLinks", "data"]) {
    if (Array.isArray(record[key])) return record[key] as DeviceLinkRecord[];
  }
  const single = unwrapLink(payload);
  return single?.id ? [single] : [];
}

function linkId(link: DeviceLinkRecord | null): string | undefined {
  return link?.id === undefined || link?.id === null ? undefined : String(link.id);
}

function linkCode(link: DeviceLinkRecord | null): string {
  return String(link?.code ?? link?.pairingCode ?? link?.pairing_code ?? "");
}

function linkStatus(link: DeviceLinkRecord | null): string {
  return String(link?.status ?? link?.state ?? "").toLowerCase();
}

function rememberLink(storageKey: string, link: DeviceLinkRecord, deviceId: string): void {
  const id = linkId(link);
  if (!id) return;
  window.localStorage.setItem(storageKey, JSON.stringify({ linkId: id, deviceId }));
}

function controlSocketUrl(link: DeviceLinkRecord, role: "mobile", deviceId: string): string | null {
  const id = linkId(link);
  if (!id) return null;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${protocol}//${window.location.host}${base}/ws/device-control/${encodeURIComponent(id)}?role=${role}&deviceId=${encodeURIComponent(deviceId)}`;
}

function statusLabel(link: DeviceLinkRecord | null): string {
  const status = linkStatus(link);
  if (["linked", "approved", "connected", "active"].includes(status)) return "LINKED";
  if (["revoked", "expired", "cancelled"].includes(status)) return status.toUpperCase();
  return "AWAITING PHONE";
}

function SignalStatus({ link }: { link: DeviceLinkRecord | null }) {
  const status = linkStatus(link);
  const live = ["linked", "approved", "connected", "active"].includes(status);
  const warm = ["revoked", "expired", "cancelled"].includes(status);
  return (
    <div className="device-link-status" data-testid="status-device-link">
      <span className={`device-link-status-dot${live ? " live" : warm ? " warm" : ""}`} aria-hidden />
      <span>{statusLabel(link)}</span>
    </div>
  );
}

function LinkHeader({ mode }: { mode: DeviceLinkMode }) {
  return (
    <header className="device-link-topbar">
      <Link href="/" className="device-link-brand" data-testid="link-salaryman-home">
        <span className="device-link-brand-mark" aria-hidden>SM</span>
        <span>SALARYMAN</span>
      </Link>
      <span className="device-link-topline">near-field session control / 01</span>
      <nav className="device-link-mode" aria-label="Device link mode">
        <Link href="/device-link?mode=desktop" aria-current={mode === "desktop" ? "page" : undefined} data-testid="link-desktop-mode">
          <Monitor size={12} aria-hidden /> desktop
        </Link>
        <Link href="/device-link?mode=mobile" aria-current={mode === "mobile" ? "page" : undefined} data-testid="link-mobile-mode">
          <Smartphone size={12} aria-hidden /> mobile
        </Link>
      </nav>
    </header>
  );
}

function DeviceLinkFooter() {
  return (
    <footer className="device-link-footer">
      <span><strong>LOCAL PROXIMITY</strong> / approval happens once</span>
      <span>session data stays with SALARYMAN</span>
    </footer>
  );
}

function DesktopMode() {
  const [links, setLinks] = useState<DeviceLinkRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [desktopName, setDesktopName] = useState("SALARYMAN desktop");
  const [issuedCode, setIssuedCode] = useState("");
  const desktopDeviceId = useMemo(() => getDeviceId(DESKTOP_DEVICE_KEY), []);

  const loadLinks = useCallback(async () => {
    try {
      const payload = await readApi<unknown>("/api/device-links");
      setLinks(unwrapLinks(payload));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read device links.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLinks();
    const refresh = window.setInterval(() => void loadLinks(), 4000);
    return () => window.clearInterval(refresh);
  }, [loadLinks]);

  const currentLink = useMemo(() => {
    const candidates = links.filter((link) => !["revoked", "expired", "cancelled"].includes(linkStatus(link)));
    return candidates[0] ?? links[0] ?? null;
  }, [links]);
  const code = issuedCode || linkCode(currentLink);
  const isLinked = ["linked", "approved", "connected", "active"].includes(linkStatus(currentLink));
  useEffect(() => {
    if (currentLink && isLinked) {
      setIssuedCode("");
      rememberLink(DESKTOP_LINK_KEY, currentLink, desktopDeviceId);
    }
  }, [currentLink, desktopDeviceId, isLinked]);

  async function createPairingRequest() {
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const payload = await readApi<unknown>("/api/device-links/pairing-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desktopDeviceId, desktopName: desktopName.trim() || "SALARYMAN desktop" }),
      });
      const created = unwrapLink(payload);
      if (created) {
        setIssuedCode(linkCode(created));
        setLinks((previous) => [created, ...previous]);
      }
      else await loadLinks();
      setNotice("One-time code issued. Keep both devices nearby while the phone approves.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not issue a pairing code.");
    } finally {
      setWorking(false);
    }
  }

  async function revokeLink() {
    const id = linkId(currentLink);
    if (!id) return;
    setWorking(true);
    setError("");
    try {
      await readApi(`/api/device-links/${encodeURIComponent(id)}`, { method: "DELETE" });
      setLinks((previous) => previous.filter((link) => linkId(link) !== id));
      setIssuedCode("");
      setNotice("The remote link was revoked.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not revoke this link.");
    } finally {
      setWorking(false);
    }
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Copy is unavailable here. Read the code directly from the panel.");
    }
  }

  return (
    <main className="device-link-main">
      <section>
        <p className="device-link-kicker">desktop station / trusted remote</p>
        <h1 className="device-link-headline">Put the<br /><em>world</em><br />in hand.</h1>
        <p className="device-link-intro">
          Turn a nearby phone into a <strong>trusted remote</strong> for this SALARYMAN session.
          Approval happens once, while both devices are close. No repeated sign-in ritual.
        </p>
        <div className="device-link-steps" aria-label="Pairing steps">
          <div className="device-link-step"><span className="device-link-step-number">01</span><p>Issue a short-lived code here.</p></div>
          <div className="device-link-step"><span className="device-link-step-number">02</span><p>Enter it on the nearby phone.</p></div>
          <div className="device-link-step"><span className="device-link-step-number">03</span><p>Approve once. The link stays trusted.</p></div>
        </div>
      </section>

      <section className="device-link-panel" data-testid="panel-desktop-device-link">
        <div className="device-link-panel-heading">
          <h2>Desktop station</h2>
          <span>id / {desktopDeviceId.slice(0, 8)}</span>
        </div>
        <div className="device-link-panel-body">
          {loading ? (
            <div className="device-link-skeleton" data-testid="loading-device-links" aria-label="Loading device links">
              <span /><span /><span />
            </div>
          ) : (
            <>
              <SignalStatus link={currentLink} />
              {!currentLink || !code ? (
                <>
                  <label className="device-link-field-label" htmlFor="desktop-name">Station name</label>
                  <input
                    id="desktop-name"
                    className="device-link-field"
                    value={desktopName}
                    onChange={(event) => setDesktopName(event.target.value)}
                    data-testid="input-desktop-name"
                    maxLength={60}
                  />
                  <button className="device-link-primary" onClick={createPairingRequest} disabled={working} data-testid="button-create-pairing">
                    {working ? "issuing code" : "issue one-time code"} <ArrowRight size={14} aria-hidden />
                  </button>
                </>
              ) : (
                <>
                  <div className="device-link-code" data-testid="text-pairing-code">
                    <span className="device-link-code-label">{isLinked ? "remote linked" : "one-time pairing code"}</span>
                    <strong className="device-link-code-value">{code}</strong>
                    {!isLinked && (
                      <div className="device-link-code-actions">
                        <button onClick={copyCode} data-testid="button-copy-pairing-code">
                          {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />} {copied ? "copied" : "copy code"}
                        </button>
                      </div>
                    )}
                  </div>
                  {isLinked && (
                    <div className="device-link-notice" data-testid="text-linked-notice">
                      <ShieldCheck size={14} aria-hidden /> Phone approval complete. This desktop now has a trusted remote.
                    </div>
                  )}
                  {!isLinked && <p className="device-link-notice">Waiting for a phone nearby. Approval is required on the phone before the remote activates.</p>}
                  <div className="device-link-meta">
                    <div><span className="device-link-meta-label">desktop</span><p>{String(currentLink.desktopName ?? currentLink.desktop_name ?? desktopName)}</p></div>
                    <div><span className="device-link-meta-label">mobile</span><p>{String(currentLink.mobileName ?? currentLink.mobile_name ?? "not approved")}</p></div>
                  </div>
                  <button className="device-link-danger" onClick={revokeLink} disabled={working} data-testid="button-revoke-device-link">
                    <Unlink size={13} aria-hidden /> {working ? "revoking" : "revoke link"}
                  </button>
                </>
              )}
            </>
          )}
          {notice && <p className="device-link-notice" data-testid="text-device-link-notice">{notice}</p>}
          {error && <p className="device-link-error" data-testid="text-device-link-error">{error}</p>}
        </div>
      </section>
    </main>
  );
}

function MobileRemotePanel({ link }: { link: DeviceLinkRecord }) {
  const [activeRoute, setActiveRoute] = useState(remoteRoutes[0].path);
  const mobileDeviceId = useMemo(() => getDeviceId(MOBILE_DEVICE_KEY), []);
  const [connectionState, setConnectionState] = useState("connecting");
  const socketRef = useRef<WebSocket | null>(null);
  const pendingControlRef = useRef<object | null>(null);
  useEffect(() => {
    rememberLink(MOBILE_LINK_KEY, link, mobileDeviceId);
    const url = controlSocketUrl(link, "mobile", mobileDeviceId);
    if (!url) return;
    let stopped = false;
    let reconnectTimer: number | undefined;
    let attempt = 0;
    const connect = () => {
      if (stopped) return;
      setConnectionState(attempt ? "reconnecting" : "connecting");
      const socket = new WebSocket(url);
      socketRef.current = socket;
      socket.addEventListener("open", () => {
        attempt = 0;
        setConnectionState("connected");
        if (pendingControlRef.current) {
          socket.send(JSON.stringify({ type: "control", ...pendingControlRef.current }));
          pendingControlRef.current = null;
        }
      });
      socket.addEventListener("close", () => {
        if (socketRef.current === socket) socketRef.current = null;
        if (stopped) return;
        setConnectionState("offline");
        const delay = Math.min(15000, 1000 * 2 ** Math.min(attempt++, 4));
        reconnectTimer = window.setTimeout(connect, delay);
      });
      socket.addEventListener("error", () => setConnectionState("offline"));
    };
    connect();
    return () => {
      stopped = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [link, mobileDeviceId]);
  const sendControl = (message: object) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "control", ...message }));
    } else {
      pendingControlRef.current = message;
    }
  };
  return (
    <div className="device-link-remote" data-testid="panel-mobile-remote">
      <div className="device-link-remote-heading">
        <h3><ShieldCheck size={14} aria-hidden /> trusted remote</h3>
         <span>mobile / {mobileDeviceId.slice(0, 8)}</span>
      </div>
      <div className="device-link-status" data-testid="status-mobile-linked">
        <span className="device-link-status-dot live" aria-hidden />
         <span>{connectionState} / linked to {String(link.desktopName ?? link.desktop_name ?? "desktop station")}</span>
      </div>
      <div className="device-link-route-list" aria-label="Allowlisted SALARYMAN routes">
        {remoteRoutes.map((route) => (
          <button
            key={route.path}
            className={`device-link-route${activeRoute === route.path ? " active" : ""}`}
             onClick={() => {
               setActiveRoute(route.path);
               sendControl({ action: "navigate", path: route.path });
             }}
            aria-pressed={activeRoute === route.path}
            data-testid={`button-remote-route-${route.name.toLowerCase()}`}
          >
            <span>{route.name} <small>/ {route.detail}</small></span>
            <ExternalLink size={13} aria-hidden />
          </button>
        ))}
      </div>
      <div className="device-link-remote-actions">
         <button className="device-link-secondary" onClick={() => sendControl({ action: "reload" })} data-testid="button-reload-remote">
          <RefreshCw size={13} aria-hidden /> reload remote
        </button>
      </div>
    </div>
  );
}

function MobileMode() {
  const [code, setCode] = useState("");
  const [resolvedLink, setResolvedLink] = useState<DeviceLinkRecord | null>(null);
  const [approvedLink, setApprovedLink] = useState<DeviceLinkRecord | null>(null);
  const [mobileName, setMobileName] = useState("SALARYMAN mobile");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const mobileDeviceId = useMemo(() => getDeviceId(MOBILE_DEVICE_KEY), []);

  function onCodeChange(value: string) {
    setCode(value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8));
    setError("");
  }

  async function resolveCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length !== 8) {
      setError("Enter the full 8-character code from the desktop.");
      return;
    }
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const payload = await readApi<unknown>("/api/device-links/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const link = unwrapLink(payload);
      if (!link || !linkId(link)) throw new Error("That code could not be resolved.");
      setResolvedLink(link);
      setNotice("Code found. Confirm once to trust this phone.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That code could not be resolved.");
    } finally {
      setWorking(false);
    }
  }

  async function approveLink() {
    const id = linkId(resolvedLink);
    if (!id) return;
    setWorking(true);
    setError("");
    try {
      const payload = await readApi<unknown>(`/api/device-links/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobileDeviceId, mobileName: mobileName.trim() || "SALARYMAN mobile" }),
      });
      const link = unwrapLink(payload) ?? resolvedLink;
      if (!link) throw new Error("Approval completed without a device link.");
      setApprovedLink(link);
      setResolvedLink(link);
      rememberLink(MOBILE_LINK_KEY, link, mobileDeviceId);
      setNotice("Approved. This phone is now a trusted remote.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Approval could not be completed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="device-link-mobile-main">
      <section className="device-link-mobile-wrap">
        <p className="device-link-kicker">mobile station / remote access</p>
        <h1 className="device-link-headline">Carry the<br /><em>signal.</em></h1>
        <p className="device-link-intro">
          Enter the code shown on the SALARYMAN desktop. A single approval connects this phone
          to the nearby session.
        </p>
        <section className="device-link-panel" data-testid="panel-mobile-device-link">
          <div className="device-link-panel-heading">
            <h2>Phone receiver</h2>
            <span>one approval</span>
          </div>
          <div className="device-link-panel-body">
            {!resolvedLink ? (
              <form onSubmit={resolveCode}>
                <label className="device-link-field-label" htmlFor="pairing-code">8-character desktop code</label>
                <input
                  id="pairing-code"
                  className="device-link-field"
                  value={code}
                  onChange={(event) => onCodeChange(event.target.value)}
                  placeholder="A7K4Q2M9"
                  autoComplete="one-time-code"
                  inputMode="text"
                  maxLength={8}
                  autoFocus
                  data-testid="input-pairing-code"
                />
                <button className="device-link-primary" type="submit" disabled={working} data-testid="button-resolve-pairing">
                  {working ? "checking code" : "resolve code"} <ArrowRight size={14} aria-hidden />
                </button>
              </form>
            ) : !approvedLink ? (
              <div className="device-link-approval">
                <SignalStatus link={resolvedLink} />
                <h3>Trust this phone?</h3>
                <p>This approval is explicit and one-time. Keep the desktop and phone nearby while the link is completed.</p>
                <label className="device-link-field-label" htmlFor="mobile-name" style={{ marginTop: 22 }}>Phone name</label>
                <input
                  id="mobile-name"
                  className="device-link-field"
                  value={mobileName}
                  onChange={(event) => setMobileName(event.target.value)}
                  maxLength={60}
                  data-testid="input-mobile-name"
                />
                <button className="device-link-primary" onClick={approveLink} disabled={working} data-testid="button-approve-device-link">
                  {working ? "approving" : "approve this phone"} <ShieldCheck size={14} aria-hidden />
                </button>
              </div>
            ) : (
              <MobileRemotePanel link={approvedLink} />
            )}
            {notice && <p className="device-link-notice" data-testid="text-mobile-notice">{notice}</p>}
            {error && <p className="device-link-error" data-testid="text-mobile-error">{error}</p>}
          </div>
        </section>
      </section>
    </main>
  );
}

export default function DeviceLink() {
  const [location] = useLocation();
  const search = typeof window !== "undefined" ? window.location.search : location.split("?")[1] ?? "";
  const mode: DeviceLinkMode = new URLSearchParams(search).get("mode") === "mobile" ? "mobile" : "desktop";
  return (
    <div className="device-link-root">
      <div className="device-link-inner">
        <LinkHeader mode={mode} />
        {mode === "desktop" ? <DesktopMode /> : <MobileMode />}
        <DeviceLinkFooter />
      </div>
    </div>
  );
}