import { Router } from "express";
import { db, worldBusinessesTable } from "@workspace/db";

const router = Router();

router.post("/world/register", async (req, res) => {
  try {
    const { playerName, businessType, companyName, industry, companySize, contactEmail, isPaid } = req.body;
    if (!playerName || !businessType) {
      res.status(400).json({ error: "playerName and businessType required" });
      return;
    }
    const sessionId = req.cookies?.session_id ?? null;
    const [row] = await db
      .insert(worldBusinessesTable)
      .values({
        playerName: String(playerName).slice(0, 32).toUpperCase(),
        businessType: businessType === "real" ? "real" : "fictitious",
        companyName: companyName ? String(companyName).slice(0, 80) : null,
        industry: industry ? String(industry).slice(0, 60) : null,
        companySize: companySize ? String(companySize).slice(0, 30) : null,
        contactEmail: contactEmail ? String(contactEmail).slice(0, 120) : null,
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

export default router;
