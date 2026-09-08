import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from "@/hooks/use-notifications";
import { useCommsAlerts, useCommsCityDnd, useImmersiveViewActive } from "@/lib/commsAlerts";
import { playNotify } from "@/lib/ui-sound";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

// ── Seen-notification persistence helpers ─────────────────────────────────────
// Keyed by userId so users on the same device never bleed across accounts.

function _seenNotifKey(uid: string) { return `sm_notif_seen_notifs_${uid}`; }

function _loadSeenNotifs(uid: string): Set<number> {
  if (!uid) return new Set();
  try {
    const arr = JSON.parse(localStorage.getItem(_seenNotifKey(uid)) ?? "[]") as number[];
    return new Set(arr);
  } catch { return new Set(); }
}

function _saveSeenNotifs(uid: string, set: Set<number>): void {
  if (!uid) return;
  try {
    localStorage.setItem(_seenNotifKey(uid), JSON.stringify(Array.from(set).slice(-200)));
  } catch { /* storage quota */ }
}

// Global, route-independent toaster for the PERSISTENT notification stream
// (org invites, ticket replies, missed/offline DMs, mentions, admin
// broadcasts). ChatPanel already toasts LIVE chat while its socket is
// connected, but it unmounts on game/full-screen routes — so without this,
// anything that lands while you're in the world/office/game is silent until
// you happen to open the nav badge. This consumes the SAME notifications the
// nav badge counts (no overlap: live DMs only create rows when the recipient
// is disconnected) and pops a coalesced toast + chime the moment a poll first
// sees a fresh unread item — everywhere in the app.
//
// Mount this only while authenticated and OUTSIDE the chat gate.
export function NotificationToaster() {
  const { user } = useAuth();
  const userId: string = (user as any)?.id ?? "";

  const { notifications, loading } = useNotifications();
  const [, navigate] = useLocation();
  const [commsAlertsOn] = useCommsAlerts();
  // "Do Not Disturb while playing": suppress the toast (not the badge) when the
  // user is inside an immersive full-screen view with city DND enabled.
  const [commsCityDndOn] = useCommsCityDnd();
  const immersiveViewActive = useImmersiveViewActive();
  const suppressForCityDnd = commsCityDndOn && immersiveViewActive;

  const seenIdsRef = useRef<Set<number>>(new Set());
  const initRef = useRef(false);
  const toastRef = useRef<ReturnType<typeof toast> | null>(null);
  const toastCountRef = useRef(0);
  const toastTimeRef = useRef(0);

  // Hydrate the seen set from localStorage when user identity resolves so
  // existing notifications never re-toast after a remount/reload.
  useEffect(() => {
    if (!userId) return;
    seenIdsRef.current = _loadSeenNotifs(userId);
    initRef.current = false; // re-baseline for this user
  }, [userId]);

  useEffect(() => {
    const now = Date.now();
    const COALESCE_WINDOW = 5000;
    // Only fresh items toast. Anything older (pre-existing unread on page load /
    // post-login backfill) is silently recorded as seen so it never replays as a
    // toast — the nav badge still counts it. Polls are 30s, so 90s comfortably
    // covers a genuinely-new item's first appearance.
    const RECENT_MS = 90000;
    const candidates: typeof notifications = [];

    let didAdd = false;
    for (const n of notifications) {
      if (seenIdsRef.current.has(n.id)) continue;
      seenIdsRef.current.add(n.id);
      didAdd = true;
      if (!initRef.current) continue; // baseline: record seen, never toast pre-existing
      if (n.read) continue; // already read elsewhere
      if (now - new Date(n.createdAt).getTime() > RECENT_MS) continue; // backfill
      candidates.push(n);
    }
    // Persist any newly-seen IDs so they survive remounts/navigation.
    if (didAdd) _saveSeenNotifs(userId, seenIdsRef.current);

    // Don't baseline until the FIRST authenticated fetch has resolved. The hook
    // starts at { notifications: [], loading: true }, so baselining on the very
    // first (still-loading) pass would treat the first real payload of unread as
    // "new" and replay it as toasts at page-load / login. Wait for loading=false.
    if (loading) return;
    // First settled pass establishes the baseline (everything already present is
    // now seen) so a page load / post-login fetch never replays existing unread.
    if (!initRef.current) {
      initRef.current = true;
      return;
    }
    if (candidates.length === 0) return;
    if (!commsAlertsOn) return; // pop-up alerts disabled in settings
    if (suppressForCityDnd) return; // DND while in city/full-screen view

    const latest = candidates[candidates.length - 1];
    const requestedTarget = latest.link || "/comms";
    const target = requestedTarget === "/comms" || requestedTarget.startsWith("/phone")
      ? "/tower/mezzanine?focus=phone"
      : requestedTarget;
    const action = (
      <ToastAction
        altText="View notification"
        onClick={() => {
          // Tapping VIEW marks all currently-seen IDs as handled.
          _saveSeenNotifs(userId, seenIdsRef.current);
          navigate(target);
        }}
      >
        VIEW
      </ToastAction>
    );

    if (toastRef.current && now - toastTimeRef.current < COALESCE_WINDOW) {
      toastCountRef.current += candidates.length;
      toastRef.current.update({
        id: toastRef.current.id,
        title: "New notifications",
        description: `${toastCountRef.current} new notifications`,
        action,
      });
    } else {
      toastCountRef.current = candidates.length;
      const body = (latest.body ?? "").trim();
      const description =
        candidates.length === 1
          ? (body ? (body.length > 80 ? `${body.slice(0, 80)}…` : body) : latest.title)
          : `${candidates.length} new notifications`;
      toastRef.current = toast({
        title: candidates.length === 1 ? latest.title : "New notifications",
        description,
        duration: 6000,
        action,
      });
      playNotify();
    }
    toastTimeRef.current = now;
  }, [notifications, loading, commsAlertsOn, suppressForCityDnd, navigate, userId]);

  return null;
}
