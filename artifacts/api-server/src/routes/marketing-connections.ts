import { Router, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, socialConnectionsTable } from "@workspace/db";
import { hasFeature } from "../lib/plan";
import { SOCIAL_PROVIDERS, getProvider, isProviderConfigured } from "../lib/social-providers";

const router = Router();

// All Marketing Command Center connection management is PRIME-gated. Returns the
// caller's userId when they hold PABLO PRIME, otherwise writes the 401/403 and
// returns null so the caller can bail.
async function requirePrime(req: Request, res: Response): Promise<string | null> {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  const userId = req.user.id;
  const ok = await hasFeature(userId, req.user.email, "claw_bot");
  if (!ok) {
    res.status(403).json({ error: "PABLO PRIME subscription required", feature: "claw_bot", upgrade: "/upgrade" });
    return null;
  }
  return userId;
}

// GET /social/connections — every platform merged with this user's live state.
router.get("/social/connections", async (req: Request, res: Response): Promise<void> => {
  const userId = await requirePrime(req, res);
  if (!userId) return;
  try {
    const rows = await db.select().from(socialConnectionsTable).where(eq(socialConnectionsTable.userId, userId));
    const byProvider = new Map(rows.map((r) => [r.provider, r]));
    const connections = SOCIAL_PROVIDERS.map((p) => {
      const row = byProvider.get(p.id);
      const configured = isProviderConfigured(p);
      let status = row?.status ?? "needs_setup";
      if (p.authType === "oauth" && !configured && status !== "connected") status = "needs_app_config";
      return {
        provider: p.id,
        label: p.label,
        authType: p.authType,
        available: p.available && configured,
        requiresAppConfig: p.requiresAppConfig,
        configured,
        credentialFields: p.credentialFields,
        connectHint: p.connectHint,
        status,
        accountHandle: row?.accountHandle ?? null,
        accountName: row?.accountName ?? null,
        connectedAt: row?.connectedAt ?? null,
        lastError: row?.lastError ?? null,
      };
    });
    res.json({ connections });
  } catch (err: any) {
    console.error("[Marketing] connections list error:", err?.message);
    res.status(500).json({ error: "Failed to load connections" });
  }
});

// POST /social/connections/:provider — connect a credential/webhook provider.
router.post("/social/connections/:provider", async (req: Request, res: Response): Promise<void> => {
  const userId = await requirePrime(req, res);
  if (!userId) return;
  const provider = getProvider(String(req.params.provider));
  if (!provider) {
    res.status(404).json({ error: "Unknown platform" });
    return;
  }

  if (provider.authType === "oauth") {
    res.status(501).json({
      error: `${provider.label} connects via OAuth, which isn't wired up yet. The owner needs to register the platform app first.`,
      status: isProviderConfigured(provider) ? "needs_oauth_flow" : "needs_app_config",
      provider: provider.id,
    });
    return;
  }

  try {
    const credentials = (req.body?.credentials ?? {}) as Record<string, string>;
    const missing = provider.credentialFields.filter((f) => !credentials[f.key]?.trim()).map((f) => f.label);
    if (missing.length) {
      res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
      return;
    }

    const verify = provider.verify ? await provider.verify(credentials) : { ok: true };
    if (!verify.ok) {
      res.status(400).json({ error: verify.error || "Could not verify the account." });
      return;
    }

    const now = new Date();
    const [row] = await db
      .insert(socialConnectionsTable)
      .values({
        userId,
        provider: provider.id,
        status: "connected",
        accountHandle: verify.accountHandle ?? null,
        accountName: verify.accountName ?? null,
        credentials,
        connectedAt: now,
        lastError: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [socialConnectionsTable.userId, socialConnectionsTable.provider],
        set: {
          status: "connected",
          accountHandle: verify.accountHandle ?? null,
          accountName: verify.accountName ?? null,
          credentials,
          connectedAt: now,
          lastError: null,
          updatedAt: now,
        },
      })
      .returning();
    res.json({ ok: true, provider: provider.id, status: "connected", accountHandle: row.accountHandle });
  } catch (err: any) {
    console.error("[Marketing] connect error:", err?.message);
    res.status(500).json({ error: "Failed to connect account" });
  }
});

// DELETE /social/connections/:provider — disconnect.
router.delete("/social/connections/:provider", async (req: Request, res: Response): Promise<void> => {
  const userId = await requirePrime(req, res);
  if (!userId) return;
  try {
    await db
      .delete(socialConnectionsTable)
      .where(and(eq(socialConnectionsTable.userId, userId), eq(socialConnectionsTable.provider, String(req.params.provider))));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to disconnect" });
  }
});

export default router;
