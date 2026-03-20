import { Router } from "express";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

declare const __BUILD_VERSION__: string;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getVersion(): string {
  if (typeof __BUILD_VERSION__ !== "undefined") {
    return __BUILD_VERSION__;
  }
  try {
    const _require = createRequire(import.meta.url);
    const { getFormattedVersion } = _require(path.resolve(__dirname, "../../../../version-utils.cjs"));
    return getFormattedVersion();
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
