import { Router } from "express";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
declare const __BUILD_VERSION__: string;
declare const __BUILD_CHANNEL__: string;
declare const __BUILD_REVISION__: string;
declare const __BUILD_LABEL__: string;

function getBuildMetadata() {
  if (
    typeof __BUILD_VERSION__ !== "undefined" &&
    typeof __BUILD_CHANNEL__ !== "undefined" &&
    typeof __BUILD_REVISION__ !== "undefined" &&
    typeof __BUILD_LABEL__ !== "undefined"
  ) {
    return {
      version: __BUILD_VERSION__,
      channel: __BUILD_CHANNEL__,
      revision: __BUILD_REVISION__,
      label: __BUILD_LABEL__,
    };
  }
  try {
    const versionUtils = require("../../../../version-utils.cjs");
    return versionUtils.getBuildIdentity({
      defaultChannel: process.env.NODE_ENV === "production" ? "PU" : "DEV",
    });
  } catch {
    return { version: "dev", channel: "DEV", revision: "local", label: "dev DEV local" };
  }
}

const BUILD_METADATA = getBuildMetadata();

const router = Router();

router.get("/version", (_req, res) => {
  res.json(BUILD_METADATA);
});

export default router;
