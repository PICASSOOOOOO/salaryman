import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  db,
  chatChannelsTable,
  chatMessagesTable,
  colleaguesTable,
  canonicalPair,
  smsConversationsTable,
} from "@workspace/db";
import { inArray } from "drizzle-orm";
import {
  buildApp,
  actAs,
  setAuthed,
  createUser,
  createOrgWithMembers,
  createPrivateChannel,
  cleanupTestData,
} from "./helpers/commsTestApp";

let app: Express;

// Global channels have no owning user/org, so the shared cleanup (which scopes
// deletes by user/org) can't reach them. Track them here and delete directly;
// the cascade on channel_id removes their messages too.
const createdGlobalChannelIds: number[] = [];

beforeAll(() => {
  app = buildApp();
});
afterAll(async () => {
  if (createdGlobalChannelIds.length) {
    await db
      .delete(chatChannelsTable)
      .where(inArray(chatChannelsTable.id, createdGlobalChannelIds));
  }
  await cleanupTestData();
});

// Insert `count` messages into a channel and return their ids in order.
async function insertMessages(
  channelId: number,
  senderId: string,
  count: number,
): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const [row] = await db
      .insert(chatMessagesTable)
      .values({ channelId, senderUserId: senderId, content: `msg ${i}` })
      .returning({ id: chatMessagesTable.id });
    ids.push(row.id);
  }
  return ids;
}

// Pre-create the per-user Pablo channel so the summary endpoint's
// ensurePabloChannel() finds it instead of making an empty one.
async function createPabloChannel(userId: string): Promise<number> {
  const [ch] = await db
    .insert(chatChannelsTable)
    .values({ type: "pablo", name: "Pablo", user1Id: userId })
    .returning({ id: chatChannelsTable.id });
  return ch.id;
}

// Pre-create the org's company channel so ensureCompanyChannel() reuses it.
async function createCompanyChannel(orgId: number): Promise<number> {
  const [ch] = await db
    .insert(chatChannelsTable)
    .values({ type: "company", name: "Company", orgId })
    .returning({ id: chatChannelsTable.id });
  return ch.id;
}

async function createGlobalChannel(): Promise<number> {
  const [ch] = await db
    .insert(chatChannelsTable)
    .values({ type: "global", name: "Global" })
    .returning({ id: chatChannelsTable.id });
  createdGlobalChannelIds.push(ch.id);
  return ch.id;
}

async function getSummary(user: { id: string; email: string }) {
  actAs(user);
  return request(app).get("/api/comms/summary");
}

