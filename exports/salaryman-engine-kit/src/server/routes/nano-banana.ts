import { Router, type Request, type Response, type NextFunction } from "express";
import {
  generateImage,
  createImageTask,
  getTaskRecord,
  isNanoBananaConfigured,
  type AspectRatio,
  type Resolution,
  type OutputFormat,
} from "../lib/nano-banana";
import { burnAiCharge, getPowerStatus, ACTIVE_SLOT, ASSISTANT_TARGET_ID } from "../lib/battery";

const router = Router();

// Image generation runs on the player's Pablo/Mila assistant battery. This
// preflight blocks a dead assistant before we hit the provider; the burn after
// settles the metered cost. First-time users are "seedable" (free starter cell).
async function assistantPowered(userId: string): Promise<boolean> {
  const power = await getPowerStatus(userId, ACTIVE_SLOT, "assistant", ASSISTANT_TARGET_ID);
  return power.powered;
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  next();
}

const ASPECTS = new Set<AspectRatio>([
  "match_input_image", "1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1",
  "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9",
]);
const RESOLUTIONS = new Set<Resolution>(["1K", "2K", "4K"]);
const FORMATS = new Set<OutputFormat>(["jpg", "png"]);

// GET /api/ai/image/status — quick health check (no key value exposed)
router.get("/ai/image/status", (_req, res) => {
  res.json({ configured: isNanoBananaConfigured(), provider: "apipass.dev/nano-banana-pro" });
});

// POST /api/ai/image — synchronous generate (waits up to ~110s for completion)
router.post("/ai/image", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isNanoBananaConfigured()) {
      res.status(503).json({ error: "Nano Banana key not configured" });
      return;
    }
    const uid = String((req.user as { id: string }).id);
    if (!(await assistantPowered(uid))) {
      res.status(402).json({ error: "assistant_no_power", message: "Your assistant's battery is dead. Recharge or swap its cell at a charging station.", upgrade: "/upgrade" });
      return;
    }
    const {
      prompt,
      imageInput,
      aspectRatio,
      resolution,
      outputFormat,
      googleSearch,
      imageSearch,
      model,
      timeoutMs,
    } = req.body || {};

    if (typeof prompt !== "string" || prompt.trim().length < 2) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }
    if (prompt.length > 4000) {
      res.status(400).json({ error: "prompt too long (max 4000 chars)" });
      return;
    }
    if (aspectRatio && !ASPECTS.has(aspectRatio)) {
      res.status(400).json({ error: `aspectRatio must be one of ${Array.from(ASPECTS).join(",")}` });
      return;
    }
    if (resolution && !RESOLUTIONS.has(resolution)) {
      res.status(400).json({ error: "resolution must be 1K, 2K, or 4K" });
      return;
    }
    if (outputFormat && !FORMATS.has(outputFormat)) {
      res.status(400).json({ error: "outputFormat must be jpg or png" });
      return;
    }
    if (imageInput !== undefined) {
      if (!Array.isArray(imageInput) || imageInput.some(s => typeof s !== "string")) {
        res.status(400).json({ error: "imageInput must be an array of URL strings" });
        return;
      }
      if (imageInput.length > 14) {
        res.status(400).json({ error: "imageInput supports at most 14 URLs" });
        return;
      }
    }

    const safeTimeout = Math.min(
      Math.max(typeof timeoutMs === "number" ? timeoutMs : 110_000, 5_000),
      110_000,
    );

    const result = await generateImage({
      prompt: prompt.trim(),
      imageInput,
      aspectRatio,
      resolution,
      outputFormat,
      googleSearch: googleSearch === true,
      imageSearch: imageSearch === true,
      model,
      timeoutMs: safeTimeout,
    });

    // AI metering via battery burn: ~3.9¢ raw cost per nano-banana image (1K).
    // Bigger resolutions cost more — 2K ~7¢, 4K ~14¢. Marked up 4× into charge.
    // Fire-and-forget; never block the user response on billing.
    {
      const cost = resolution === "4K" ? 14 : resolution === "2K" ? 7 : 4;
      void burnAiCharge({
        userId: uid,
        targetType: "assistant",
        targetId: ASSISTANT_TARGET_ID,
        kind: "image",
        label: `nano-banana ${resolution || "1K"}`,
        costBasisCents: cost,
        allowSeed: true,
      }).catch((e) => console.error("[battery/image]", e?.message || e));
    }

    res.json(result);
  } catch (e: any) {
    console.error("[ai/image] error:", e?.message || e);
    res.status(500).json({ error: e?.message || "Image generation failed" });
  }
});

// POST /api/ai/image/task — start a task and return immediately (long jobs)
router.post("/ai/image/task", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isNanoBananaConfigured()) {
      res.status(503).json({ error: "Nano Banana key not configured" });
      return;
    }
    const uid = String((req.user as { id: string }).id);
    if (!(await assistantPowered(uid))) {
      res.status(402).json({ error: "assistant_no_power", message: "Your assistant's battery is dead. Recharge or swap its cell at a charging station.", upgrade: "/upgrade" });
      return;
    }
    const { prompt, imageInput, aspectRatio, resolution, outputFormat, googleSearch, imageSearch, model } = req.body || {};
    if (typeof prompt !== "string" || prompt.trim().length < 2) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }
    const taskId = await createImageTask({
      prompt: prompt.trim(),
      imageInput,
      aspectRatio,
      resolution,
      outputFormat,
      googleSearch: googleSearch === true,
      imageSearch: imageSearch === true,
      model,
    });
    {
      const cost = resolution === "4K" ? 14 : resolution === "2K" ? 7 : 4;
      void burnAiCharge({
        userId: uid,
        targetType: "assistant",
        targetId: ASSISTANT_TARGET_ID,
        kind: "image",
        label: `nano-banana ${resolution || "1K"} (async)`,
        costBasisCents: cost,
        allowSeed: true,
      }).catch((e) => console.error("[battery/image-task]", e?.message || e));
    }
    res.json({ taskId });
  } catch (e: any) {
    console.error("[ai/image/task] error:", e?.message || e);
    res.status(500).json({ error: e?.message || "Image task failed" });
  }
});

// GET /api/ai/image/task/:id — poll a task created via /task
router.get("/ai/image/task/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || "");
    if (!id) { res.status(400).json({ error: "task id required" }); return; }
    const rec = await getTaskRecord(id);
    res.json(rec);
  } catch (e: any) {
    console.error("[ai/image/task get] error:", e?.message || e);
    res.status(500).json({ error: e?.message || "Failed to fetch task" });
  }
});

export default router;
