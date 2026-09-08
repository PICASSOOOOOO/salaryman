import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";

const API = import.meta.env.VITE_API_URL || `${window.location.origin}/api`;

type Tab = "recordings" | "inbox" | "sent" | "screenshot" | "screen-record" | "monitoring";

interface CallRecord {
  id: number;
  callerName: string | null;
  recipientNumber: string;
  direction: string;
  durationSeconds: number | null;
  recordingUrl: string | null;
  startedAt: string;
  status: string;
  callType: string;
  transcript?: string;
  summary?: string;
}

interface SharedItem {
  id: number;
  fromUserId: string;
  fromUserName?: string;
  mediaType: string;
  title: string;
  description?: string;
  sourceUrl?: string;
  isRead: boolean;
  createdAt: string;
  callHistoryId?: number;
}

interface OrgMember {
  userId: string;
  name: string;
  role: string;
}

interface ScreenSession {
  id: number;
  userId: string;
  userName?: string;
  status: string;
  startedAt: string;
  endedAt?: string;
  screenshotCount: number;
  lastScreenshotUrl?: string;
  lastScreenshotAt?: string;
  recordingUrl?: string;
  durationSeconds?: number;
}

async function mediaApi(path: string, opts?: RequestInit) {
  const res = await apiFetch(`${API}${path}`, { credentials: "include", ...opts });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function MediaCenter() {
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>("recordings");
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [inbox, setInbox] = useState<SharedItem[]>([]);
  const [sent, setSent] = useState<SharedItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [monitoring, setMonitoring] = useState<{ active: ScreenSession[]; recent: ScreenSession[] }>({ active: [], recent: [] });
  const [loading, setLoading] = useState(false);

  const [shareTarget, setShareTarget] = useState<{ callId: number; title: string } | null>(null);
  const [shareToUser, setShareToUser] = useState("");
  const [shareDesc, setShareDesc] = useState("");

  const [screenRecording, setScreenRecording] = useState(false);
  const [screenSessionId, setScreenSessionId] = useState<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const mp = useMusicPlayer();

  const sendCallToHummingBird = async (callId: number, label: string) => {
    setDownloadingId(callId);
    try {
      const res = await apiFetch(`${API}/media/recording/download/${callId}?format=mp3`, { credentials: "include" });
      if (!res.ok) throw new Error('fetch ' + res.status);
      const blob = await res.blob();
      const safe = (label || `call-${callId}`).replace(/[^\w\-. ]+/g, '_').slice(0, 60);
      const file = new File([blob], `${safe}-call-${callId}.mp3`, { type: 'audio/mpeg' });
      await mp.uploadFiles([file]);
      await mp.refresh();
      alert('Sent to Humming Bird');
    } catch (e: any) {
      alert('Send failed: ' + (e?.message || 'unknown'));
    }
    setDownloadingId(null);
  };

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    try {
      const data = await mediaApi("/twilio/history?limit=100");
      setCalls((data.calls || data).filter((c: CallRecord) => c.recordingUrl));
    } catch {}
    setLoading(false);
  }, []);

  const fetchInbox = useCallback(async () => {
    try {
      const data = await mediaApi("/media/inbox");
      setInbox(data.items || []);
      setUnread(data.unread || 0);
    } catch {}
  }, []);

  const fetchSent = useCallback(async () => {
    try {
      const data = await mediaApi("/media/sent");
      setSent(data.items || []);
    } catch {}
  }, []);

  const fetchMembers = useCallback(async () => {
    try {
      const data = await mediaApi("/media/org-members");
      setMembers(data.members || []);
    } catch {}
  }, []);

  const fetchMonitoring = useCallback(async () => {
    try {
      const data = await mediaApi("/media/screen-monitoring");
      setMonitoring({ active: data.activeSessions || [], recent: data.recentSessions || [] });
    } catch {}
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchCalls();
    fetchInbox();
    fetchMembers();
  }, [isAuthenticated]);

  useEffect(() => {
    if (tab === "sent") fetchSent();
    if (tab === "monitoring") fetchMonitoring();
  }, [tab]);

  const handleDownload = async (callId: number, format: string) => {
    setDownloadingId(callId);
    try {
      const res = await apiFetch(`${API}/media/recording/download/${callId}?format=${format}`, { credentials: "include" });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `call-${callId}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Download failed. Recording may not be available yet.");
    }
    setDownloadingId(null);
  };

  const handleShare = async () => {
    if (!shareTarget || !shareToUser) return;
    try {
      await mediaApi("/media/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toUserId: shareToUser,
          mediaType: "recording",
          title: shareTarget.title,
          description: shareDesc || undefined,
          callHistoryId: shareTarget.callId,
        }),
      });
      setShareTarget(null);
      setShareDesc("");
      setShareToUser("");
      alert("Shared successfully!");
    } catch {
      alert("Failed to share");
    }
  };

  const handleShareMedia = async (mediaType: string, title: string, sourceUrl: string) => {
    if (!shareToUser) return;
    try {
      await mediaApi("/media/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId: shareToUser, mediaType, title, sourceUrl, description: shareDesc || undefined }),
      });
      alert("Shared successfully!");
      setShareToUser("");
      setShareDesc("");
    } catch {
      alert("Failed to share");
    }
  };

  const handleMarkRead = async (id: number) => {
    try {
      await mediaApi(`/media/inbox/${id}/read`, { method: "POST" });
      setInbox((prev) => prev.map((i) => (i.id === id ? { ...i, isRead: true } : i)));
      setUnread((p) => Math.max(0, p - 1));
    } catch {}
  };

  const captureScreenshot = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      const imageCapture = new (window as any).ImageCapture(track);
      const bitmap = await imageCapture.grabFrame();
      track.stop();

      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      const dataUrl = canvas.toDataURL("image/png");
      setScreenshotUrl(dataUrl);
    } catch (err: any) {
      if (err.name !== "NotAllowedError") {
        alert("Screenshot capture failed. Your browser may not support this feature.");
      }
    }
  };

  const downloadScreenshot = () => {
    if (!screenshotUrl) return;
    const a = document.createElement("a");
    a.href = screenshotUrl;
    a.download = `screenshot-${Date.now()}.png`;
    a.click();
  };

  const startScreenRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      setRecordedUrl(null);
      setRecordingTime(0);

      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        setRecordedUrl(URL.createObjectURL(blob));
        setScreenRecording(false);
        if (timerRef.current) clearInterval(timerRef.current);
        streamRef.current?.getTracks().forEach((t) => t.stop());
      };

      stream.getVideoTracks()[0].onended = () => {
        recorder.stop();
      };

      recorder.start(1000);
      setScreenRecording(true);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);

      try {
        const data = await mediaApi("/media/screen-session/start", { method: "POST" });
        setScreenSessionId(data.sessionId);
      } catch {}
    } catch (err: any) {
      if (err.name !== "NotAllowedError") {
        alert("Screen recording failed. Your browser may not support this feature.");
      }
    }
  };

  const stopScreenRecording = async () => {
    mediaRecorderRef.current?.stop();
    if (screenSessionId) {
      try {
        await mediaApi(`/media/screen-session/${screenSessionId}/stop`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ durationSeconds: recordingTime }),
        });
      } catch {}
    }
    setScreenSessionId(null);
  };

  const downloadRecording = () => {
    if (!recordedUrl) return;
    const a = document.createElement("a");
    a.href = recordedUrl;
    a.download = `screen-recording-${Date.now()}.webm`;
    a.click();
  };

  if (!isAuthenticated) {
    return (
      <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#00ff41", fontFamily: "var(--font-sans)" }}>
        <p>Login required</p>
      </div>
    );
  }

  const tabStyle = (t: Tab) => ({
    padding: "10px 18px",
    cursor: "pointer" as const,
    background: tab === t ? "rgba(0,255,65,0.15)" : "transparent",
    color: tab === t ? "#00ff41" : "rgba(0,255,65,0.5)",
    border: tab === t ? "1px solid rgba(0,255,65,0.4)" : "1px solid transparent",
    fontFamily: "var(--font-sans)",
    fontSize: "0.85rem",
    letterSpacing: "0.05em",
    position: "relative" as const,
  });

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", color: "#00ff41", fontFamily: "var(--font-sans)", padding: "20px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <h1 style={{ fontSize: "1.6rem", letterSpacing: "0.15em", marginBottom: 8, borderBottom: "1px solid rgba(0,255,65,0.2)", paddingBottom: 12 }}>
          MEDIA CENTER
        </h1>
        <p style={{ color: "rgba(0,255,65,0.4)", fontSize: "0.8rem", marginBottom: 20 }}>
          Recordings / Downloads / Screenshots / Screen Recording / Sharing / Monitoring
        </p>

        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 20, borderBottom: "1px solid rgba(0,255,65,0.15)", paddingBottom: 4 }}>
          <div style={tabStyle("recordings")} onClick={() => setTab("recordings")}>RECORDINGS</div>
          <div style={tabStyle("inbox")} onClick={() => setTab("inbox")}>
            INBOX {unread > 0 && <span style={{ background: "#00ff41", color: "#000", borderRadius: "50%", padding: "1px 6px", fontSize: "0.7rem", marginLeft: 4 }}>{unread}</span>}
          </div>
          <div style={tabStyle("sent")} onClick={() => setTab("sent")}>SENT</div>
          <div style={tabStyle("screenshot")} onClick={() => setTab("screenshot")}>SCREENSHOT</div>
          <div style={tabStyle("screen-record")} onClick={() => setTab("screen-record")}>SCREEN RECORD</div>
          <div style={tabStyle("monitoring")} onClick={() => setTab("monitoring")}>MONITORING</div>
        </div>

        {tab === "recordings" && (
          <div>
            <h2 style={{ fontSize: "1.1rem", letterSpacing: "0.1em", marginBottom: 16 }}>CALL RECORDINGS</h2>
            {loading && <p style={{ color: "rgba(0,255,65,0.5)" }}>Loading...</p>}
            {!loading && calls.length === 0 && <p style={{ color: "rgba(0,255,65,0.4)" }}>No recorded calls yet. Recordings are automatically saved for all calls.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {calls.map((call) => (
                <div key={call.id} style={{ border: "1px solid rgba(0,255,65,0.2)", padding: 16, background: "rgba(0,255,65,0.03)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <span style={{ color: call.direction === "inbound" ? "#4af" : "#00ff41", fontSize: "0.75rem" }}>{call.direction.toUpperCase()}</span>
                      <span style={{ marginLeft: 10 }}>{call.callerName || call.recipientNumber}</span>
                      <span style={{ color: "rgba(0,255,65,0.4)", marginLeft: 10, fontSize: "0.8rem" }}>{formatDate(call.startedAt)}</span>
                      <span style={{ color: "rgba(0,255,65,0.4)", marginLeft: 10, fontSize: "0.8rem" }}>{formatDuration(call.durationSeconds)}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {["mp3", "wav", "ogg"].map((fmt) => (
                        <button
                          key={fmt}
                          onClick={() => handleDownload(call.id, fmt)}
                          disabled={downloadingId === call.id}
                          style={{
                            background: "transparent",
                            border: "1px solid rgba(0,255,65,0.3)",
                            color: "#00ff41",
                            padding: "4px 12px",
                            cursor: "pointer",
                            fontFamily: "var(--font-sans)",
                            fontSize: "0.75rem",
                            opacity: downloadingId === call.id ? 0.5 : 1,
                          }}
                        >
                          {fmt.toUpperCase()}
                        </button>
                      ))}
                      <button
                        onClick={() => sendCallToHummingBird(call.id, call.callerName || call.recipientNumber)}
                        disabled={downloadingId === call.id}
                        title="Save recording to Humming Bird"
                        style={{
                          background: "transparent",
                          border: "1px solid rgba(168,85,247,0.5)",
                          color: "#a855f7",
                          padding: "4px 12px",
                          cursor: "pointer",
                          fontFamily: "var(--font-sans)",
                          fontSize: "0.75rem",
                          opacity: downloadingId === call.id ? 0.5 : 1,
                        }}
                      >
                        → HB
                      </button>
                      <button
                        onClick={() => {
                          setShareTarget({ callId: call.id, title: `Call: ${call.callerName || call.recipientNumber} (${formatDate(call.startedAt)})` });
                        }}
                        style={{
                          background: "transparent",
                          border: "1px solid rgba(0,150,255,0.4)",
                          color: "#4af",
                          padding: "4px 12px",
                          cursor: "pointer",
                          fontFamily: "var(--font-sans)",
                          fontSize: "0.75rem",
                        }}
                      >
                        SHARE
                      </button>
                    </div>
                  </div>
                  {call.summary && (
                    <p style={{ color: "rgba(0,255,65,0.5)", fontSize: "0.8rem", marginTop: 8 }}>{call.summary}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "inbox" && (
          <div>
            <h2 style={{ fontSize: "1.1rem", letterSpacing: "0.1em", marginBottom: 16 }}>SHARED WITH YOU</h2>
            {inbox.length === 0 && <p style={{ color: "rgba(0,255,65,0.4)" }}>No shared media yet.</p>}
            {inbox.map((item) => (
              <div
                key={item.id}
                style={{
                  border: `1px solid ${item.isRead ? "rgba(0,255,65,0.15)" : "rgba(0,255,65,0.4)"}`,
                  padding: 14,
                  marginBottom: 8,
                  background: item.isRead ? "transparent" : "rgba(0,255,65,0.05)",
                  cursor: "pointer",
                }}
                onClick={() => !item.isRead && handleMarkRead(item.id)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    {!item.isRead && <span style={{ color: "#00ff41", marginRight: 8, fontSize: "0.7rem" }}>NEW</span>}
                    <span style={{ fontSize: "0.75rem", color: "rgba(0,255,65,0.5)", textTransform: "uppercase" }}>{item.mediaType}</span>
                    <span style={{ marginLeft: 10 }}>{item.title}</span>
                  </div>
                  <div style={{ color: "rgba(0,255,65,0.4)", fontSize: "0.75rem" }}>
                    From: {item.fromUserName || item.fromUserId} | {formatDate(item.createdAt)}
                  </div>
                </div>
                {item.description && <p style={{ color: "rgba(0,255,65,0.4)", fontSize: "0.8rem", marginTop: 6 }}>{item.description}</p>}
                {item.sourceUrl && (
                  <a href={item.sourceUrl} target="_blank" rel="noopener" style={{ color: "#4af", fontSize: "0.8rem" }}>View Source</a>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "sent" && (
          <div>
            <h2 style={{ fontSize: "1.1rem", letterSpacing: "0.1em", marginBottom: 16 }}>SENT MEDIA</h2>
            {sent.length === 0 && <p style={{ color: "rgba(0,255,65,0.4)" }}>Nothing sent yet.</p>}
            {sent.map((item) => (
              <div key={item.id} style={{ border: "1px solid rgba(0,255,65,0.15)", padding: 14, marginBottom: 8 }}>
                <span style={{ fontSize: "0.75rem", color: "rgba(0,255,65,0.5)", textTransform: "uppercase" }}>{item.mediaType}</span>
                <span style={{ marginLeft: 10 }}>{item.title}</span>
                <span style={{ color: "rgba(0,255,65,0.4)", marginLeft: 10, fontSize: "0.75rem" }}>{formatDate(item.createdAt)}</span>
              </div>
            ))}
          </div>
        )}

        {tab === "screenshot" && (
          <div>
            <h2 style={{ fontSize: "1.1rem", letterSpacing: "0.1em", marginBottom: 16 }}>SCREENSHOT CAPTURE</h2>
            <p style={{ color: "rgba(0,255,65,0.5)", fontSize: "0.85rem", marginBottom: 16 }}>
              Capture a screenshot of any screen, window, or tab. You can download it or share it with team members.
            </p>
            <button
              onClick={captureScreenshot}
              style={{
                background: "rgba(0,255,65,0.1)",
                border: "1px solid rgba(0,255,65,0.4)",
                color: "#00ff41",
                padding: "12px 24px",
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
                fontSize: "0.9rem",
                letterSpacing: "0.1em",
              }}
            >
              CAPTURE SCREENSHOT
            </button>

            {screenshotUrl && (
              <div style={{ marginTop: 20 }}>
                <img src={screenshotUrl} alt="Screenshot" style={{ maxWidth: "100%", maxHeight: 500, border: "1px solid rgba(0,255,65,0.3)" }} />
                <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={downloadScreenshot} style={{ background: "transparent", border: "1px solid rgba(0,255,65,0.3)", color: "#00ff41", padding: "8px 16px", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "0.8rem" }}>
                    DOWNLOAD PNG
                  </button>
                  <select
                    value={shareToUser}
                    onChange={(e) => setShareToUser(e.target.value)}
                    style={{ background: "#111", border: "1px solid rgba(0,255,65,0.3)", color: "#00ff41", padding: "8px", fontFamily: "var(--font-sans)", fontSize: "0.8rem" }}
                  >
                    <option value="">Share to...</option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>{m.name} ({m.role})</option>
                    ))}
                  </select>
                  {shareToUser && (
                    <button
                      onClick={() => handleShareMedia("screenshot", `Screenshot ${new Date().toLocaleString()}`, screenshotUrl)}
                      style={{ background: "transparent", border: "1px solid rgba(0,150,255,0.4)", color: "#4af", padding: "8px 16px", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "0.8rem" }}
                    >
                      SEND
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "screen-record" && (
          <div>
            <h2 style={{ fontSize: "1.1rem", letterSpacing: "0.1em", marginBottom: 16 }}>SCREEN RECORDING</h2>
            <p style={{ color: "rgba(0,255,65,0.5)", fontSize: "0.85rem", marginBottom: 16 }}>
              Record your screen, window, or tab with audio. Download as WebM video or share with team members.
            </p>

            {!screenRecording ? (
              <button
                onClick={startScreenRecording}
                style={{
                  background: "rgba(255,50,50,0.1)",
                  border: "1px solid rgba(255,50,50,0.4)",
                  color: "#ff3232",
                  padding: "12px 24px",
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                  fontSize: "0.9rem",
                  letterSpacing: "0.1em",
                }}
              >
                START RECORDING
              </button>
            ) : (
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff3232", animation: "pulse 1s infinite" }} />
                <span style={{ color: "#ff3232", fontSize: "1.1rem" }}>RECORDING {formatDuration(recordingTime)}</span>
                <button
                  onClick={stopScreenRecording}
                  style={{
                    background: "rgba(255,50,50,0.15)",
                    border: "1px solid rgba(255,50,50,0.5)",
                    color: "#ff3232",
                    padding: "8px 20px",
                    cursor: "pointer",
                    fontFamily: "var(--font-sans)",
                    fontSize: "0.85rem",
                  }}
                >
                  STOP
                </button>
              </div>
            )}

            {recordedUrl && (
              <div style={{ marginTop: 20 }}>
                <video src={recordedUrl} controls style={{ maxWidth: "100%", maxHeight: 500, border: "1px solid rgba(0,255,65,0.3)" }} />
                <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={downloadRecording} style={{ background: "transparent", border: "1px solid rgba(0,255,65,0.3)", color: "#00ff41", padding: "8px 16px", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "0.8rem" }}>
                    DOWNLOAD WEBM
                  </button>
                  <select
                    value={shareToUser}
                    onChange={(e) => setShareToUser(e.target.value)}
                    style={{ background: "#111", border: "1px solid rgba(0,255,65,0.3)", color: "#00ff41", padding: "8px", fontFamily: "var(--font-sans)", fontSize: "0.8rem" }}
                  >
                    <option value="">Share to...</option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>{m.name} ({m.role})</option>
                    ))}
                  </select>
                  {shareToUser && (
                    <button
                      onClick={() => handleShareMedia("screen_recording", `Screen Recording ${new Date().toLocaleString()}`, recordedUrl)}
                      style={{ background: "transparent", border: "1px solid rgba(0,150,255,0.4)", color: "#4af", padding: "8px 16px", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "0.8rem" }}
                    >
                      SEND
                    </button>
                  )}
                </div>
              </div>
            )}

            <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
          </div>
        )}

        {tab === "monitoring" && (
          <div>
            <h2 style={{ fontSize: "1.1rem", letterSpacing: "0.1em", marginBottom: 16 }}>EMPLOYEE SCREEN MONITORING</h2>
            <p style={{ color: "rgba(0,255,65,0.5)", fontSize: "0.85rem", marginBottom: 20 }}>
              View active screen sessions and recent activity for your organization's employees. Manager+ access required.
            </p>

            <h3 style={{ fontSize: "0.95rem", color: "#00ff41", marginBottom: 12, borderBottom: "1px solid rgba(0,255,65,0.15)", paddingBottom: 6 }}>
              ACTIVE SESSIONS ({monitoring.active.length})
            </h3>
            {monitoring.active.length === 0 && <p style={{ color: "rgba(0,255,65,0.3)", fontSize: "0.8rem", marginBottom: 20 }}>No active screen sessions.</p>}
            {monitoring.active.map((s) => (
              <div key={s.id} style={{ border: "1px solid rgba(0,255,65,0.3)", padding: 14, marginBottom: 8, background: "rgba(0,255,65,0.05)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <span style={{ color: "#00ff41" }}>{s.userName || s.userId}</span>
                    <span style={{ color: "rgba(0,255,65,0.4)", marginLeft: 10, fontSize: "0.8rem" }}>Started: {formatDate(s.startedAt)}</span>
                    <span style={{ color: "rgba(0,255,65,0.4)", marginLeft: 10, fontSize: "0.8rem" }}>Screenshots: {s.screenshotCount}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00ff41", animation: "pulse 2s infinite" }} />
                    <span style={{ color: "#00ff41", fontSize: "0.75rem" }}>LIVE</span>
                  </div>
                </div>
                {s.lastScreenshotUrl && (
                  <div style={{ marginTop: 10 }}>
                    <p style={{ color: "rgba(0,255,65,0.4)", fontSize: "0.7rem", marginBottom: 4 }}>Last screenshot: {s.lastScreenshotAt ? formatDate(s.lastScreenshotAt) : "N/A"}</p>
                    <img src={s.lastScreenshotUrl} alt="Last screenshot" style={{ maxWidth: 400, maxHeight: 250, border: "1px solid rgba(0,255,65,0.2)" }} />
                  </div>
                )}
              </div>
            ))}

            <h3 style={{ fontSize: "0.95rem", color: "#00ff41", marginTop: 24, marginBottom: 12, borderBottom: "1px solid rgba(0,255,65,0.15)", paddingBottom: 6 }}>
              RECENT SESSIONS
            </h3>
            {monitoring.recent.length === 0 && <p style={{ color: "rgba(0,255,65,0.3)", fontSize: "0.8rem" }}>No recent sessions.</p>}
            <div style={{ display: "grid", gap: 8 }}>
              {monitoring.recent.map((s) => (
                <div key={s.id} style={{ border: "1px solid rgba(0,255,65,0.15)", padding: 12, fontSize: "0.85rem" }}>
                  <span>{s.userName || s.userId}</span>
                  <span style={{ color: s.status === "active" ? "#00ff41" : "rgba(0,255,65,0.4)", marginLeft: 10, fontSize: "0.75rem" }}>{s.status.toUpperCase()}</span>
                  <span style={{ color: "rgba(0,255,65,0.4)", marginLeft: 10, fontSize: "0.8rem" }}>{formatDate(s.startedAt)}</span>
                  <span style={{ color: "rgba(0,255,65,0.4)", marginLeft: 10, fontSize: "0.8rem" }}>{s.durationSeconds ? formatDuration(s.durationSeconds) : ""}</span>
                  <span style={{ color: "rgba(0,255,65,0.4)", marginLeft: 10, fontSize: "0.8rem" }}>{s.screenshotCount} screenshots</span>
                  {s.recordingUrl && (
                    <a href={s.recordingUrl} target="_blank" rel="noopener" style={{ color: "#4af", marginLeft: 10, fontSize: "0.75rem" }}>View Recording</a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {shareTarget && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
            <div style={{ background: "#111", border: "1px solid rgba(0,255,65,0.3)", padding: 24, maxWidth: 440, width: "90%" }}>
              <h3 style={{ color: "#00ff41", marginBottom: 16, fontSize: "1rem" }}>SHARE RECORDING</h3>
              <p style={{ color: "rgba(0,255,65,0.5)", fontSize: "0.85rem", marginBottom: 12 }}>{shareTarget.title}</p>
              <select
                value={shareToUser}
                onChange={(e) => setShareToUser(e.target.value)}
                style={{ width: "100%", background: "#0a0a0a", border: "1px solid rgba(0,255,65,0.3)", color: "#00ff41", padding: 10, fontFamily: "var(--font-sans)", fontSize: "0.85rem", marginBottom: 10 }}
              >
                <option value="">Select team member...</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.name} ({m.role})</option>
                ))}
              </select>
              <textarea
                value={shareDesc}
                onChange={(e) => setShareDesc(e.target.value)}
                placeholder="Add a note (optional)..."
                rows={3}
                style={{ width: "100%", background: "#0a0a0a", border: "1px solid rgba(0,255,65,0.3)", color: "#00ff41", padding: 10, fontFamily: "var(--font-sans)", fontSize: "0.85rem", resize: "vertical", marginBottom: 12 }}
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  onClick={() => { setShareTarget(null); setShareDesc(""); setShareToUser(""); }}
                  style={{ background: "transparent", border: "1px solid rgba(0,255,65,0.2)", color: "rgba(0,255,65,0.5)", padding: "8px 16px", cursor: "pointer", fontFamily: "var(--font-sans)" }}
                >
                  CANCEL
                </button>
                <button
                  onClick={handleShare}
                  disabled={!shareToUser}
                  style={{ background: shareToUser ? "rgba(0,255,65,0.1)" : "transparent", border: "1px solid rgba(0,255,65,0.4)", color: "#00ff41", padding: "8px 16px", cursor: shareToUser ? "pointer" : "not-allowed", fontFamily: "var(--font-sans)", opacity: shareToUser ? 1 : 0.4 }}
                >
                  SEND
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
