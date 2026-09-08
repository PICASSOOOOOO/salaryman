import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { db, chatChannelsTable, chatMessagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  buildApp,
  actAs,
  setAuthed,
  createUser,
  createOrgWithMembers,
  createFile,
  createPrivateChannel,
  makeAccepted,
  cleanupTestData,
} from "./helpers/commsTestApp";

let app: Express;

beforeAll(() => {
  app = buildApp();
});
afterAll(async () => {
  await cleanupTestData();
});

describe("POST /chat/channels/:id/send (attachments)", () => {
  it("401 when not authenticated", async () => {
    const me = await createUser();
    actAs(me);
    setAuthed(false);
    const res = await request(app).post("/api/chat/channels/1/send").send({ content: "hi" });
    expect(res.status).toBe(401);
  });

  it("400 when neither content nor attachment is provided", async () => {
    const a = await createUser();
    const b = await createUser();
    await makeAccepted(a.id, b.id);
    const channelId = await createPrivateChannel(a.id, b.id);
    actAs(a);
    const res = await request(app).post(`/api/chat/channels/${channelId}/send`).send({});
    expect(res.status).toBe(400);
  });

  it("sends a file to an accepted associate in a private channel", async () => {
    const sender = await createUser();
    const recipient = await createUser();
    await makeAccepted(sender.id, recipient.id);
    const channelId = await createPrivateChannel(sender.id, recipient.id);
    const fileId = await createFile(sender.id, "deck.pdf");

    actAs(sender);
    const res = await request(app)
      .post(`/api/chat/channels/${channelId}/send`)
      .send({ content: "see attached", attachmentFileId: fileId });
    expect(res.status).toBe(200);
    expect(res.body.message.attachmentFileId).toBe(fileId);
    expect(res.body.message.attachmentName).toBe("deck.pdf");
    expect(res.body.message.attachmentObjectPath).toBeTruthy();
  });

  it("403 when sending a file to a non-associate in a private channel", async () => {
    const sender = await createUser();
    const stranger = await createUser();
    // No accepted relationship and no shared org.
    const channelId = await createPrivateChannel(sender.id, stranger.id);
    const fileId = await createFile(sender.id);

    actAs(sender);
    const res = await request(app)
      .post(`/api/chat/channels/${channelId}/send`)
      .send({ attachmentFileId: fileId });
    expect(res.status).toBe(403);
  });

  it("403 when attaching a file the sender does not own", async () => {
    const sender = await createUser();
    const recipient = await createUser();
    await makeAccepted(sender.id, recipient.id);
    const channelId = await createPrivateChannel(sender.id, recipient.id);
    const foreignFileId = await createFile(recipient.id);

    actAs(sender);
    const res = await request(app)
      .post(`/api/chat/channels/${channelId}/send`)
      .send({ attachmentFileId: foreignFileId });
    expect(res.status).toBe(403);
  });

  it("allows a company-channel member to attach their own file", async () => {
    const owner = await createUser();
    const member = await createUser();
    const orgId = await createOrgWithMembers(owner.id, [member.id]);
    const [ch] = await db
      .insert(chatChannelsTable)
      .values({ type: "company", name: "Co", orgId })
      .returning({ id: chatChannelsTable.id });
    const fileId = await createFile(member.id, "memo.pdf");

    actAs(member);
    const res = await request(app)
      .post(`/api/chat/channels/${ch.id}/send`)
      .send({ attachmentFileId: fileId });
    expect(res.status).toBe(200);
    expect(res.body.message.attachmentFileId).toBe(fileId);
  });
});

describe("GET /chat/channels/:id/attachments/:messageId/download", () => {
  it("lets a recipient past the permission gate (404 only because no file row)", async () => {
    const sender = await createUser();
    const recipient = await createUser();
    await makeAccepted(sender.id, recipient.id);
    const channelId = await createPrivateChannel(sender.id, recipient.id);
    // A message with NO attachment: the recipient passes the membership check
    // and reaches the "Attachment not found" branch (proves access is allowed).
    const [msg] = await db
      .insert(chatMessagesTable)
      .values({ channelId, senderUserId: sender.id, senderName: "Sender", content: "no file" })
      .returning({ id: chatMessagesTable.id });

    actAs(recipient);
    const res = await request(app)
      .get(`/api/chat/channels/${channelId}/attachments/${msg.id}/download`)
      .send();
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Attachment not found");
  });

  it("403 for a user who is not a participant of the private channel", async () => {
    const sender = await createUser();
    const recipient = await createUser();
    const outsider = await createUser();
    await makeAccepted(sender.id, recipient.id);
    const channelId = await createPrivateChannel(sender.id, recipient.id);
    const [msg] = await db
      .insert(chatMessagesTable)
      .values({ channelId, senderUserId: sender.id, senderName: "Sender", content: "hi" })
      .returning({ id: chatMessagesTable.id });

    actAs(outsider);
    const res = await request(app)
      .get(`/api/chat/channels/${channelId}/attachments/${msg.id}/download`)
      .send();
    expect(res.status).toBe(403);
  });

  it("404 when the channel does not exist", async () => {
    const me = await createUser();
    actAs(me);
    const res = await request(app)
      .get(`/api/chat/channels/99999999/attachments/1/download`)
      .send();
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Channel not found");
  });
});
