import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db, worldBusinessesTable } from "@workspace/db";
import { getServerStatus } from "../worldServer";

const router = Router();

router.get("/world/check-company", async (req, res) => {
  try {
    const rawName = req.query.name;
    if (!rawName || typeof rawName !== "string" || !rawName.trim()) {
      res.status(400).json({ error: "name query param required" });
      return;
    }
    const normalized = rawName.trim().toUpperCase();
    const existing = await db
      .select({ id: worldBusinessesTable.id })
      .from(worldBusinessesTable)
      .where(sql`UPPER(${worldBusinessesTable.companyName}) = ${normalized}`)
      .limit(1);
    res.json({ taken: existing.length > 0 });
  } catch (err: any) {
    console.error("[World] check-company error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/world/register", async (req, res) => {
  try {
    const { playerName, businessType, companyName, industry, companySize, contactEmail, isPaid } = req.body;
    if (!playerName || !businessType) {
      res.status(400).json({ error: "playerName and businessType required" });
      return;
    }
    const validTypes = ["fictitious", "real", "unemployed"];
    const finalBizType = validTypes.includes(businessType) ? businessType : "fictitious";

    if (finalBizType === "fictitious" && companyName) {
      const normalized = String(companyName).trim().toUpperCase();
      if (normalized) {
        const existing = await db
          .select({ id: worldBusinessesTable.id })
          .from(worldBusinessesTable)
          .where(sql`UPPER(${worldBusinessesTable.companyName}) = ${normalized}`)
          .limit(1);
        if (existing.length > 0) {
          res.status(409).json({ error: "Company name already taken" });
          return;
        }
      }
    }

    const sessionId = req.cookies?.session_id ?? null;
    const [row] = await db
      .insert(worldBusinessesTable)
      .values({
        playerName: String(playerName).slice(0, 32).toUpperCase(),
        businessType: finalBizType,
        companyName: finalBizType === "unemployed" ? null : (companyName ? String(companyName).trim().toUpperCase().slice(0, 80) : null),
        industry: finalBizType === "unemployed" ? null : (industry ? String(industry).slice(0, 60) : null),
        companySize: finalBizType === "unemployed" ? null : (companySize ? String(companySize).slice(0, 30) : null),
        contactEmail: finalBizType === "unemployed" ? null : (contactEmail ? String(contactEmail).slice(0, 120) : null),
        isPaid: Boolean(isPaid),
        sessionId,
      })
      .returning();
    res.json({ ok: true, id: row.id });
  } catch (err: any) {
    console.error("[World] register error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/world/server-status", (_req, res) => {
  res.json(getServerStatus());
});

export default router;
