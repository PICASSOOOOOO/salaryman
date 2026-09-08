import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  buildApp,
  actAs,
  createUser,
  createOrgWithMembers,
  createPrivateChannel,
  setLastSeenAt,
  cleanupTestData,
} from "./helpers/commsTestApp";

let app: Express;

beforeAll(() => {
  app = buildApp();
});
afterAll(async () => {
  await cleanupTestData();
});

// Fetch the channels payload as `user` and return the private-channel entry for
// the given partner (the side whose presence we're asserting on).
async function getPartnerPresence(
  user: { id: string; email: string },
  partnerId: string,
) {
  actAs(user);
  const res = await request(app).get("/api/chat/channels");
  expect(res.status).toBe(200);
  const channels: Array<{
    otherUser: { id: string; online: boolean; lastSeenAt: string | null } | null;
  }> = res.body.privateChannels;
  return channels.find((c) => c.otherUser?.id === partnerId)?.otherUser ?? null;
}

describe("GET /chat/channels — DM partner presence", () => {
  it("reports ONLINE when the partner's lastSeenAt is within the 90s window", async () => {
    const me = await createUser();
    const partner = await createUser();
    // Partner belongs to an org and has a fresh heartbeat.
    const orgId = await createOrgWithMembers(partner.id);
    await createPrivateChannel(me.id, partner.id);
    await setLastSeenAt(orgId, partner.id, new Date(Date.now() - 5 * 1000));

    const presence = await getPartnerPresence(me, partner.id);
    expect(presence).not.toBeNull();
    expect(presence!.online).toBe(true);
    expect(presence!.lastSeenAt).not.toBeNull();
  });

  it("reports OFFLINE when the partner's lastSeenAt is older than the 90s window", async () => {
    const me = await createUser();
    const partner = await createUser();
    const orgId = await createOrgWithMembers(partner.id);
    await createPrivateChannel(me.id, partner.id);
    // 91s ago — just outside the window.
    await setLastSeenAt(orgId, partner.id, new Date(Date.now() - 91 * 1000));

    const presence = await getPartnerPresence(me, partner.id);
    expect(presence).not.toBeNull();
    expect(presence!.online).toBe(false);
    // lastSeenAt is still reported (it exists), just stale.
    expect(presence!.lastSeenAt).not.toBeNull();
  });

  it("reports OFFLINE when the partner has org membership but a NULL heartbeat", async () => {
    const me = await createUser();
    const partner = await createUser();
    // Org membership exists but lastSeenAt was never set (defaults to NULL).
    await createOrgWithMembers(partner.id);
    await createPrivateChannel(me.id, partner.id);

    const presence = await getPartnerPresence(me, partner.id);
    expect(presence).not.toBeNull();
    expect(presence!.online).toBe(false);
    expect(presence!.lastSeenAt).toBeNull();
  });

  it("reports OFFLINE when the partner has NO org membership at all (never seen)", async () => {
    const me = await createUser();
    const partner = await createUser();
    // Partner is in no org, so there is no orgMembers row to derive presence.
    await createPrivateChannel(me.id, partner.id);

    const presence = await getPartnerPresence(me, partner.id);
    expect(presence).not.toBeNull();
    expect(presence!.online).toBe(false);
    expect(presence!.lastSeenAt).toBeNull();
  });

  it("uses the MAX heartbeat across multiple orgs (cross-org colleague)", async () => {
    const me = await createUser();
    const partner = await createUser();
    // Partner belongs to two orgs: one stale heartbeat, one fresh. The fresh
    // one (the MAX) must win, so the partner reads online.
    const staleOrgId = await createOrgWithMembers(partner.id);
    const freshOrgId = await createOrgWithMembers(partner.id);
    await createPrivateChannel(me.id, partner.id);
    await setLastSeenAt(staleOrgId, partner.id, new Date(Date.now() - 10 * 60 * 1000));
    await setLastSeenAt(freshOrgId, partner.id, new Date(Date.now() - 3 * 1000));

    const presence = await getPartnerPresence(me, partner.id);
    expect(presence).not.toBeNull();
    expect(presence!.online).toBe(true);
  });

  it("stays OFFLINE when EVERY org heartbeat is stale (cross-org, all old)", async () => {
    const me = await createUser();
    const partner = await createUser();
    const orgA = await createOrgWithMembers(partner.id);
    const orgB = await createOrgWithMembers(partner.id);
    await createPrivateChannel(me.id, partner.id);
    await setLastSeenAt(orgA, partner.id, new Date(Date.now() - 5 * 60 * 1000));
    await setLastSeenAt(orgB, partner.id, new Date(Date.now() - 2 * 60 * 1000));

    const presence = await getPartnerPresence(me, partner.id);
    expect(presence).not.toBeNull();
    expect(presence!.online).toBe(false);
  });
});
