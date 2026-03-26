const { readFileSync, writeFileSync, existsSync } = require("fs");
const path = require("path");

const VERSION_FILE = path.resolve(__dirname, "VERSION");
const CHANGELOG_FILE = path.resolve(__dirname, "CHANGELOG.json");
const CHANGELOG_MIRROR = path.resolve(__dirname, "artifacts/interview-helper/src/changelog.json");

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

function getBuildNumber() {
  try {
    const { execSync } = require("child_process");
    const count = execSync("git rev-list --count HEAD", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    const n = parseInt(count, 10);
    if (!isNaN(n) && n > 0) return String(n);
  } catch {}
  return String(Math.floor(Date.now() / 1000));
}

function getFormattedVersion() {
  const raw = readVersion();
  const parsed = parseVersion(raw);
  const base = parsed ? formatVersion(parsed) : `v.${raw}`;
  const build = getBuildNumber();
  return `${base}.${build}`;
}

function readChangelog() {
  try {
    if (!existsSync(CHANGELOG_FILE)) return [];
    return JSON.parse(readFileSync(CHANGELOG_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function getCurrentCommitHash() {
  try {
    const { execSync } = require("child_process");
    return execSync("git rev-parse HEAD", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

function getChangelogSummary(sinceCommitHash) {
  try {
    const { execSync } = require("child_process");
    const cmd = sinceCommitHash
      ? `git log --oneline --no-merges ${sinceCommitHash}..HEAD`
      : `git log --oneline --no-merges -20`;
    const log = execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    const lines = log.trim().split("\n").filter(Boolean);
    const summaries = lines
      .map((l) => l.replace(/^[a-f0-9]+\s+/, "").trim())
      .filter((l) => l.length > 3 && l.length < 80)
      .slice(0, 5);
    if (summaries.length > 0) return summaries;
  } catch {
  }
  return ["Bug fixes and improvements"];
}

function addChangelogEntry(versionRaw) {
  const changelog = readChangelog();
  const parsed = parseVersion(versionRaw);
  const versionStr = parsed ? formatVersion(parsed) : `v.${versionRaw}`;

  if (changelog.some((e) => e.version === versionStr)) {
    return;
  }

  const prevEntry = changelog.length > 0 ? changelog[changelog.length - 1] : null;
  const sinceHash = prevEntry && prevEntry.commitHash ? prevEntry.commitHash : null;

  const today = new Date().toISOString().split("T")[0];
  const currentHash = getCurrentCommitHash();
  const changes = getChangelogSummary(sinceHash);

  changelog.push({ version: versionStr, date: today, commitHash: currentHash, changes });
  const json = JSON.stringify(changelog, null, 2) + "\n";
  writeFileSync(CHANGELOG_FILE, json, "utf-8");
  try { writeFileSync(CHANGELOG_MIRROR, json, "utf-8"); } catch {}
}

function bumpVersion() {
  const raw = readVersion();
  const parsed = parseVersion(raw);
  if (!parsed) return raw;
  parsed.minor += 1;
  if (parsed.minor >= 10) { parsed.minor = 0; parsed.major += 1; }
  const next = `${parsed.major}.${parsed.minor}${parsed.suffix}`;
  writeFileSync(VERSION_FILE, `${next}\n`, "utf-8");
  addChangelogEntry(next);
  return next;
}

module.exports = { readVersion, parseVersion, formatVersion, getFormattedVersion, bumpVersion, readChangelog };
