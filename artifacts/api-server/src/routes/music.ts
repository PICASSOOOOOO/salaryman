import { Router, type Request, type Response, type NextFunction } from "express";
import { Readable } from "stream";
import { eq, and, asc, sql } from "drizzle-orm";
import { db, musicTracksTable, type MusicTrack } from "@workspace/db";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router = Router();
const storage = new ObjectStorageService();

const MAX_TRACKS_PER_USER = 50;
const MAX_TOTAL_BYTES_PER_USER = 500 * 1024 * 1024; // 500 MB cap per user

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  next();
}

// GET /api/music/tracks — list this user's tracks
router.get("/music/tracks", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = String(req.user!.id);
    const rows = await db
      .select()
      .from(musicTracksTable)
      .where(eq(musicTracksTable.userId, userId))
      .orderBy(asc(musicTracksTable.position), asc(musicTracksTable.id));
    res.json({ tracks: rows });
  } catch (e) {
    console.error("[music] list error", e);
    res.status(500).json({ error: "Failed to list tracks" });
  }
});

// POST /api/music/tracks — record metadata after the file has been PUT to GCS
router.post("/music/tracks", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = String(req.user!.id);
    const {
      title, artist, album, mimeType, sizeBytes, durationSec, objectPath, source,
    } = req.body ?? {};

    if (!objectPath || typeof objectPath !== "string" || !objectPath.startsWith("/objects/")) {
      res.status(400).json({ error: "objectPath required (from upload response)" });
      return;
    }
    if (!title || typeof title !== "string") {
      res.status(400).json({ error: "title required" });
      return;
    }
    if (!mimeType || typeof mimeType !== "string") {
      res.status(400).json({ error: "mimeType required" });
      return;
    }

    // Enforce per-user limits
    const [counts] = await db
      .select({
        n: sql<number>`COUNT(*)::int`,
        bytes: sql<number>`COALESCE(SUM(${musicTracksTable.sizeBytes}),0)::int`,
      })
      .from(musicTracksTable)
      .where(eq(musicTracksTable.userId, userId));

    if ((counts?.n ?? 0) >= MAX_TRACKS_PER_USER) {
      res.status(413).json({ error: `Playlist limit reached (${MAX_TRACKS_PER_USER} tracks).` });
      return;
    }
    const incomingBytes = Number(sizeBytes) || 0;
    if ((counts?.bytes ?? 0) + incomingBytes > MAX_TOTAL_BYTES_PER_USER) {
      res.status(413).json({ error: "Personal music storage cap reached (500 MB)." });
      return;
    }

    const normalizedPath = storage.normalizeObjectEntityPath(objectPath);
    const [row] = await db
      .insert(musicTracksTable)
      .values({
        userId,
        title: String(title).slice(0, 256),
        artist: String(artist || "Unknown Artist").slice(0, 256),
        album: album ? String(album).slice(0, 256) : null,
        mimeType: String(mimeType).slice(0, 128),
        sizeBytes: incomingBytes,
        durationSec: Math.max(0, Math.floor(Number(durationSec) || 0)),
        objectPath: normalizedPath,
        source: ["upload", "spotify", "apple"].includes(String(source)) ? String(source) : "upload",
        position: (counts?.n ?? 0),
      })
      .returning();

    res.json({ track: row });
  } catch (e) {
    console.error("[music] create error", e);
    res.status(500).json({ error: "Failed to save track" });
  }
});

// DELETE /api/music/tracks/:id
router.delete("/music/tracks/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = String(req.user!.id);
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
    const [row] = await db
      .delete(musicTracksTable)
      .where(and(eq(musicTracksTable.id, id), eq(musicTracksTable.userId, userId)))
      .returning();
    if (!row) { res.status(404).json({ error: "not found" }); return; }
    res.json({ ok: true });
  } catch (e) {
    console.error("[music] delete error", e);
    res.status(500).json({ error: "Failed to delete track" });
  }
});

// GET /api/music/stream/:id — proxy stream from object storage with auth + range support
router.get("/music/stream/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = String(req.user!.id);
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) { res.status(400).end(); return; }

    const [row] = await db
      .select()
      .from(musicTracksTable)
      .where(and(eq(musicTracksTable.id, id), eq(musicTracksTable.userId, userId)));
    if (!row) { res.status(404).json({ error: "not found" }); return; }

    const file = await storage.getObjectEntityFile(row.objectPath);
    const range = req.headers.range;

    if (range) {
      const [meta] = await file.getMetadata();
      const total = Number(meta.size) || 0;
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const start = m ? parseInt(m[1], 10) : 0;
      const end = m && m[2] ? parseInt(m[2], 10) : total - 1;
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Length", String(end - start + 1));
      res.setHeader("Content-Type", row.mimeType || "audio/mpeg");
      res.setHeader("Cache-Control", "private, max-age=3600");
      file.createReadStream({ start, end }).pipe(res);
      return;
    }

    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", row.mimeType || "audio/mpeg");
    res.setHeader("Cache-Control", "private, max-age=3600");
    file.createReadStream().pipe(res);
  } catch (e) {
    if (e instanceof ObjectNotFoundError) { res.status(404).end(); return; }
    console.error("[music] stream error", e);
    res.status(500).end();
  }
});

