import { Router, type IRouter } from "express";
import { db, appointmentsTable } from "@workspace/db";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getOpenAiTextModel } from "../lib/openai-models";
import { getUncachableResendClient } from "../lib/resend";

const router: IRouter = Router();

function requireAuth(req: any, res: any): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

router.get("/calendar/appointments", async (req, res) => {
  if (!requireAuth(req, res)) return;

  const { from, to } = req.query as { from?: string; to?: string };

  try {
    let query = db
      .select()
      .from(appointmentsTable)
      .where(eq(appointmentsTable.userId, req.user!.id))
      .$dynamic();

    if (from && to) {
      query = db
        .select()
        .from(appointmentsTable)
        .where(
          and(
            eq(appointmentsTable.userId, req.user!.id),
            gte(appointmentsTable.startAt, new Date(from)),
            lte(appointmentsTable.startAt, new Date(to))
          )
        )
        .$dynamic();
    }

    const rows = await query.orderBy(desc(appointmentsTable.startAt));
    res.json({ appointments: rows });
  } catch (err) {
    console.error("calendar GET error:", err);
    res.status(500).json({ error: "Failed to fetch appointments" });
  }
});

router.post("/calendar/appointments", async (req, res) => {
  if (!requireAuth(req, res)) return;

  const { title, description = "", location = "", startAt, endAt, reminderMinutes = 15, meetingRoomCode } =
    req.body as {
      title: string;
      description?: string;
      location?: string;
      startAt: string;
      endAt: string;
      reminderMinutes?: number;
      meetingRoomCode?: string;
    };

  if (!title?.trim()) {
    res.status(400).json({ error: "Title is required" });
    return;
  }
  if (!startAt || !endAt) {
    res.status(400).json({ error: "Start and end times are required" });
    return;
  }

  try {
    const [record] = await db
      .insert(appointmentsTable)
      .values({
        userId: req.user!.id,
        title: title.trim(),
        description,
        location,
        startAt: new Date(startAt),
        endAt: new Date(endAt),
        reminderMinutes: Number(reminderMinutes),
        ...(meetingRoomCode ? { meetingRoomCode } : {}),
      })
      .returning();

    res.status(201).json({ appointment: record });
  } catch (err) {
    console.error("calendar POST error:", err);
    res.status(500).json({ error: "Failed to create appointment" });
  }
});

router.put("/calendar/appointments/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;

  const id = Number(req.params.id);
  const { title, description, location, startAt, endAt, reminderMinutes, meetingRoomCode } =
    req.body as {
      title?: string;
      description?: string;
      location?: string;
      startAt?: string;
      endAt?: string;
      reminderMinutes?: number;
      meetingRoomCode?: string | null;
    };

  try {
    const existing = await db
      .select()
      .from(appointmentsTable)
      .where(and(eq(appointmentsTable.id, id), eq(appointmentsTable.userId, req.user!.id)));

    if (existing.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const updates: Partial<typeof appointmentsTable.$inferInsert> & { updatedAt?: Date } = {
      updatedAt: new Date(),
    };
    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description;
    if (location !== undefined) updates.location = location;
    if (startAt !== undefined) updates.startAt = new Date(startAt);
    if (endAt !== undefined) updates.endAt = new Date(endAt);
    if (reminderMinutes !== undefined) updates.reminderMinutes = Number(reminderMinutes);
    if (meetingRoomCode !== undefined) (updates as any).meetingRoomCode = meetingRoomCode;

    const [updated] = await db
      .update(appointmentsTable)
      .set(updates)
      .where(and(eq(appointmentsTable.id, id), eq(appointmentsTable.userId, req.user!.id)))
      .returning();

    res.json({ appointment: updated });
  } catch (err) {
    console.error("calendar PUT error:", err);
    res.status(500).json({ error: "Failed to update appointment" });
  }
});

router.delete("/calendar/appointments/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;

  const id = Number(req.params.id);

  try {
    const deleted = await db
      .delete(appointmentsTable)
      .where(and(eq(appointmentsTable.id, id), eq(appointmentsTable.userId, req.user!.id)))
      .returning();

    if (deleted.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("calendar DELETE error:", err);
    res.status(500).json({ error: "Failed to delete appointment" });
  }
});

