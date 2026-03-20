import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const _require = createRequire(import.meta.url);
const versionUtils = _require(path.resolve(__dirname, "../../version-utils.cjs"));

export const readVersion: () => string = versionUtils.readVersion;
export const parseVersion: (raw: string) => { major: number; minor: number; suffix: string } | null = versionUtils.parseVersion;
export const formatVersion: (parsed: { major: number; minor: number; suffix: string }) => string = versionUtils.formatVersion;
export const getFormattedVersion: () => string = versionUtils.getFormattedVersion;
export const bumpVersion: () => string = versionUtils.bumpVersion;