// POST /api/music/import-url — fetch a remote audio URL server-side, upload to
// object storage, and create a track row. This is what backs cross-site
// drag-drop on the Hummingbird player: when a user drags an audio link or
// <audio> element from another website, the browser hands us a URL string —
// the page POSTs it here, we proxy the fetch (CORS-safe), validate that the
// payload is actually audio, and persist it. We hard-cap downloads to 50 MB
// per request and reject anything that doesn't smell like audio.
const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
router.post("/music/import-url", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = String(req.user!.id);
    const url = String(req.body?.url || "").trim();
    const titleHint = String(req.body?.title || "").trim();
    if (!url) { res.status(400).json({ error: "url required" }); return; }
    let parsed: URL;
    try { parsed = new URL(url); } catch { res.status(400).json({ error: "invalid url" }); return; }
    if (!/^https?:$/.test(parsed.protocol)) { res.status(400).json({ error: "only http(s) urls allowed" }); return; }
    // SSRF guard: resolve hostname and reject loopback / private / link-local
    // ranges across IPv4 + IPv6. We then disable redirect-following on the
    // fetch itself so an attacker cannot bounce us into the metadata service.
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
      res.status(400).json({ error: "host not allowed" }); return;
    }
    const { lookup } = await import("node:dns/promises");
    const isPrivateIp = (ip: string): boolean => {
      const v = ip.toLowerCase();
      if (v === "::1" || v === "::" || v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd")) return true;
      // IPv4-mapped IPv6 like ::ffff:127.0.0.1 — strip prefix
      const mapped = v.startsWith("::ffff:") ? v.slice(7) : v;
      const m = mapped.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
      if (!m) return false;
      const [a, b] = [Number(m[1]), Number(m[2])];
      if (a === 10 || a === 127 || a === 0) return true;
      if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
      return false;
    };
    try {
      const addrs = await lookup(host, { all: true });
      if (addrs.some(a => isPrivateIp(a.address))) {
        res.status(400).json({ error: "host resolves to a private network" }); return;
      }
    } catch {
      res.status(400).json({ error: "host could not be resolved" }); return;
    }

    // Per-user limit check (mirror /music/tracks)
    const [counts] = await db
      .select({
        n: sql<number>`COUNT(*)::int`,
        bytes: sql<number>`COALESCE(SUM(${musicTracksTable.sizeBytes}),0)::int`,
      })
      .from(musicTracksTable)
      .where(eq(musicTracksTable.userId, userId));
    if ((counts?.n ?? 0) >= MAX_TRACKS_PER_USER) {
      res.status(413).json({ error: `Playlist limit reached (${MAX_TRACKS_PER_USER} tracks).` }); return;
    }

    const upstream = await fetch(url, {
      // 'manual' so a 3xx redirect to an internal IP cannot bypass the DNS
      // pre-check above. Anything other than a 2xx is treated as failure.
      redirect: "manual",
      headers: { "User-Agent": "Salaryman-Hummingbird/1.0" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!upstream.ok || !upstream.body) {
      res.status(502).json({ error: `upstream ${upstream.status}` }); return;
    }
    const ct = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    // Accept audio/* and video/mp4 (audio extracted by browser); reject html/text.
    const looksAudio = ct.startsWith("audio/") || ct === "video/mp4" || ct === "application/ogg";
    if (!looksAudio) {
      res.status(415).json({ error: `not audio (content-type: ${ct || "unknown"})` }); return;
    }
    const claimedLen = Number(upstream.headers.get("content-length") || 0);
    if (claimedLen > MAX_IMPORT_BYTES) {
      res.status(413).json({ error: "file too large (50 MB max)" }); return;
    }

    // Buffer with hard size cap.
    const reader = (upstream.body as any as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_IMPORT_BYTES) {
        try { await reader.cancel(); } catch {}
        res.status(413).json({ error: "file too large (50 MB max)" }); return;
      }
      chunks.push(value);
    }
    if ((counts?.bytes ?? 0) + total > MAX_TOTAL_BYTES_PER_USER) {
      res.status(413).json({ error: "Personal music storage cap reached (500 MB)." }); return;
    }
    const buf = Buffer.concat(chunks.map(c => Buffer.from(c)));

    // Push to object storage via presigned URL (mirrors the client upload flow).
    const uploadURL = await storage.getObjectEntityUploadURL();
    const objectPath = storage.normalizeObjectEntityPath(uploadURL);
    const put = await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": ct },
      body: buf,
    });
    if (!put.ok) { res.status(502).json({ error: "upload to storage failed" }); return; }

    // Derive a sensible title from URL or hint.
    const fileGuess = decodeURIComponent(parsed.pathname.split("/").pop() || "Imported Track").replace(/\.[^.]+$/, "");
    const title = (titleHint || fileGuess || "Imported Track").slice(0, 256);
    const artist = parsed.hostname.replace(/^www\./, "").slice(0, 256);

    const [row] = await db
      .insert(musicTracksTable)
      .values({
        userId,
        title,
        artist,
        album: null,
        mimeType: ct,
        sizeBytes: total,
        durationSec: 0, // unknown until client probes; OK to leave 0
        objectPath,
        source: "upload",
        position: (counts?.n ?? 0),
      })
      .returning();

    res.json({ track: row });
  } catch (e: any) {
    console.error("[music] import-url error", e);
    res.status(500).json({ error: e?.message || "import failed" });
  }
});

// GET /api/music/connect-status — reports whether Spotify/Apple Music are configured
router.get("/music/connect-status", requireAuth, async (_req: Request, res: Response) => {
  res.json({
    spotify: {
      configured: Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
      message: "Spotify Web Playback SDK requires Premium account + OAuth credentials.",
    },
    apple: {
      configured: Boolean(process.env.APPLE_MUSIC_DEVELOPER_TOKEN),
      message: "Apple Music requires an Apple Developer MusicKit token.",
    },
  });
});

export default router;
