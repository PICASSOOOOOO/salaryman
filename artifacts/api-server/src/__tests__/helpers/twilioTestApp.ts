import express, { type Express } from "express";
import { randomUUID } from "crypto";
import {
  db,
  callHistoryTable,
  voicemailsTable,
  phoneNumbersTable,
  secretaryConfigTable,
  dialingSessionsTable,
  conferenceRoomsTable,
  callCenterAgentsTable,
  pabloOutboundCampaignsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import twilioRouter from "../../routes/twilio";

// A throwaway user, unique per test file. There are no hard FK constraints on
// the user_id columns (they're plain varchar), so we don't need to seed a
// `users` row — we just scope all created rows by this id and delete them after.
export const TEST_USER = {
  id: `test-twilio-${randomUUID()}`,
  email: "twilio-tester@example.test",
};

// Mutable auth state the injected middleware reads on every request. Tests flip
// `authed` to false to exercise the 401 path.
export const authState: { authed: boolean; user: { id: string; email: string } } = {
  authed: true,
  user: TEST_USER,
};

export function resetAuthState() {
  authState.authed = true;
  authState.user = TEST_USER;
}

// Build an Express app that mirrors the real mount: the twilio router lives
// under "/api" (its own paths are "/twilio/..."). A middleware injects the
// passport-style `req.isAuthenticated()` and `req.user` that the route auth
// guards depend on.
export function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => authState.authed;
    (req as any).user = authState.user;
    next();
  });
  app.use("/api", twilioRouter);
  return app;
}

// Remove every row this test file may have created, scoped to TEST_USER.id.
export async function cleanupTestData() {
  const id = TEST_USER.id;
  await Promise.allSettled([
    db.delete(callHistoryTable).where(eq(callHistoryTable.userId, id)),
    db.delete(voicemailsTable).where(eq(voicemailsTable.userId, id)),
    db.delete(phoneNumbersTable).where(eq(phoneNumbersTable.userId, id)),
    db.delete(secretaryConfigTable).where(eq(secretaryConfigTable.userId, id)),
    db.delete(dialingSessionsTable).where(eq(dialingSessionsTable.userId, id)),
    db.delete(conferenceRoomsTable).where(eq(conferenceRoomsTable.userId, id)),
    db.delete(callCenterAgentsTable).where(eq(callCenterAgentsTable.userId, id)),
    db.delete(pabloOutboundCampaignsTable).where(eq(pabloOutboundCampaignsTable.userId, id)),
  ]);
}

// Seed an owned call so call-control routes (mute/hold/transfer/hangup) pass
// their verifyCallOwnership() check. Returns the twilioCallSid used.
export async function seedOwnedCall(twilioCallSid: string, recipient = "+15551234567") {
  await db.insert(callHistoryTable).values({
    userId: TEST_USER.id,
    recipientNumber: recipient,
    twilioCallSid,
    status: "in-progress",
    direction: "outbound",
    callType: "conference",
    consentGiven: true,
  });
  return twilioCallSid;
}
