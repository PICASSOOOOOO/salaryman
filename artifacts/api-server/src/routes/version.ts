import { Router } from "express";

declare const __BUILD_VERSION__: string;

const BUILD_VERSION = typeof __BUILD_VERSION__ !== "undefined" ? __BUILD_VERSION__ : "dev";

const router = Router();

router.get("/version", (_req, res) => {
  res.json({ version: BUILD_VERSION });
});

export default router;
