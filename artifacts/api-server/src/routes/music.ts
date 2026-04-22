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
    const id = parseInt(req.params.id, 10);
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
    const id = parseInt(req.params.id, 10);
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
