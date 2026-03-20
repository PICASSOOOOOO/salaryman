import { Router } from "express";

declare const __BUILD_VERSION__: string;

function getVersion(): string {
  if (typeof __BUILD_VERSION__ !== "undefined") {
    return __BUILD_VERSION__;
  }
  try {
    const versionUtils = require("../../../../version-utils.cjs");
    return versionUtils.getFormattedVersion();
  } catch {
    return "dev";
  }
}

const BUILD_VERSION = getVersion();

const router = Router();

router.get("/version", (_req, res) => {
  res.json({ version: BUILD_VERSION });
});

export default router;
