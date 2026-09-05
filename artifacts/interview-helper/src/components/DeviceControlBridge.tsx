import { useEffect } from "react";
import { useLocation } from "wouter";

const LINK_KEY = "salaryman_desktop_link";

type StoredLink = { linkId?: string; id?: string; deviceId?: string };

function wsUrl(linkId: string, deviceId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${protocol}//${window.location.host}${base}/ws/device-control/${encodeURIComponent(linkId)}?role=desktop&deviceId=${encodeURIComponent(deviceId)}`;
}

/**
 * Receives the allowlisted controls from the already-approved phone. This is
 * intentionally an app bridge: it can navigate or reload SALARYMAN, but it
 * cannot execute shell commands or read arbitrary local paths.
 */
export function DeviceControlBridge() {
  const [, navigate] = useLocation();

  useEffect(() => {
    let socket: WebSocket | null = null;
    let stopped = false;
    let reconnectTimer: number | undefined;
    let attempt = 0;
    const raw = window.localStorage.getItem(LINK_KEY);
    if (!raw) return;

    let link: StoredLink;
    try { link = JSON.parse(raw) as StoredLink; } catch { return; }
    const linkId = link.linkId ?? link.id;
    const deviceId = link.deviceId;
    if (!linkId || !deviceId) return;

    const connect = () => {
      if (stopped) return;
      socket = new WebSocket(wsUrl(linkId, deviceId));
      const activeSocket = socket;
      activeSocket.addEventListener("open", () => {
        attempt = 0;
        activeSocket.send(JSON.stringify({ type: "desktop_status", state: "ready" }));
      });
      activeSocket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return;
        let message: Record<string, unknown>;
        try { message = JSON.parse(event.data) as Record<string, unknown>; } catch { return; }
        if (message.type !== "control") return;
        if (message.action === "reload") {
          window.location.reload();
        } else if (message.action === "navigate" && typeof message.path === "string") {
          navigate(message.path);
        }
      });
      activeSocket.addEventListener("close", () => {
        if (socket === activeSocket) socket = null;
        if (stopped) return;
        const delay = Math.min(15000, 1000 * 2 ** Math.min(attempt++, 4));
        reconnectTimer = window.setTimeout(connect, delay);
      });
    };
    connect();

    return () => {
      stopped = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      socket?.close();
      socket = null;
    };
  }, [navigate]);

  return null;
}