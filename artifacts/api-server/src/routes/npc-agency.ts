import { Router, type Request, type Response } from "express";
import { isOwnerEmail } from "../lib/plan";
import {
  getSharedNpcAgencySnapshot,
  persistSharedNpcAgencySnapshot,
} from "../lib/npc-agency-store";
import {
  validateNpcAgencySnapshot,
  type BrandFaction,
  type NpcAgencySnapshot,
  type ShopLocationBoss,
} from "../lib/npc-agency";

const router = Router();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every((key) => key in value);
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result.length > 0 && result.length <= 128 ? result : null;
}

function parseSnapshot(value: unknown): { snapshot?: NpcAgencySnapshot; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value) || !exactKeys(value, ["factions", "bosses"])) {
    return { errors: ["Expected only factions and bosses arrays"] };
  }
  if (!Array.isArray(value.factions) || !Array.isArray(value.bosses)) {
    return { errors: ["Factions and bosses must be arrays"] };
  }

  const factions: BrandFaction[] = value.factions.flatMap((entry, index) => {
    if (!isRecord(entry) || !exactKeys(entry, ["id", "name"])) {
      errors.push(`Faction ${index} must contain only id and name`);
      return [];
    }
    const id = cleanText(entry.id);
    const name = cleanText(entry.name);
    if (!id || !name) {
      errors.push(`Faction ${index} has an invalid id or name`);
      return [];
    }
    return [{ id, name }];
  });

  const bosses: ShopLocationBoss[] = value.bosses.flatMap((entry, index) => {
    const keys = ["id", "name", "brandId", "shopId", "locationId", "netWorthFiat"];
    if (!isRecord(entry) || !exactKeys(entry, keys)) {
      errors.push(`Boss ${index} has an invalid shape`);
      return [];
    }
    const id = cleanText(entry.id);
    const name = cleanText(entry.name);
    const brandId = cleanText(entry.brandId);
    const shopId = cleanText(entry.shopId);
    const locationId = cleanText(entry.locationId);
    const netWorthFiat = entry.netWorthFiat;
    if (
      !id || !name || !brandId || !shopId || !locationId ||
      typeof netWorthFiat !== "number" ||
      !Number.isSafeInteger(netWorthFiat) ||
      netWorthFiat < 0
    ) {
      errors.push(`Boss ${index} has invalid fields`);
      return [];
    }
    return [{ id, name, brandId, shopId, locationId, netWorthFiat }];
  });

  const snapshot = { factions, bosses };
  errors.push(...validateNpcAgencySnapshot(snapshot));
  return errors.length > 0 ? { errors } : { snapshot, errors };
}

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

function requireOwner(req: Request, res: Response): boolean {
  if (!requireAuth(req, res)) return false;
  const email = (req.user as { email?: string } | undefined)?.email;
  if (!isOwnerEmail(email)) {
    res.status(403).json({ error: "Owner access required" });
    return false;
  }
  return true;
}

/** Shared game-world roster; no user or organization filter is applied. */
router.get("/npc-agency/world", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    res.json(await getSharedNpcAgencySnapshot());
  } catch (error) {
    console.error("[NPC Agency] Failed to load shared world data:", error);
    res.status(500).json({ error: "Failed to load NPC agency data" });
  }
});

/** Owner-managed world data; upserts are transactional and never delete omitted rows. */
router.put("/npc-agency/world", async (req, res): Promise<void> => {
  if (!requireOwner(req, res)) return;

  const parsed = parseSnapshot(req.body);
  if (!parsed.snapshot) {
    res.status(400).json({ error: "Invalid NPC agency snapshot", details: parsed.errors });
    return;
  }

  try {
    await persistSharedNpcAgencySnapshot(parsed.snapshot);
    res.json({ ok: true });
  } catch (error) {
    console.error("[NPC Agency] Failed to persist shared world data:", error);
    res.status(500).json({ error: "Failed to persist NPC agency data" });
  }
});

export default router;
