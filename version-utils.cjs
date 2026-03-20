const { readFileSync, writeFileSync } = require("fs");
const path = require("path");

const VERSION_FILE = path.resolve(__dirname, "VERSION");

function readVersion() {
  try {
    return readFileSync(VERSION_FILE, "utf-8").trim();
  } catch {
    return "1.0a";
  }
}

function parseVersion(raw) {
  const match = raw.match(/^(\d+)\.(\d+)([a-z]*)$/);
  if (!match) return null;
  return { major: parseInt(match[1], 10), minor: parseInt(match[2], 10), suffix: match[3] };
}

function formatVersion(parsed) {
  return `v.${parsed.major}.${parsed.minor}${parsed.suffix}`;
}

function getFormattedVersion() {
  const raw = readVersion();
  const parsed = parseVersion(raw);
  if (!parsed) return `v.${raw}`;
  return formatVersion(parsed);
}

function bumpVersion() {
  const raw = readVersion();
  const parsed = parseVersion(raw);
  if (!parsed) return raw;
  parsed.minor += 1;
  if (parsed.minor >= 10) { parsed.minor = 0; parsed.major += 1; }
  const next = `${parsed.major}.${parsed.minor}${parsed.suffix}`;
  writeFileSync(VERSION_FILE, `${next}\n`, "utf-8");
  return next;
}

module.exports = { readVersion, parseVersion, formatVersion, getFormattedVersion, bumpVersion };
