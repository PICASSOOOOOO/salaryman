import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "crypto";
import { db, contactsTable, contactInteractionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import toolsRouter from "../routes/tools";

const userId = `test-contact-health-${randomUUID()}`;
let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => true;
    (req as any).user = { id: userId };
    next();
  });
  app.use("/api", toolsRouter);
});

beforeEach(async () => {
  await db.delete(contactInteractionsTable).where(eq(contactInteractionsTable.userId, userId));
  await db.delete(contactsTable).where(eq(contactsTable.userId, userId));
});

afterAll(async () => {
  await db.delete(contactInteractionsTable).where(eq(contactInteractionsTable.userId, userId));
  await db.delete(contactsTable).where(eq(contactsTable.userId, userId));
});

describe("CRM phone health", () => {
  it("returns the latest outcome as a review flag and hides the call reference", async () => {
    const [contact] = await db.insert(contactsTable).values({
      userId,
      name: "Phone review test",
      phone: "+15550001234",
    }).returning();
    await db.insert(contactInteractionsTable).values([
      {
        userId,
        contactId: contact.id,
        type: "phone_health_ok",
        note: "A person answered earlier. [dialer-call:CAold]",
      },
      {
        userId,
        contactId: contact.id,
        type: "phone_health_review",
        note: "Voicemail detected. [dialer-call:CAnew]",
      },
    ]);

    const response = await request(app).get("/api/tools/contacts");

    expect(response.status).toBe(200);
    expect(response.body.contacts).toContainEqual(expect.objectContaining({
      id: contact.id,
      phoneHealth: expect.objectContaining({
        status: "review",
        note: "Voicemail detected.",
      }),
    }));
  });

  it("returns a successful reachability check after a later human answer", async () => {
    const [contact] = await db.insert(contactsTable).values({
      userId,
      name: "Reachable contact test",
      phone: "+15550005678",
    }).returning();
    await db.insert(contactInteractionsTable).values([
      {
        userId,
        contactId: contact.id,
        type: "phone_health_review",
        note: "Voicemail detected. [dialer-call:CAold]",
      },
      {
        userId,
        contactId: contact.id,
        type: "phone_health_ok",
        note: "A person answered. [dialer-call:CAnew]",
      },
    ]);

    const response = await request(app).get("/api/tools/contacts");

    expect(response.status).toBe(200);
    expect(response.body.contacts).toContainEqual(expect.objectContaining({
      id: contact.id,
      phoneHealth: expect.objectContaining({
        status: "ok",
        note: "A person answered.",
      }),
    }));
  });
});
