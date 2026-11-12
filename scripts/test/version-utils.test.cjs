const test = require("node:test");
const assert = require("node:assert/strict");
const {
  formatVersion,
  getFormattedVersion,
  getNextVersion,
  parseVersion,
  readVersion,
} = require("../../version-utils.cjs");

test("formats the visible version as major.minor without a build suffix", () => {
  assert.equal(formatVersion({ major: 24, minor: 3, suffix: "" }), "24.3");
  assert.equal(getFormattedVersion(), readVersion());
});

test("advances minor versions and rolls over at ten", () => {
  assert.equal(getNextVersion("24.3"), "24.4");
  assert.equal(getNextVersion("24.9"), "25.0");
});

test("preserves an intentional letter suffix when advancing", () => {
  assert.equal(getNextVersion("24.9a"), "25.0a");
});

test("leaves an invalid version unchanged", () => {
  assert.equal(getNextVersion("release"), "release");
});
