import { Router, type Request, type Response } from "express";
import { isOwnerEmail } from "../lib/plan";
import { getGodotRenderStatus } from "../godot-render-bridge";

const router = Router();

router.get("/godot-render/status", (req: Request, res: Response) => {
  if (!req.user || !isOwnerEmail(req.user.email)) {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  res.json(getGodotRenderStatus());
});

export default router;