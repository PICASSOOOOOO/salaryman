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

function formatVersion(parsed, build) {
  const base = `v.${parsed.major}.${parsed.minor}${parsed.suffix}`;
  return build ? `${base}.${build}` : base;
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

// Derive the displayed version from the git commit count so it
// bumps automatically on every publish/commit, even when the
// committed VERSION file hasn't changed (each deploy starts from
// a fresh checkout, so a write-back bump never persists).
function getFormattedVersion() {
  const raw = readVersion();
  const parsed = parseVersion(raw);
  const build = getBuildNumber();
  return parsed ? formatVersion(parsed, build) : `v.${raw}.${build}`;
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

const NOISE_PATTERNS = [
  /^published/i,
  /^publish/i,
  /^merge\b/i,
  /^bump\b/i,
  /^version\b/i,
  /^fix typo/i,
  /^lint/i,
  /^format/i,
  /^chore/i,
  /^wip\b/i,
  /^minor/i,
  /^cleanup/i,
  /^clean up/i,
  /^refactor/i,
  /^revert/i,
  /^update.*package/i,
  /^update.*depend/i,
  /^update.*config/i,
  /^automatically\b/i,
  /checkpoint/i,
  /^\s*$/,
];

function isFeatureCommit(msg) {
  return !NOISE_PATTERNS.some((rx) => rx.test(msg));
}

function cleanCommitMessage(msg) {
  return msg
    .replace(/^(add|implement|create|build|introduce|enable|wire up)\s+/i, (m) => m.charAt(0).toUpperCase() + m.slice(1))
    .replace(/\s+/g, " ")
    .trim();
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
      .filter((l) => l.length > 10 && l.length < 80)
      .filter(isFeatureCommit)
      .map(cleanCommitMessage)
      .slice(0, 5);
    if (summaries.length > 0) return summaries;
  } catch {
  }
  return ["Performance and stability improvements"];
}

function addChangelogEntry(versionRaw) {
  const changelog = readChangelog();
  const parsed = parseVersion(versionRaw);
  const build = getBuildNumber();
  const versionStr = parsed ? formatVersion(parsed, build) : `v.${versionRaw}.${build}`;

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