router.post("/calendar/appointments/:id/send-confirmation", async (req, res) => {
  if (!requireAuth(req, res)) return;

  const id = Number(req.params.id);
  const { email } = req.body as { email: string };

  if (!email) {
    res.status(400).json({ error: "Email required" });
    return;
  }

  try {
    const [appt] = await db
      .select()
      .from(appointmentsTable)
      .where(and(eq(appointmentsTable.id, id), eq(appointmentsTable.userId, req.user!.id)));

    if (!appt) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }

    const startStr = new Date(appt.startAt).toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });

    const endStr = new Date(appt.endAt).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });

    const html = `
<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: 'Courier New', monospace; background: #030803; color: #00ff41; margin: 0; padding: 24px; }
.container { max-width: 560px; margin: 0 auto; border: 1px solid rgba(0,255,65,0.4); padding: 32px; background: #030803; }
h1 { color: #00ff41; font-size: 1.2rem; letter-spacing: 0.15em; text-transform: uppercase; border-bottom: 1px solid rgba(0,255,65,0.25); padding-bottom: 12px; }
.field { margin: 12px 0; }
.label { color: rgba(0,255,65,0.5); font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; }
.value { color: #00ff41; font-size: 0.95rem; margin-top: 2px; }
.footer { margin-top: 28px; color: rgba(0,255,65,0.35); font-size: 0.7rem; border-top: 1px solid rgba(0,255,65,0.15); padding-top: 12px; }
</style>
</head>
<body>
<div class="container">
<h1>[ CHRONO-4 APPOINTMENT CONFIRMED ]</h1>
<div class="field"><div class="label">Mission</div><div class="value">${appt.title}</div></div>
${appt.description ? `<div class="field"><div class="label">Notes</div><div class="value">${appt.description}</div></div>` : ""}
${appt.location ? `<div class="field"><div class="label">Location</div><div class="value">${appt.location}</div></div>` : ""}
<div class="field"><div class="label">Start</div><div class="value">${startStr}</div></div>
<div class="field"><div class="label">End</div><div class="value">${endStr}</div></div>
<div class="field"><div class="label">Reminder</div><div class="value">${appt.reminderMinutes} minutes before</div></div>
<div class="footer">Sent by PABLO CORP · CHRONO-4 SCHEDULING MODULE</div>
</div>
</body>
</html>`;

    const { client, fromEmail } = await getUncachableResendClient();
    const { error } = await client.emails.send({
      from: fromEmail,
      to: [email],
      subject: `[CONFIRMED] ${appt.title}`,
      html,
    });

    if (error) {
      res.status(500).json({ error: `Email failed: ${error.message}` });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("confirmation email error:", err);
    res.status(500).json({ error: "Failed to send confirmation" });
  }
});

router.post("/calendar/pablo/query", async (req, res) => {
  if (!requireAuth(req, res)) return;

  const { message, businessMemory = "" } = req.body as {
    message: string;
    businessMemory?: string;
  };

  if (!message?.trim()) {
    res.status(400).json({ error: "Message required" });
    return;
  }

  try {
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const upcomingAppts = await db
      .select()
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.userId, req.user!.id),
          gte(appointmentsTable.startAt, now),
          lte(appointmentsTable.startAt, weekFromNow)
        )
      )
      .orderBy(appointmentsTable.startAt);

    const apptSummary =
      upcomingAppts.length > 0
        ? upcomingAppts
            .map(
              (a) =>
                `- "${a.title}" on ${new Date(a.startAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}${a.location ? ` @ ${a.location}` : ""}`
            )
            .join("\n")
        : "No upcoming appointments in the next 7 days.";

    const systemPrompt = `You are PABLO, a scheduling assistant helping the user manage their calendar. You are warm, direct, and efficient.

CURRENT DATE/TIME: ${now.toLocaleString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}

USER'S UPCOMING APPOINTMENTS (next 7 days):
${apptSummary}

${businessMemory ? `WHAT YOU KNOW ABOUT THIS USER:\n${businessMemory}` : ""}

Your capabilities on the Calendar page:
- Users can create, edit, and delete appointments
- View by month, week, or day
- Set reminders (browser notifications)
- Send confirmation emails

If the user asks to schedule or create an appointment, respond with a confirmation of what they want to create and include an action tag to navigate to the calendar page.

When answering "what's on my calendar" or similar: list the upcoming appointments clearly.

ACTION TAG FORMAT (include at END only when navigating to calendar):
<action>{"type":"navigate","to":"/calendar","label":"Open Calendar","description":"Your schedule is ready"}</action>

Rules:
- Casual, warm tone — like a smart assistant
- Short responses (2-4 sentences)
- Only one action tag per response`;

    const completion = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      max_completion_tokens: 400,
      stream: false,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
    });

    const response = completion.choices[0]?.message?.content?.trim() ?? "Signal lost.";
    res.json({ response });
  } catch (err) {
    console.error("calendar pablo query error:", err);
    res.status(500).json({ error: "Failed to query calendar" });
  }
});

export default router;
