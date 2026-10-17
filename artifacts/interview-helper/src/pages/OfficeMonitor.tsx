import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, ArrowUpRight, Circle, RefreshCw, Users, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { SignInPage } from "@/components/SignInPrompt";
import "./office-monitor.css";

type OfficePerson = {
  userId: string;
  name: string;
  role: string;
  roomKey: string;
  floorNumber: number;
  x: number;
  y: number;
  action: string;
  avatarUrl: string | null;
  lastSeenAt: string;
};
type OfficeSnapshot = {
  orgId: number;
  observedAt: string;
  people: OfficePerson[];
  permissions: { canViewManagement: boolean; canViewPeers: boolean };
};
type PresenceEvent = {
  type: "office_presence";
  orgId: number;
  userId: string;
  roomKey: string;
  floorNumber: number;
  x: number;
  y: number;
  action: string;
  observedAt: string;
};

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

function timeLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function OfficeMonitor() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const [snapshot, setSnapshot] = useState<OfficeSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [hasConnected, setHasConnected] = useState(false);
  const [socketAttempt, setSocketAttempt] = useState(0);
  const [refreshAttempt, setRefreshAttempt] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const identityRef = useRef("");
  const retryDelayRef = useRef(1000);

  const clearScope = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
    setSnapshot(null);
    setSelectedId(null);
    setConnected(false);
    setHasConnected(false);
    setError("");
    setLoading(true);
  }, []);

  useEffect(() => {
    const identity = isAuthenticated && user?.id ? user.id : "";
    if (identityRef.current !== identity) {
      identityRef.current = identity;
      clearScope();
    }
  }, [isAuthenticated, user?.id, clearScope]);

  const loadSnapshot = useCallback(async () => {
    try {
      const response = await apiFetch("/api/desktop-building/office-monitor");
      const body = await response.json().catch(() => ({})) as OfficeSnapshot & { error?: string };
      if (!response.ok) throw new Error(body.error || `Office monitor unavailable (${response.status})`);
      setSnapshot((current) => {
        if (!body.permissions?.canViewPeers) return { ...body, people: [] };
        if (!current || current.orgId !== body.orgId) return body;
        const newestById = new Map(current.people.map((person) => [person.userId, person]));
        return {
          ...body,
          people: body.people.map((person) => {
            const newer = newestById.get(person.userId);
            return newer && new Date(newer.lastSeenAt).getTime() > new Date(body.observedAt).getTime()
              ? newer
              : person;
          }),
        };
      });
      setError("");
      setLoading(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the office monitor.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !user?.id) {
      clearScope();
      return;
    }
    let active = true;
    setLoading(true);
    setSnapshot(null);
    setSelectedId(null);
    setError("");
    apiFetch("/api/desktop-building/office-monitor")
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as OfficeSnapshot & { error?: string };
        if (!response.ok) throw new Error(body.error || `Office monitor unavailable (${response.status})`);
        if (!active) return;
        setSnapshot((current) => {
          if (!body.permissions?.canViewPeers) return { ...body, people: [] };
          if (!current || current.orgId !== body.orgId) return body;
          const newestById = new Map(current.people.map((person) => [person.userId, person]));
          return {
            ...body,
            people: body.people.map((person) => {
              const newer = newestById.get(person.userId);
              return newer && new Date(newer.lastSeenAt).getTime() > new Date(body.observedAt).getTime()
                ? newer
                : person;
            }),
          };
        });
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Could not load the office monitor.");
        setLoading(false);
      });
    return () => { active = false; };
  }, [authLoading, isAuthenticated, user?.id, refreshAttempt, clearScope]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id || !snapshot?.orgId || !snapshot.permissions.canViewPeers) return;
    let active = true;
    let retryTimer = 0;
    const connect = () => {
      if (!active) return;
      const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${scheme}//${window.location.host}/ws/chat?orgId=${encodeURIComponent(snapshot.orgId)}`);
      socketRef.current = socket;
      socket.onopen = () => { /* The server's authenticated ready event confirms subscription. */ };
      socket.onmessage = (message) => {
        let event: { type?: string; orgId?: number; userId?: string; roomKey?: string; floorNumber?: number; x?: number; y?: number; action?: string; observedAt?: string };
        try { event = JSON.parse(String(message.data)); } catch { return; }
        if (event.type === "ready") {
          if (active) {
            setConnected(true);
            setHasConnected(true);
            retryDelayRef.current = 1000;
          }
          // Re-sync after the authenticated socket is registered to close the
          // initial snapshot / reconnect gap.
          void loadSnapshot();
          return;
        }
        if (event.type !== "office_presence" || event.orgId !== snapshot.orgId) return;
        setSnapshot((current) => {
          if (!current || current.orgId !== event.orgId) return current;
          const personIndex = current.people.findIndex((person) => person.userId === event.userId);
          // The snapshot is the visibility authority. Realtime cannot introduce
          // a person the server did not include in the viewer's visible set.
          if (personIndex < 0) return current;
          const people = [...current.people];
          people[personIndex] = {
            ...people[personIndex],
            roomKey: event.roomKey ?? people[personIndex].roomKey,
            floorNumber: event.floorNumber ?? people[personIndex].floorNumber,
            x: event.x ?? people[personIndex].x,
            y: event.y ?? people[personIndex].y,
            action: event.action ?? people[personIndex].action,
            lastSeenAt: event.observedAt ?? people[personIndex].lastSeenAt,
          };
          return { ...current, people };
        });
      };
      socket.onclose = () => {
        if (!active) return;
        setConnected(false);
        void loadSnapshot();
        const delay = retryDelayRef.current;
        retryDelayRef.current = Math.min(delay * 2, 15000);
        retryTimer = window.setTimeout(() => {
          setSocketAttempt((attempt) => attempt + 1);
        }, delay);
      };
      socket.onerror = () => socket.close();
    };
    connect();
    return () => {
      active = false;
      window.clearTimeout(retryTimer);
      socketRef.current?.close();
      socketRef.current = null;
      setConnected(false);
    };
  }, [isAuthenticated, user?.id, snapshot?.orgId, snapshot?.permissions.canViewPeers, socketAttempt, loadSnapshot]);

  const people = useMemo(() => snapshot?.people ?? [], [snapshot?.people]);
  const selected = people.find((person) => person.userId === selectedId) ?? people[0] ?? null;
  const selectedIndex = selected ? people.findIndex((person) => person.userId === selected.userId) : -1;
  const cameraFloor = selected?.floorNumber ?? null;
  const cameraPeople = cameraFloor == null ? [] : people.filter((person) => person.floorNumber === cameraFloor);

  const rotate = (direction: -1 | 1) => {
    if (!people.length) return;
    const next = (selectedIndex + direction + people.length) % people.length;
    setSelectedId(people[next].userId);
  };

  if (authLoading) return <div className="office-monitor"><div className="om-loading"><span className="om-skeleton om-skeleton-heading" /><span className="om-skeleton om-skeleton-view" /><span className="om-skeleton om-skeleton-line" /></div></div>;
  if (!isAuthenticated) return <SignInPage />;

  return (
    <main className="office-monitor">
      <header className="om-header">
        <Link href="/my-office" className="om-back" data-testid="link-monitor-back"><ArrowLeft size={15} /><span>My office</span></Link>
        <div className="om-title">
          <span className="om-eyebrow">SALARYMAN TOWER / OFFICE VIEW</span>
          <h1>Office monitor</h1>
        </div>
        <div className={`om-connection ${connected ? "is-live" : "is-disconnected"}`} data-testid="status-monitor-connection">
          <span className="om-connection-dot" />
          {connected ? "Live" : hasConnected ? "Reconnecting" : "Connecting"}
        </div>
      </header>

      <section className="om-workspace" aria-label="Organization office activity">
        <div className="om-camera-column">
          <div className="om-camera-topline">
            <div><span className="om-kicker">FIXED CAMERA</span><span className="om-camera-caption">{cameraFloor == null ? "Office floor" : `Floor ${cameraFloor} · ${cameraPeople.length} present`}</span></div>
            <div className="om-observed"><span>OBSERVED</span><time>{timeLabel(snapshot?.observedAt ?? null)}</time></div>
          </div>
          {loading ? (
            <div className="om-floor om-floor-loading" aria-label="Loading office positions"><div className="om-floor-shimmer" /><span>Loading current positions</span></div>
          ) : error ? (
            <div className="om-state-panel" role="alert">
              <div className="om-state-mark">!</div><h2>Monitor unavailable</h2><p>{error}</p>
              <button className="om-button om-primary-button" onClick={() => setRefreshAttempt((value) => value + 1)} data-testid="button-retry-monitor"><RefreshCw size={14} /> Try again</button>
            </div>
          ) : !snapshot?.permissions.canViewPeers ? (
            <div className="om-state-panel"><div className="om-state-mark"><X size={18} /></div><h2>Access not available</h2><p>Your organization does not currently grant access to the coworker office view.</p></div>
          ) : (
            <div className="om-floor" aria-label="Fixed full-office camera map">
              <div className="om-coordinate-label om-coord-nw">0, 0</div>
              <div className="om-coordinate-label om-coord-ne">22,000 / 0</div>
              <div className="om-coordinate-label om-coord-sw">0 / 25,000</div>
              <div className="om-coordinate-label om-coord-se">22,000 / 25,000</div>
              <div className="om-floor-axis om-axis-x" /><div className="om-floor-axis om-axis-y" />
              {cameraPeople.map((person) => {
                const isSelected = selected?.userId === person.userId;
                return (
                  <button
                    key={person.userId}
                    className={`om-person-marker${isSelected ? " is-selected" : ""}`}
                    style={{ left: `${Math.max(0, Math.min(100, person.x / 22000 * 100))}%`, top: `${Math.max(0, Math.min(100, person.y / 25000 * 100))}%` }}
                    onClick={() => setSelectedId(person.userId)}
                    aria-label={`Select ${person.name}`}
                    aria-pressed={isSelected}
                    data-testid={`button-select-person-${person.userId}`}
                  >
                    <span className="om-marker-avatar">
                      {person.avatarUrl ? <img src={person.avatarUrl} alt="" /> : <span>{initials(person.name)}</span>}
                    </span>
                    <span className="om-marker-name">{person.name}</span>
                  </button>
                );
              })}
              {cameraPeople.length === 0 && <div className="om-floor-empty"><Users size={20} /><span>No coworkers are in this office right now.</span></div>}
              <span className="om-camera-stamp">OFFICE · FLOOR {cameraFloor ?? "—"}</span>
            </div>
          )}
          <div className="om-camera-footer">
            <span>Floor coordinates · X 0–22,000 / Y 0–25,000</span>
            <span>Read-only view</span>
          </div>
        </div>

        <aside className="om-side-column">
          <div className="om-roster-heading">
            <div><span className="om-kicker">PRESENT NOW</span><h2>Coworkers <span>{people.length}</span></h2></div>
            <Users size={17} strokeWidth={1.6} />
          </div>
          {loading ? (
            <div className="om-roster-skeleton"><i /><i /><i /></div>
          ) : error ? (
            <div className="om-roster-note">Roster will return when the snapshot reconnects.</div>
          ) : people.length === 0 ? (
            <div className="om-roster-empty">The office is quiet. No visible coworkers are present.</div>
          ) : (
            <div className="om-roster" role="list" aria-label="Coworkers in the office">
              {people.map((person) => (
                <button className={`om-roster-person${selected?.userId === person.userId ? " is-selected" : ""}`} key={person.userId}
                  onClick={() => setSelectedId(person.userId)} role="listitem" data-testid={`button-roster-person-${person.userId}`}>
                  <span className="om-roster-avatar">{person.avatarUrl ? <img src={person.avatarUrl} alt="" /> : initials(person.name)}</span>
                  <span className="om-roster-copy"><strong>{person.name}</strong><small>{person.role}</small></span>
                  <ArrowUpRight size={14} className="om-roster-arrow" />
                </button>
              ))}
            </div>
          )}

          <div className="om-person-detail">
            <div className="om-detail-label"><span>SELECTED COWORKER</span><span>{selected ? `${selectedIndex + 1} / ${people.length}` : "—"}</span></div>
            {selected ? (
              <>
                <div className="om-selected-person">
                  <span className="om-selected-avatar">{selected.avatarUrl ? <img src={selected.avatarUrl} alt="" /> : initials(selected.name)}</span>
                  <div><h3>{selected.name}</h3><p>{selected.role}</p></div>
                </div>
                <dl className="om-facts">
                  <div><dt>Floor</dt><dd>{selected.floorNumber}</dd></div>
                  <div><dt>Room</dt><dd>{selected.roomKey}</dd></div>
                  <div><dt>Position</dt><dd>{Math.round(selected.x).toLocaleString()} / {Math.round(selected.y).toLocaleString()}</dd></div>
                  <div><dt>Action</dt><dd>{selected.action || "—"}</dd></div>
                  <div><dt>Last seen</dt><dd>{timeLabel(selected.lastSeenAt)}</dd></div>
                </dl>
                <div className="om-rotate-controls">
                  <button onClick={() => rotate(-1)} aria-label="Previous coworker" disabled={people.length < 2} data-testid="button-previous-coworker"><ArrowLeft size={15} /> Previous</button>
                  <button onClick={() => rotate(1)} aria-label="Next coworker" disabled={people.length < 2} data-testid="button-next-coworker">Next <ArrowRight size={15} /></button>
                </div>
              </>
            ) : <div className="om-select-prompt">Select a coworker on the floor map or roster to inspect their current position.</div>}
          </div>

          <div className="om-sync-note">
            <Circle size={7} fill="currentColor" />
            <span>{connected ? "Position updates are streaming." : hasConnected ? "Live connection is interrupted. Reconnecting and refreshing the snapshot." : "Connecting to the live office feed."}</span>
          </div>
        </aside>
      </section>
      <footer className="om-footer"><span>Organization activity mirror</span><span>Only people returned by your organization’s access policy are shown.</span></footer>
    </main>
  );
}
