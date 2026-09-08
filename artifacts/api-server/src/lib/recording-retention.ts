import { callHistoryTable, db, usersTable } from "@workspace/db";
import { and, eq, gt, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import twilio from "twilio";
import { ObjectStorageService } from "./objectStorage";
import { getUncachableResendClient } from "./resend";

const WARNING_DAYS = 30;

type ExpiringCall = {
  id: number;
  userId: string;
  email: string | null;
  recordingUrl: string | null;
  recordingSid: string | null;
  recordingRetainUntil: Date | null;
};

async function notifyExpiringRecordings(now: Date): Promise<number> {
  const warningCutoff = new Date(now.getTime() + WARNING_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: callHistoryTable.id,
      userId: callHistoryTable.userId,
      email: usersTable.email,
      recordingUrl: callHistoryTable.recordingUrl,
      recordingSid: callHistoryTable.recordingSid,
      recordingRetainUntil: callHistoryTable.recordingRetainUntil,
    })
    .from(callHistoryTable)
    .leftJoin(usersTable, eq(usersTable.id, callHistoryTable.userId))
    .where(and(
      isNotNull(callHistoryTable.recordingUrl),
      isNotNull(callHistoryTable.recordingRetainUntil),
      isNull(callHistoryTable.recordingExpiryNotifiedAt),
      gt(callHistoryTable.recordingRetainUntil, now),
      lte(callHistoryTable.recordingRetainUntil, warningCutoff),
    ));

  const byUser = new Map<string, ExpiringCall[]>();
  for (const row of rows) {
    const group = byUser.get(row.userId) ?? [];
    group.push(row);
    byUser.set(row.userId, group);
  }

  let notified = 0;
  for (const calls of byUser.values()) {
    const email = calls[0]?.email;
    if (!email) continue;
    const earliest = calls
      .map((call) => call.recordingRetainUntil)
      .filter((date): date is Date => !!date)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const { client, fromEmail } = await getUncachableResendClient();
    await client.emails.send({
      from: fromEmail,
      to: email,
      subject: `${calls.length} SALARYMAN call recording${calls.length === 1 ? "" : "s"} expire soon`,
      text: [
        `${calls.length} call recording${calls.length === 1 ? "" : "s"} will be permanently deleted starting ${earliest?.toLocaleDateString() ?? "within 30 days"}.`,
        "Open SALARYMAN, go to Phone > Recordings, and download anything you need to keep.",
        "Recordings are retained for a maximum of three years.",
      ].join("\n\n"),
      html: `<p><strong>${calls.length} call recording${calls.length === 1 ? "" : "s"} expire soon.</strong></p><p>Permanent deletion starts ${earliest?.toLocaleDateString() ?? "within 30 days"}.</p><p>Open SALARYMAN and go to <strong>Phone &gt; Recordings</strong> to download anything you need to keep.</p><p>Recordings are retained for a maximum of three years.</p>`,
    });
    await db
      .update(callHistoryTable)
      .set({ recordingExpiryNotifiedAt: now })
      .where(inArray(callHistoryTable.id, calls.map((call) => call.id)));
    notified += calls.length;
  }
  return notified;
}

async function deleteExpiredRecordings(now: Date): Promise<number> {
  const rows = await db
    .select({
      id: callHistoryTable.id,
      recordingUrl: callHistoryTable.recordingUrl,
      recordingSid: callHistoryTable.recordingSid,
    })
    .from(callHistoryTable)
    .where(and(
      isNotNull(callHistoryTable.recordingUrl),
      isNotNull(callHistoryTable.recordingRetainUntil),
      lte(callHistoryTable.recordingRetainUntil, now),
    ));

  const objectStorage = new ObjectStorageService();
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioClient = accountSid && authToken ? twilio(accountSid, authToken) : null;

  let deleted = 0;
  for (const row of rows) {
    if (row.recordingUrl?.startsWith("/objects/")) {
      const removed = await objectStorage.deleteObject(row.recordingUrl);
      if (!removed) continue;
    } else if (row.recordingSid && twilioClient) {
      await twilioClient.recordings(row.recordingSid).remove();
    } else {
      continue;
    }
    await db
      .update(callHistoryTable)
      .set({ recordingUrl: null, recordingSid: null })
      .where(eq(callHistoryTable.id, row.id));
    deleted++;
  }
  return deleted;
}

export async function runRecordingRetentionSweep(now = new Date()): Promise<{ notified: number; deleted: number }> {
  await db.execute(sql`
    UPDATE call_history
       SET recording_retain_until = started_at + interval '1095 days',
           recording_expiry_notified_at = CASE
             WHEN recording_retain_until IS DISTINCT FROM started_at + interval '1095 days'
             THEN NULL
             ELSE recording_expiry_notified_at
           END
     WHERE recording_url IS NOT NULL
       AND recording_retain_until IS DISTINCT FROM started_at + interval '1095 days'
  `);
  const notified = await notifyExpiringRecordings(now);
  const deleted = await deleteExpiredRecordings(now);
  return { notified, deleted };
}