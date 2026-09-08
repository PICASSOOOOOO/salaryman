import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const _require = createRequire(import.meta.url);
const { bumpVersion, getFormattedVersion } = _require(path.resolve(__dirname, "../../version-utils.cjs"));

bumpVersion();
console.log(`Version bumped → ${getFormattedVersion()}`);
