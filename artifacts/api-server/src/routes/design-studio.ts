import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

function getAuthUserId(req: Request): string | null {
  return req.isAuthenticated?.() && req.user ? req.user.id : null;
}

const CANVA_API_BASE = "https://api.canva.com/rest/v1";

function canvaHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

router.post("/design-studio/canva/designs", async (req: Request, res: Response): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { canvaApiKey, designType, title, width, height } = req.body;
  if (!canvaApiKey) { res.status(400).json({ error: "Canva API key required" }); return; }

  try {
    const body: any = {};
    if (title) body.title = title;
    if (designType?.preset) {
      body.design_type = { type: "preset", name: designType.preset };
    } else if (width && height) {
      body.design_type = { type: "custom", width, height };
    }

    const resp = await fetch(`${CANVA_API_BASE}/designs`, {
      method: "POST",
      headers: canvaHeaders(canvaApiKey),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errBody: any = await resp.json().catch(() => ({ message: resp.statusText }));
      res.status(resp.status).json({ error: errBody.message || "Canva API error", details: errBody });
      return;
    }

    const data = await resp.json();
    res.json(data);
  } catch (err: any) {
    console.error("[design-studio] canva create error:", err);
    res.status(500).json({ error: "Failed to create Canva design" });
  }
});

router.get("/design-studio/canva/designs", async (req: Request, res: Response): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const canvaApiKey = req.headers["x-canva-key"] as string;
  if (!canvaApiKey) { res.status(400).json({ error: "Canva API key required" }); return; }

  try {
    const continuation = req.query.continuation as string | undefined;
    let url = `${CANVA_API_BASE}/designs?query=ownership:owned`;
    if (continuation) url += `&continuation=${encodeURIComponent(continuation)}`;

    const resp = await fetch(url, {
      headers: canvaHeaders(canvaApiKey),
    });

    if (!resp.ok) {
      const errBody: any = await resp.json().catch(() => ({ message: resp.statusText }));
      res.status(resp.status).json({ error: errBody.message || "Canva API error" });
      return;
    }

    const data = await resp.json();
    res.json(data);
  } catch (err: any) {
    console.error("[design-studio] canva list error:", err);
    res.status(500).json({ error: "Failed to list Canva designs" });
  }
});

router.post("/design-studio/canva/designs/:designId/export", async (req: Request, res: Response): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { canvaApiKey, format } = req.body;
  if (!canvaApiKey) { res.status(400).json({ error: "Canva API key required" }); return; }

  const { designId } = req.params;

  try {
    const exportResp = await fetch(`${CANVA_API_BASE}/exports`, {
      method: "POST",
      headers: canvaHeaders(canvaApiKey),
      body: JSON.stringify({
        design_id: designId,
        format: { type: format || "png" },
      }),
    });

    if (!exportResp.ok) {
      const errBody: any = await exportResp.json().catch(() => ({ message: exportResp.statusText }));
      res.status(exportResp.status).json({ error: errBody.message || "Canva export error" });
      return;
    }

    const data = await exportResp.json();
    res.json(data);
  } catch (err: any) {
    console.error("[design-studio] canva export error:", err);
    res.status(500).json({ error: "Failed to export design" });
  }
});

router.get("/design-studio/canva/exports/:exportId", async (req: Request, res: Response): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const canvaApiKey = req.headers["x-canva-key"] as string;
  if (!canvaApiKey) { res.status(400).json({ error: "Canva API key required" }); return; }

  const { exportId } = req.params;

  try {
    const resp = await fetch(`${CANVA_API_BASE}/exports/${exportId}`, {
      headers: canvaHeaders(canvaApiKey),
    });

    if (!resp.ok) {
      const errBody: any = await resp.json().catch(() => ({ message: resp.statusText }));
      res.status(resp.status).json({ error: errBody.message || "Canva API error" });
      return;
    }

    const data = await resp.json();
    res.json(data);
  } catch (err: any) {
    console.error("[design-studio] canva export status error:", err);
    res.status(500).json({ error: "Failed to check export status" });
  }
});

router.post("/design-studio/canva/assets/upload", async (req: Request, res: Response): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { canvaApiKey, name, url: assetUrl } = req.body;
  if (!canvaApiKey || !assetUrl) { res.status(400).json({ error: "Canva API key and asset URL required" }); return; }

  try {
    const resp = await fetch(`${CANVA_API_BASE}/asset-uploads`, {
      method: "POST",
      headers: canvaHeaders(canvaApiKey),
      body: JSON.stringify({
        name_base64: Buffer.from(name || "upload").toString("base64"),
        url: assetUrl,
      }),
    });

    if (!resp.ok) {
      const errBody: any = await resp.json().catch(() => ({ message: resp.statusText }));
      res.status(resp.status).json({ error: errBody.message || "Canva upload error" });
      return;
    }

    const data = await resp.json();
    res.json(data);
  } catch (err: any) {
    console.error("[design-studio] canva asset upload error:", err);
    res.status(500).json({ error: "Failed to upload asset to Canva" });
  }
});

function isAllowedExternalUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    const blocked = [
      "localhost", "127.0.0.1", "0.0.0.0", "[::1]", "metadata.google.internal",
      "169.254.169.254",
    ];
    if (blocked.some(b => host === b)) return false;
    if (host.endsWith(".local") || host.endsWith(".internal")) return false;
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

router.post("/design-studio/nano/generate", async (req: Request, res: Response): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { nanoApiKey, nanoApiUrl, prompt, width, height, style } = req.body;
  if (!nanoApiKey || !nanoApiUrl) {
    res.status(400).json({ error: "Nano Banana API key and URL required" });
    return;
  }

  if (!isAllowedExternalUrl(nanoApiUrl)) {
    res.status(400).json({ error: "Invalid API URL. Must be a public HTTPS endpoint." });
    return;
  }

  try {
    const resp = await fetch(nanoApiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${nanoApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        width: width || 1024,
        height: height || 1024,
        style: style || "default",
      }),
    });

    if (!resp.ok) {
      const errBody: any = await resp.json().catch(() => ({ message: resp.statusText }));
      res.status(resp.status).json({ error: errBody.message || "Nano Banana API error", details: errBody });
      return;
    }

    const data = await resp.json();
    res.json(data);
  } catch (err: any) {
    console.error("[design-studio] nano banana error:", err);
    res.status(500).json({ error: "Failed to generate with Nano Banana" });
  }
});

export default router;