describe("GET /comms/summary — unread counts", () => {
  it("401 when not authenticated", async () => {
    const me = await createUser();
    actAs(me);
    setAuthed(false);
    const res = await request(app).get("/api/comms/summary");
    expect(res.status).toBe(401);
    setAuthed(true);
  });

  it("sums DMs + company + Pablo and EXCLUDES the public Global channel", async () => {
    const me = await createUser();
    const other = await createUser();
    const orgId = await createOrgWithMembers(me.id);

    const pabloId = await createPabloChannel(me.id);
    const companyId = await createCompanyChannel(orgId);
    const privateId = await createPrivateChannel(me.id, other.id);
    const globalId = await createGlobalChannel();

    await insertMessages(pabloId, me.id, 1);
    await insertMessages(companyId, other.id, 2);
    await insertMessages(privateId, other.id, 3);
    await insertMessages(globalId, other.id, 5); // must NOT be counted

    const res = await getSummary(me);
    expect(res.status).toBe(200);
    // 1 (Pablo) + 2 (company) + 3 (DM) = 6, Global's 5 excluded.
    expect(res.body.unreadMessages).toBe(6);
    expect(res.body.total).toBe(res.body.unreadMessages + res.body.pendingRequests);
  });

  it("advancing the read cursor reduces the unread count", async () => {
    const me = await createUser();
    const other = await createUser();
    await createPabloChannel(me.id);
    const privateId = await createPrivateChannel(me.id, other.id);
    const [, m2, m3] = await insertMessages(privateId, other.id, 3);

    const before = await getSummary(me);
    expect(before.body.unreadMessages).toBe(3);

    // Read up to the 2nd message — one message remains unread.
    actAs(me);
    const read1 = await request(app)
      .post(`/api/chat/channels/${privateId}/read`)
      .send({ lastMessageId: m2 });
    expect(read1.status).toBe(200);

    const mid = await getSummary(me);
    expect(mid.body.unreadMessages).toBe(1);

    // Read the last message — nothing left unread.
    actAs(me);
    const read2 = await request(app)
      .post(`/api/chat/channels/${privateId}/read`)
      .send({ lastMessageId: m3 });
    expect(read2.status).toBe(200);

    const after = await getSummary(me);
    expect(after.body.unreadMessages).toBe(0);
  });

  it("includes unread two-way SMS in the Comms total", async () => {
    const me = await createUser();
    await createPabloChannel(me.id);
    const [sms] = await db.insert(smsConversationsTable).values({
      userId: me.id,
      contactPhone: "+15550001111",
      contactName: "SMS Contact",
      unreadCount: 3,
    }).returning();
    const res = await getSummary(me);
    expect(res.status).toBe(200);
    expect(res.body.unreadSms).toBe(3);
    expect(res.body.total).toBe(res.body.unreadMessages + res.body.unreadSms + res.body.pendingRequests);
    await db.delete(smsConversationsTable).where(inArray(smsConversationsTable.id, [sms.id]));
  });
});

describe("GET /comms/summary — pending associate requests", () => {
  it("counts only INCOMING pending requests, not ones the caller initiated", async () => {
    const me = await createUser();
    const incomingFrom = await createUser();
    const iRequested = await createUser();
    await createPabloChannel(me.id);

    // Incoming: someone else requested me.
    const inPair = canonicalPair(incomingFrom.id, me.id);
    await db.insert(colleaguesTable).values({
      userAId: inPair.userAId,
      userBId: inPair.userBId,
      requesterId: incomingFrom.id,
      status: "pending",
    });
    // Outgoing: I requested someone else — must NOT count.
    const outPair = canonicalPair(me.id, iRequested.id);
    await db.insert(colleaguesTable).values({
      userAId: outPair.userAId,
      userBId: outPair.userBId,
      requesterId: me.id,
      status: "pending",
    });

    const res = await getSummary(me);
    expect(res.status).toBe(200);
    expect(res.body.pendingRequests).toBe(1);
  });

  it("drops to 0 after the incoming request is accepted", async () => {
    const me = await createUser();
    const requester = await createUser();
    await createPabloChannel(me.id);

    const pair = canonicalPair(requester.id, me.id);
    await db.insert(colleaguesTable).values({
      userAId: pair.userAId,
      userBId: pair.userBId,
      requesterId: requester.id,
      status: "pending",
    });

    const before = await getSummary(me);
    expect(before.body.pendingRequests).toBe(1);

    actAs(me);
    const accept = await request(app).post(`/api/colleagues/${requester.id}/accept`).send({});
    expect(accept.status).toBe(200);

    const after = await getSummary(me);
    expect(after.body.pendingRequests).toBe(0);
  });

  it("drops to 0 after the incoming request is declined", async () => {
    const me = await createUser();
    const requester = await createUser();
    await createPabloChannel(me.id);

    const pair = canonicalPair(requester.id, me.id);
    await db.insert(colleaguesTable).values({
      userAId: pair.userAId,
      userBId: pair.userBId,
      requesterId: requester.id,
      status: "pending",
    });

    const before = await getSummary(me);
    expect(before.body.pendingRequests).toBe(1);

    actAs(me);
    const decline = await request(app).post(`/api/colleagues/${requester.id}/decline`).send({});
    expect(decline.status).toBe(200);

    const after = await getSummary(me);
    expect(after.body.pendingRequests).toBe(0);
  });
});
