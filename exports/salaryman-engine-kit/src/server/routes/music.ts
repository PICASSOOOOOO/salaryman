import { Router, type Request, type Response, type NextFunction } from "express";
import { Readable } from "stream";
import { eq, and, asc, sql } from "drizzle-orm";
import { db, musicTracksTable, filesFoldersTable, type MusicTrack } from "@workspace/db";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router = Router();
const storage = new ObjectStorageService();

const MAX_TRACKS_PER_USER = 50;
const MAX_TOTAL_BYTES_PER_USER = 2 * 1024 * 1024 * 1024; // 2 GB cap per user

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

// MusicBrainz / Cover Art Archive auto-tagging (the beets idea, rebuilt native).
// MusicBrainz asks for a descriptive User-Agent and ~1 req/sec; a single
// user-triggered tag is well within that. No API key required.
const MB_UA = "SALARYMAN-Hummingbird/1.0 ( https://salaryman.replit.app )";

function mbEscape(s: string): string {
  // Lucene special chars + quotes — strip to keep the query well-formed.
  return s.replace(/["\\+\-!(){}\[\]^~*?:/]/g, " ").replace(/\s+/g, " ").trim();
}

async function coverArtUrl(releaseMbid: string): Promise<string | null> {
  // Cover Art Archive 302-redirects to the actual image; a 404 means no art.
  // Bounded timeout so a stalled upstream can't pin the request open.
  try {
    const r = await fetch(`https://coverartarchive.org/release/${releaseMbid}/front-500`, {
      method: "GET", redirect: "follow", headers: { "User-Agent": MB_UA },
      signal: AbortSignal.timeout(6000),
    });
    if (r.ok) return `https://coverartarchive.org/release/${releaseMbid}/front-500`;
  } catch { /* timeout / network — treat as no art */ }
  return null;
}

// POST /api/music/tracks/:id/autotag — enrich one track's artist/album/year/art
// from MusicBrainz, matching on its current title (+ artist when known).
router.post("/music/tracks/:id/autotag", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = String(req.user!.id);
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }

    const [track] = await db
      .select()
      .from(musicTracksTable)
      .where(and(eq(musicTracksTable.id, id), eq(musicTracksTable.userId, userId)));
    if (!track) { res.status(404).json({ error: "not found" }); return; }

    const titleQ = mbEscape(track.title);
    if (!titleQ) { res.status(422).json({ error: "Track has no usable title to match." }); return; }
    const artistQ = track.artist && track.artist !== "Unknown Artist" ? mbEscape(track.artist) : "";
    const query = artistQ
      ? `recording:"${titleQ}" AND artist:"${artistQ}"`
      : `recording:"${titleQ}"`;

    const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=5`;
    let mb: any;
    try {
      const mbRes = await fetch(url, {
        headers: { "User-Agent": MB_UA, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!mbRes.ok) { res.status(502).json({ error: "MusicBrainz lookup failed." }); return; }
      mb = await mbRes.json();
    } catch {
      res.status(504).json({ error: "MusicBrainz timed out — try again." });
      return;
    }

    const rec = Array.isArray(mb?.recordings) ? mb.recordings[0] : null;
    if (!rec) { res.status(404).json({ error: "No match found in MusicBrainz." }); return; }

    const matchedArtist: string | undefined = Array.isArray(rec["artist-credit"]) && rec["artist-credit"][0]?.name
      ? String(rec["artist-credit"][0].name)
      : undefined;
    const matchedTitle: string | undefined = rec.title ? String(rec.title) : undefined;
    const release = Array.isArray(rec.releases) ? rec.releases[0] : null;
    const matchedAlbum: string | undefined = release?.title ? String(release.title) : undefined;
    const releaseMbid: string | undefined = release?.id ? String(release.id) : undefined;
    const dateStr: string | undefined = release?.date || rec["first-release-date"];
    const yearMatch = dateStr ? /^(\d{4})/.exec(String(dateStr)) : null;
    const matchedYear = yearMatch ? parseInt(yearMatch[1], 10) : null;

    const artworkUrl = releaseMbid ? await coverArtUrl(releaseMbid) : null;

    const [updated] = await db
      .update(musicTracksTable)
      .set({
        title: (matchedTitle || track.title).slice(0, 256),
        artist: (matchedArtist || track.artist).slice(0, 256),
        album: matchedAlbum ? matchedAlbum.slice(0, 256) : track.album,
        year: matchedYear ?? track.year,
        artworkUrl: artworkUrl ?? track.artworkUrl,
      })
      .where(and(eq(musicTracksTable.id, id), eq(musicTracksTable.userId, userId)))
      .returning();

    res.json({
      track: updated,
      matched: {
        score: typeof rec.score === "number" ? rec.score : null,
        artist: matchedArtist ?? null,
        title: matchedTitle ?? null,
        album: matchedAlbum ?? null,
        year: matchedYear,
        hasArtwork: !!artworkUrl,
      },
    });
  } catch (e) {
    console.error("[music] autotag error", e);
    res.status(500).json({ error: "Failed to auto-tag track" });
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

// POST /api/music/convert-stream-url — pull audio from a streaming-site URL
// (YouTube, SoundCloud, Bandcamp, Vimeo, etc.) using yt-dlp, transcode to
// MP3 via ffmpeg, store in object storage, and create a music_tracks row.
//
// LIMITATION: Spotify and Apple Music are DRM-protected — yt-dlp can read the
// metadata page but the actual audio stream is encrypted. We detect those
// hosts up-front and return a clear error rather than failing mysteriously
// later in the pipeline.
const STREAM_MAX_BYTES = 80 * 1024 * 1024; // 80 MB, slightly larger than direct import
const STREAM_DURATION_CAP_SEC = 60 * 20;   // 20 min hard cap per track
const DRM_HOSTS = /(^|\.)(open\.spotify\.com|spotify\.com|music\.apple\.com|tidal\.com|deezer\.com)$/i;

router.post("/music/convert-stream-url", requireAuth, async (req: Request, res: Response) => {
  const { spawn } = await import("node:child_process");
  const { mkdtemp, readFile, rm, readdir, stat } = await import("node:fs/promises");
  const path = await import("node:path");
  const os = await import("node:os");

  const userId = String(req.user!.id);
  const url = String(req.body?.url || "").trim();
  if (!url) { res.status(400).json({ error: "url required" }); return; }

  let parsed: URL;
  try { parsed = new URL(url); } catch { res.status(400).json({ error: "invalid url" }); return; }
  if (!/^https?:$/.test(parsed.protocol)) { res.status(400).json({ error: "only http(s) urls allowed" }); return; }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    res.status(400).json({ error: "host not allowed" }); return;
  }
  // SSRF defence: resolve all A/AAAA for the requested host and reject if any
  // resolve to loopback / link-local / private / CGNAT ranges. yt-dlp will
  // perform additional fetches (extractor pages, redirects, segment URLs)
  // that we cannot directly intercept — but the entry-point host being a
  // public address closes the most common abuse vector. We deliberately
  // reject hosts with mixed public/private resolutions to avoid DNS rebind.
  {
    const { lookup } = await import("node:dns/promises");
    const isPrivateIp = (ip: string): boolean => {
      const v = ip.toLowerCase();
      if (v === "::1" || v === "::" || v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd")) return true;
      const mapped = v.startsWith("::ffff:") ? v.slice(7) : v;
      const m = mapped.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
      if (!m) return false;
      const [a, b] = [Number(m[1]), Number(m[2])];
      if (a === 10 || a === 127 || a === 0) return true;
      if (a === 169 && b === 254) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 100 && b >= 64 && b <= 127) return true;
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
  }

  if (DRM_HOSTS.test(host)) {
    res.status(415).json({
      error:
        "Spotify, Apple Music, Tidal, and Deezer streams are DRM-encrypted — we can't legally extract their audio. Use a YouTube, SoundCloud, Bandcamp, or direct file URL instead. (Tip: many tracks are also on YouTube.)",
      drm: true,
    });
    return;
  }

  // Per-user playlist limit before spending CPU on a download.
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

  let workDir: string | null = null;
  try {
    workDir = await mkdtemp(path.join(os.tmpdir(), "humbird-"));

    // Probe metadata first to enforce duration cap before downloading the
    // whole file. yt-dlp -j prints one JSON line.
    const meta = await new Promise<any>((resolve, reject) => {
      const proc = spawn("yt-dlp", ["-j", "--no-playlist", "--no-warnings", "--socket-timeout", "15", url], { timeout: 30_000 });
      let stdout = ""; let stderr = "";
      proc.stdout.on("data", (b) => { stdout += b.toString(); });
      proc.stderr.on("data", (b) => { stderr += b.toString(); });
      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code !== 0) return reject(new Error(stderr.trim().split("\n").pop() || `yt-dlp metadata exit ${code}`));
        try { resolve(JSON.parse(stdout.trim().split("\n").pop() || "{}")); } catch (e) { reject(e); }
      });
    }).catch((e) => { throw new Error(`Couldn't read that URL: ${e.message || e}`); });

    const duration = Number(meta?.duration) || 0;
    if (duration > STREAM_DURATION_CAP_SEC) {
      res.status(413).json({ error: `Track is ${Math.round(duration / 60)} min — 20 min max for the converter.` });
      return;
    }
    const title = String(meta?.title || meta?.fulltitle || "Imported Track").slice(0, 256);
    const artist = String(meta?.uploader || meta?.channel || meta?.creator || parsed.hostname.replace(/^www\./, "")).slice(0, 256);
    const sourceTag = host.includes("youtube") || host.includes("youtu.be") ? "youtube"
      : host.includes("soundcloud") ? "soundcloud"
      : host.includes("bandcamp") ? "bandcamp"
      : "stream";

    // Now actually download + transcode to mp3 (192k stereo) into workDir.
    const outTpl = path.join(workDir, "out.%(ext)s");
    await new Promise<void>((resolve, reject) => {
      const args = [
        "-x", "--audio-format", "mp3", "--audio-quality", "192K",
        "--no-playlist", "--no-warnings",
        "--socket-timeout", "20",
        "--max-filesize", String(STREAM_MAX_BYTES),
        "-o", outTpl,
        url,
      ];
      const proc = spawn("yt-dlp", args, { timeout: 180_000 });
      let stderr = "";
      proc.stderr.on("data", (b) => { stderr += b.toString(); });
      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr.trim().split("\n").pop() || `yt-dlp exit ${code}`));
      });
    });

    // Find the produced mp3.
    const files = await readdir(workDir);
    const mp3 = files.find((f) => f.toLowerCase().endsWith(".mp3"));
    if (!mp3) throw new Error("Conversion produced no audio file.");
    const mp3Path = path.join(workDir, mp3);
    const st = await stat(mp3Path);
    if (st.size > STREAM_MAX_BYTES) {
      res.status(413).json({ error: "Converted file too large (80 MB max)." });
      return;
    }
    if ((counts?.bytes ?? 0) + st.size > MAX_TOTAL_BYTES_PER_USER) {
      res.status(413).json({ error: "Personal music storage cap reached (500 MB)." });
      return;
    }
    const buf = await readFile(mp3Path);

    const uploadURL = await storage.getObjectEntityUploadURL();
    const objectPath = storage.normalizeObjectEntityPath(uploadURL);
    const put = await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": "audio/mpeg" },
      body: buf,
    });
    if (!put.ok) throw new Error("Upload to storage failed.");

    const [row] = await db
      .insert(musicTracksTable)
      .values({
        userId,
        title,
        artist,
        album: null,
        mimeType: "audio/mpeg",
        sizeBytes: st.size,
        durationSec: Math.max(0, Math.floor(duration)),
        objectPath,
        source: sourceTag === "youtube" || sourceTag === "soundcloud" || sourceTag === "bandcamp" ? "upload" : "upload",
        position: (counts?.n ?? 0),
      })
      .returning();

    res.json({ track: row, source: sourceTag });
  } catch (e: any) {
    const msg = String(e?.message || e || "conversion failed");
    // Surface a friendlier error for common yt-dlp failures.
    let userMsg = msg;
    if (/Sign in to confirm|age|consent|cookies/i.test(msg)) userMsg = "That video requires sign-in / age verification. We can't extract it.";
    else if (/Private video|members.only|geo|country/i.test(msg)) userMsg = "Video is private, members-only, or geo-blocked.";
    else if (/Unsupported URL/i.test(msg)) userMsg = "We don't recognise that streaming site. Try YouTube, SoundCloud, or Bandcamp.";
    else if (/HTTP Error 404/i.test(msg)) userMsg = "Track not found at that URL.";
    console.error("[music] convert-stream-url error", msg);
    res.status(502).json({ error: userMsg });
  } finally {
    if (workDir) {
      try { await rm(workDir, { recursive: true, force: true }); } catch {}
    }
  }
});

