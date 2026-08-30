import { createReadStream, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createGzip } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, "dist/public");
const baselinePath = resolve(root, process.argv[2] ?? "scripts/startup-baseline.json");
const html = await readFile(resolve(outDir, "index.html"), "utf8");
const baseline = JSON.parse(await readFile(baselinePath, "utf8"));

const assetPaths = [...html.matchAll(/(?:src|href|data-src)="([^"]*\/assets\/[^"]+)"/g)]
  .map((match) => match[1])
  .filter((value, index, all) => all.indexOf(value) === index);

async function gzipBytes(file) {
  return await new Promise((resolveSize, reject) => {
    let bytes = 0;
    createReadStream(file)
      .pipe(createGzip())
      .on("data", (chunk) => { bytes += chunk.length; })
      .on("end", () => resolveSize(bytes))
      .on("error", reject);
  });
}

const rows = [];
const logicalName = (name) =>
  name.replace(/-[A-Za-z0-9_-]{8}(\.(?:js|css))$/, "$1");
for (const publicPath of assetPaths) {
  const file = resolve(outDir, publicPath.replace(/^\//, ""));
  const name = basename(file);
  rows.push({
    name,
    logicalName: logicalName(name),
    bytes: statSync(file).size,
    gzipBytes: await gzipBytes(file),
    kind: name.includes("legacy") ? "legacy startup" : "modern startup",
  });
}

const totals = rows.reduce((acc, row) => {
  const total = acc[row.kind] ?? { bytes: 0, gzipBytes: 0 };
  total.bytes += row.bytes;
  total.gzipBytes += row.gzipBytes;
  acc[row.kind] = total;
  return acc;
}, {});

const baselineTotals = baseline.assets.reduce((acc, row) => {
  const total = acc[row.kind] ?? { bytes: 0, gzipBytes: 0 };
  total.bytes += row.bytes;
  total.gzipBytes += row.gzipBytes;
  acc[row.kind] = total;
  return acc;
}, {});

const comparison = Object.keys(totals).map((kind) => {
  const before = baselineTotals[kind];
  const after = totals[kind];
  return {
    kind,
    beforeBytes: before.bytes,
    afterBytes: after.bytes,
    rawChange: `${(((after.bytes - before.bytes) / before.bytes) * 100).toFixed(1)}%`,
    beforeGzip: before.gzipBytes,
    afterGzip: after.gzipBytes,
    gzipChange: `${(((after.gzipBytes - before.gzipBytes) / before.gzipBytes) * 100).toFixed(1)}%`,
  };
});

console.log(`Baseline: ${baselinePath}`);
console.table(rows.map(({ logicalName, kind, bytes, gzipBytes }) => ({ logicalName, kind, bytes, gzipBytes })));
console.table(comparison);