const test = require("node:test");
const assert = require("node:assert/strict");
const {
  formatVersion,
  getBuildIdentity,
  getFormattedVersion,
  getNextVersion,
  parseVersion,
  readVersion,
} = require("../../version-utils.cjs");

test("formats the visible version as major.minor without a build suffix", () => {
  assert.equal(formatVersion({ major: 24, minor: 3, suffix: "" }), "v24.3");
  assert.equal(getFormattedVersion(), `v${readVersion()}`);
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

test("build identity distinguishes channels while retaining the same source revision", () => {
  const commitHash = "1234567890abcdef1234567890abcdef12345678";
  const ptu = getBuildIdentity({ channel: "ptu", commitHash, dirty: false });
  const pu = getBuildIdentity({ channel: "pu", commitHash, dirty: false });

  assert.equal(ptu.version, pu.version);
  assert.equal(ptu.revision, "12345678");
  assert.equal(pu.revision, ptu.revision);
  assert.equal(ptu.label, `v${readVersion()} PTU 12345678`);
  assert.equal(pu.label, `v${readVersion()} PU 12345678`);
});

test("marks uncommitted builds and rejects unknown channels", () => {
  const dirty = getBuildIdentity({
    channel: "dev",
    commitHash: "abcdef1234567890",
    dirty: true,
  });

  assert.equal(dirty.revision, "abcdef12-dirty");
  assert.throws(
    () => getBuildIdentity({ channel: "production", commitHash: "abcdef1234567890", dirty: false }),
    /Use DEV, PTU, or PU/,
  );
});

test("uses the caller-provided channel only when no environment override exists", () => {
  const channel = getBuildIdentity({
    defaultChannel: "PTU",
    commitHash: "abcdef1234567890",
    dirty: false,
  });

  assert.equal(channel.channel, "PTU");
  assert.equal(channel.label, `v${readVersion()} PTU abcdef12`);
});