// POST /api/music/import-from-library — given a media-library file id from
// /api/tools/documents/files, copy/register it as a Hummingbird track.
// We don't re-upload — both surfaces share the same object-storage backend,
// so we just point a new music_tracks row at the existing object path.
router.post("/music/import-from-library", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = String(req.user!.id);
    // SECURITY: We accept either a fileId (preferred — server resolves the
    // object path itself) OR an objectPath (legacy). When objectPath is
    // supplied we MUST verify the caller actually owns a files_folders row
    // pointing at that path; otherwise a user could enumerate other users'
    // GCS objects by guessing /objects/<uuid>.
    const fileId = req.body?.fileId !== undefined ? Number(req.body.fileId) : null;
    let objectPath = String(req.body?.objectPath || "").trim();
    let title = String(req.body?.title || "Library Track").slice(0, 256);
    let mimeType = String(req.body?.mimeType || "audio/mpeg").slice(0, 128);
    let sizeBytes = Math.max(0, Math.floor(Number(req.body?.sizeBytes) || 0));

    if (fileId !== null && Number.isFinite(fileId)) {
      const [owned] = await db
        .select()
        .from(filesFoldersTable)
        .where(and(eq(filesFoldersTable.id, fileId), eq(filesFoldersTable.userId, userId as any)));
      if (!owned || owned.isFolder) {
        res.status(404).json({ error: "Library file not found in your vault." });
        return;
      }
      objectPath = String(owned.objectPath || "");
      title = (owned.name || title).replace(/\.[^.]+$/, "").slice(0, 256);
      mimeType = (owned.mimeType || mimeType) as string;
      sizeBytes = Number(owned.fileSize || sizeBytes) || 0;
    } else {
      if (!objectPath || !objectPath.startsWith("/objects/")) {
        res.status(400).json({ error: "fileId or objectPath required" });
        return;
      }
      // Ownership check: at least one files_folders row owned by this user
      // must reference this objectPath. Otherwise reject — even if the
      // GCS object exists, the caller has no business loading it.
      const normalized = storage.normalizeObjectEntityPath(objectPath);
      const [owned] = await db
        .select({ id: filesFoldersTable.id, mimeType: filesFoldersTable.mimeType, fileSize: filesFoldersTable.fileSize, name: filesFoldersTable.name })
        .from(filesFoldersTable)
        .where(and(
          eq(filesFoldersTable.userId, userId as any),
          eq(filesFoldersTable.objectPath, normalized),
        ));
      if (!owned) {
        res.status(403).json({ error: "You don't own that library file." });
        return;
      }
      mimeType = (owned.mimeType || mimeType) as string;
      sizeBytes = Number(owned.fileSize || sizeBytes) || 0;
      if (!title || title === "Library Track") title = String(owned.name || title).replace(/\.[^.]+$/, "").slice(0, 256);
    }

    if (!objectPath || !objectPath.startsWith("/objects/")) {
      res.status(400).json({ error: "library file has no usable object path" });
      return;
    }
    if (!mimeType.startsWith("audio/") && mimeType !== "video/mp4" && mimeType !== "application/ogg") {
      res.status(415).json({ error: `Library file isn't audio (${mimeType}).` });
      return;
    }

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
    if ((counts?.bytes ?? 0) + sizeBytes > MAX_TOTAL_BYTES_PER_USER) {
      res.status(413).json({ error: "Personal music storage cap reached (500 MB)." });
      return;
    }

    // Verify the object actually exists & is reachable before recording it.
    try {
      await storage.getObjectEntityFile(objectPath);
    } catch {
      res.status(404).json({ error: "That library file is no longer available." });
      return;
    }

    const normalizedPath = storage.normalizeObjectEntityPath(objectPath);
    const [row] = await db
      .insert(musicTracksTable)
      .values({
        userId,
        title,
        artist: "Media Library",
        album: null,
        mimeType,
        sizeBytes,
        durationSec: 0,
        objectPath: normalizedPath,
        source: "upload",
        position: (counts?.n ?? 0),
      })
      .returning();

    res.json({ track: row });
  } catch (e: any) {
    console.error("[music] import-from-library error", e);
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
