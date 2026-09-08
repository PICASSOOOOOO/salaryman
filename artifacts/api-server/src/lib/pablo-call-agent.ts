import {
  db,
  pabloCallSessionsTable,
  callHistoryTable,
  contactsTable,
  contactInteractionsTable,
  secretaryConfigTable,
  organizationsTable,
  orgMembersTable,
  type SecretaryConfig,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getOpenAiTextModel } from "./openai-models";

interface ConversationTurn {
  role: "caller" | "pablo" | "mila";
  text: string;
  timestamp: string;
}

interface ExtractedInfo {
  callerName?: string;
  company?: string;
  reason?: string;
  email?: string;
  phone?: string;
  urgency?: "low" | "medium" | "high";
  qualification?: string;
}

interface PabloAction {
  type: "respond" | "transfer" | "take_message" | "end_call" | "create_lead";
  response: string;
  transferTo?: string;
  extractedInfo?: ExtractedInfo;
}

const MEDICARE_CLUB_SCRIPT = `Hi... thank you so much for calling Medicare Club. My name is Mila, and I am an AI assistant here to help. This will just take a moment. Are you calling for sales... or do you need help with support?

SALES CALL FLOW:
Wonderful! Can I please get your full name... and your email address? I'll pass this information along to the team before connecting you.
Thank you so much! Please hold for just a moment while I transfer you to someone who can help.
(Transfer the call and pass collected information—name and email—to the agent for follow-up.)

SUPPORT CALL FLOW:
Got it! Can I please get your full name... and your email address, just in case we get cut off and need to follow up?
Thank you so much. Please hold while I connect you.

IMPORTANT RULES:
- Only collect name and email. Do NOT collect date of birth, member/provider status, or other personal data.
- Speak slowly and very clearly for ease of understanding.
- If the caller wants to speak with a human immediately, transfer right away without further questions.
- Callers aged 64-80 are the target audience. If a caller is over 80, politely let them know this program may not be the best fit.
- Keep intros and outros warm, polite, and tailored to Medicare Club's tone.`;

async function getOrgNameForUser(userId: string): Promise<string | null> {
  const rows = await db
    .select({ name: organizationsTable.name })
    .from(orgMembersTable)
    .innerJoin(organizationsTable, eq(orgMembersTable.orgId, organizationsTable.id))
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")))
    .limit(1);
  return rows[0]?.name ?? null;
}

function buildSystemPrompt(
  config: SecretaryConfig,
  direction: "inbound" | "outbound" | "screening",
  existingInfo: ExtractedInfo | null,
  turnCount: number,
  outboundScript?: string,
  orgName?: string | null,
): string {
  const personality = config.personality ?? "professional";
  const personalityDesc =
    personality === "friendly" ? "warm, conversational, and approachable" :
    personality === "assertive" ? "direct, efficient, and to-the-point" :
    personality === "custom" ? "following the custom personality defined in the greeting" :
    "formal, businesslike, and efficient";

  const qualQuestions = config.qualificationQuestions || "";
  const transferRules = config.transferRouting || "";
  const screening = config.screeningRules || "";
  const screeningScript = (config as SecretaryConfig & { screeningScript?: string | null }).screeningScript || "";

  const companyLabel = orgName ? ` for ${orgName}` : " for a business";

  let prompt = `You are Mila, an AI phone agent${companyLabel}. You are ${personalityDesc}.
You are handling a live phone call. Keep responses concise (under 40 words) and natural-sounding for voice.
Speak naturally and sound human — use pauses, filler words, and conversational tone. Never sound robotic.

DIRECTION: ${direction === "screening" ? "inbound" : direction}
TURN: ${turnCount + 1}

CALL RECORDING & DATA RETENTION — THE TRUTH:
- This call IS being recorded. Audio + a transcript + an AI summary are saved to the business's call log.
- Salaryman retains call recordings, transcripts, and interaction logs for up to 3 years. Users receive an email warning before call recordings expire.
- If the caller asks "is this recorded?" or "do you keep my data?" — answer YES, briefly and calmly: "Yes, this call is recorded for quality and compliance. Records are kept for up to ten years." Then continue.
- NEVER say "I don't record", "nothing is saved", or "your data is erased". That is FALSE.
- If a caller demands deletion, tell them you'll flag it and a human will follow up — do not promise immediate erasure.

`;

  const isMedicareClub = orgName && /medicare\s*club/i.test(orgName);
  const effectiveScreeningScript = isMedicareClub
    ? MEDICARE_CLUB_SCRIPT
    : screeningScript;

  if (direction === "screening") {
    if (isMedicareClub) {
      prompt += `MODE: MEDICARE CLUB INBOUND CALL SCREENING
You are Mila, the AI assistant for Medicare Club.
You handle Sales and Support calls exclusively for Medicare Club.
Follow the Medicare Club script below precisely. Speak slowly and very clearly.
Only collect the caller's name and email — do NOT ask for date of birth, member/provider status, or other personal data.
Callers aged 64-80 are the priority audience. If a caller is over 80, politely let them know this program may not be the best fit.
If the caller wants to speak with a human immediately, use [ACTION:TRANSFER] right away.
Once you have name + email, use [ACTION:TRANSFER] to route them to an agent.\n\n`;
    } else {
      prompt += `MODE: INBOUND CALL SCREENING
You are screening an inbound caller before transferring them to an available agent.
Your goal is to quickly qualify the caller within 2 minutes. Be efficient but warm.
Gather the caller's name, company, and reason for calling as fast as possible.
Once you have enough information (name + reason), use [ACTION:TRANSFER] to route them to an agent.
If the caller is spam, a robocall, or not a legitimate business inquiry, use [ACTION:END_CALL].
If the caller wants to leave a message, use [ACTION:TAKE_MESSAGE].
Do NOT keep the conversation going longer than necessary — screen and transfer quickly.\n\n`;
    }
    if (effectiveScreeningScript) {
      prompt += `SCREENING SCRIPT/GREETING:\n${effectiveScreeningScript}\n\n`;
    }
  }

  if (direction === "outbound" && outboundScript) {
    prompt += `OUTBOUND SCRIPT TO FOLLOW:\n${outboundScript}\n\n`;
    prompt += `Deliver the script naturally, adapting to the person's responses. Don't read it verbatim — have a conversation.\n\n`;
  }

  if (screening) {
    prompt += `SCREENING RULES:\n${screening}\n\n`;
  }

  if (qualQuestions) {
    prompt += `QUALIFICATION QUESTIONS (ask these during the conversation):\n${qualQuestions}\n\n`;
  }

  if (transferRules) {
    prompt += `TRANSFER ROUTING RULES:\n${transferRules}\n\n`;
  }

  if (existingInfo && Object.keys(existingInfo).length > 0) {
    prompt += `INFORMATION GATHERED SO FAR:\n${JSON.stringify(existingInfo, null, 2)}\n\n`;
  }

  prompt += `ACTIONS — include EXACTLY ONE of these tags at the END of your response:
[ACTION:RESPOND] — continue the conversation (default)
[ACTION:TRANSFER:number] — transfer to a specific phone number (e.g. [ACTION:TRANSFER:+15551234567])
[ACTION:TAKE_MESSAGE] — caller wants to leave a message, end call gracefully
[ACTION:END_CALL] — conversation is complete, say goodbye
[ACTION:CREATE_LEAD] — you've gathered enough info to create a CRM lead

Also extract any new caller information using these tags (include as many as apply):
[INFO:NAME=value]
[INFO:COMPANY=value]
[INFO:REASON=value]
[INFO:EMAIL=value]
[INFO:URGENCY=low|medium|high]
[INFO:QUALIFICATION=value]

Your spoken response should come BEFORE all tags. Tags will be stripped before speaking to the caller.`;

  return prompt;
}

function extractAllowedTransferNumbers(config: SecretaryConfig): string[] {
  const numbers: string[] = [];
  if (config.forwardToNumber) {
    numbers.push(config.forwardToNumber.replace(/\D/g, ""));
  }
  if (config.transferRouting) {
    const phoneMatches = config.transferRouting.match(/\+?\d[\d\s()-]{8,}/g);
    if (phoneMatches) {
      for (const m of phoneMatches) {
        const digits = m.replace(/\D/g, "");
        if (digits.length >= 10) numbers.push(digits);
      }
    }
  }
  return numbers;
}

function parseAction(response: string): PabloAction {
  const extracted: ExtractedInfo = {};

  const infoPatterns = {
    callerName: /\[INFO:NAME=([^\]]+)\]/i,
    company: /\[INFO:COMPANY=([^\]]+)\]/i,
    reason: /\[INFO:REASON=([^\]]+)\]/i,
    email: /\[INFO:EMAIL=([^\]]+)\]/i,
    urgency: /\[INFO:URGENCY=(low|medium|high)\]/i,
    qualification: /\[INFO:QUALIFICATION=([^\]]+)\]/i,
  };

  for (const [key, pattern] of Object.entries(infoPatterns)) {
    const match = response.match(pattern);
    if (match) {
      (extracted as Record<string, string>)[key] = match[1].trim();
    }
  }

  let cleanResponse = response
    .replace(/\[INFO:\w+=[^\]]*\]/gi, "")
    .replace(/\[ACTION:\w+[^\]]*\]/gi, "")
    .trim();

  if (!cleanResponse) {
    cleanResponse = "Thank you for calling. How can I help you?";
  }

  const transferMatch = response.match(/\[ACTION:TRANSFER:([^\]]+)\]/i);
  if (transferMatch) {
    const rawNumber = transferMatch[1].trim();
    const digits = rawNumber.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15 && /^\+?\d[\d\s()-]*$/.test(rawNumber)) {
      const e164 = digits.startsWith("1") && digits.length === 11 ? `+${digits}` : digits.length === 10 ? `+1${digits}` : `+${digits}`;
      return { type: "transfer", response: cleanResponse, transferTo: e164, extractedInfo: extracted };
    }
    return { type: "take_message", response: cleanResponse + " I'll take a message and have someone get back to you.", extractedInfo: extracted };
  }
  if (/\[ACTION:TRANSFER\]/i.test(response)) {
    return { type: "transfer", response: cleanResponse, extractedInfo: extracted };
  }
  if (/\[ACTION:TAKE_MESSAGE\]/i.test(response)) {
    return { type: "take_message", response: cleanResponse, extractedInfo: extracted };
  }
  if (/\[ACTION:END_CALL\]/i.test(response)) {
    return { type: "end_call", response: cleanResponse, extractedInfo: extracted };
  }
  if (/\[ACTION:CREATE_LEAD\]/i.test(response)) {
    return { type: "create_lead", response: cleanResponse, extractedInfo: extracted };
  }

  return { type: "respond", response: cleanResponse, extractedInfo: extracted };
}

export async function getOrCreateSession(
  userId: string,
  callSid: string,
  callerNumber: string,
  direction: "inbound" | "outbound" | "screening",
  callerName?: string,
) {
  const existing = await db
    .select()
    .from(pabloCallSessionsTable)
    .where(eq(pabloCallSessionsTable.twilioCallSid, callSid))
    .limit(1);

  if (existing[0]) return existing[0];

  const [session] = await db
    .insert(pabloCallSessionsTable)
    .values({
      userId,
      twilioCallSid: callSid,
      callerNumber,
      callerName: callerName ?? null,
      direction: direction === "screening" ? "inbound" : direction,
      status: "active",
      conversationJson: "[]",
    })
    .returning();

  return session;
}

export async function processPabloTurn(
  userId: string,
  callSid: string,
  callerSpeech: string,
  callerNumber: string,
  direction: "inbound" | "outbound" | "screening" = "inbound",
  outboundScript?: string,
): Promise<PabloAction> {
  const session = await getOrCreateSession(userId, callSid, callerNumber, direction);

  const configs = await db
    .select()
    .from(secretaryConfigTable)
    .where(eq(secretaryConfigTable.userId, userId))
    .limit(1);
  const config = configs[0] ?? ({
    personality: "professional",
    screeningRules: null,
    qualificationQuestions: null,
    transferRouting: null,
  } as SecretaryConfig);

  const conversation: ConversationTurn[] = JSON.parse(session.conversationJson ?? "[]");
  const existingInfo: ExtractedInfo | null = session.extractedInfoJson
    ? JSON.parse(session.extractedInfoJson)
    : null;

  conversation.push({
    role: "caller",
    text: callerSpeech,
    timestamp: new Date().toISOString(),
  });

  const orgName = await getOrgNameForUser(userId);

  const systemPrompt = buildSystemPrompt(
    config,
    direction,
    existingInfo,
    session.turnCount,
    outboundScript,
    orgName,
  );

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
  ];

  for (const turn of conversation.slice(-10)) {
    messages.push({
      role: turn.role === "caller" ? "user" : "assistant",
      content: turn.text,
    });
  }

  const completion = await openai.chat.completions.create({
    model: getOpenAiTextModel(),
    max_completion_tokens: 300,
    messages,
  });

  const rawResponse = completion.choices[0]?.message?.content?.trim() ?? "Thank you for calling. Is there anything else I can help with?";
  const action = parseAction(rawResponse);

  if (action.type === "transfer" && action.transferTo) {
    const allowedNumbers = extractAllowedTransferNumbers(config);
    if (allowedNumbers.length > 0) {
      const normalizedTarget = action.transferTo.replace(/\D/g, "");
      const isAllowed = allowedNumbers.some((n) => normalizedTarget.endsWith(n) || n.endsWith(normalizedTarget));
      if (!isAllowed) {
        action.type = "take_message";
        action.response = action.response + " I'll take a message and have the right person get back to you.";
        action.transferTo = undefined;
      }
    } else if (!config.forwardToNumber) {
      action.type = "take_message";
      action.response = action.response + " I'll take a message and have someone get back to you shortly.";
      action.transferTo = undefined;
    } else {
      action.transferTo = config.forwardToNumber;
    }
  }

  conversation.push({
    role: "mila",
    text: action.response,
    timestamp: new Date().toISOString(),
  });

  const mergedInfo: ExtractedInfo = { ...existingInfo, ...action.extractedInfo };

  await db
    .update(pabloCallSessionsTable)
    .set({
      conversationJson: JSON.stringify(conversation),
      extractedInfoJson: JSON.stringify(mergedInfo),
      turnCount: session.turnCount + 1,
      callerName: mergedInfo.callerName ?? session.callerName,
      ...(action.type === "end_call" || action.type === "take_message"
        ? { status: "completed", outcome: action.type, endedAt: new Date() }
        : {}),
    })
    .where(eq(pabloCallSessionsTable.id, session.id));

  if (action.type === "create_lead" && mergedInfo.callerName) {
    try {
      await createOrUpdateContact(userId, callerNumber, mergedInfo, callSid);
    } catch (err) {
      console.error("[Pablo] CRM update error:", err);
    }
  }

  await updateCallHistory(userId, callSid, conversation, mergedInfo);

  return action;
}

async function createOrUpdateContact(
  userId: string,
  callerNumber: string,
  info: ExtractedInfo,
  callSid: string,
) {
  const existing = await db
    .select()
    .from(contactsTable)
    .where(and(eq(contactsTable.userId, userId), eq(contactsTable.phone, callerNumber)))
    .limit(1);

  let contactId: number;

  if (existing[0]) {
    contactId = existing[0].id;
    await db
      .update(contactsTable)
      .set({
        ...(info.callerName && { name: info.callerName }),
        ...(info.company && { company: info.company }),
        ...(info.email && { email: info.email }),
      })
      .where(eq(contactsTable.id, contactId));
  } else {
    const [contact] = await db
      .insert(contactsTable)
      .values({
        userId,
        name: info.callerName || "Unknown Caller",
        phone: callerNumber,
        email: info.email || "",
        company: info.company || "",
        tag: "pablo-lead",
        dealStage: info.urgency === "high" ? "qualified" : "new",
      })
      .returning();
    contactId = contact.id;
  }

  await db.insert(contactInteractionsTable).values({
    contactId,
    userId,
    type: "call",
    note: `Mila call — Reason: ${info.reason || "N/A"}. Qualification: ${info.qualification || "N/A"}. (Call SID: ${callSid})`,
  });

  await db
    .update(pabloCallSessionsTable)
    .set({ contactId })
    .where(eq(pabloCallSessionsTable.twilioCallSid, callSid));

  await db
    .update(callHistoryTable)
    .set({ contactId })
    .where(and(eq(callHistoryTable.twilioCallSid, callSid), eq(callHistoryTable.userId, userId)));
}

async function updateCallHistory(
  userId: string,
  callSid: string,
  conversation: ConversationTurn[],
  info: ExtractedInfo,
) {
  const transcript = conversation
    .map((t) => `${t.role === "caller" ? "Caller" : "Mila"}: ${t.text}`)
    .join("\n");

  await db
    .update(callHistoryTable)
    .set({
      transcript,
      callType: "pablo_agent",
      callerName: info.callerName ?? undefined,
      notes: `Mila Agent Call\nCaller: ${info.callerName || "Unknown"}\nCompany: ${info.company || "N/A"}\nReason: ${info.reason || "N/A"}\nUrgency: ${info.urgency || "N/A"}`,
    })
    .where(and(eq(callHistoryTable.twilioCallSid, callSid), eq(callHistoryTable.userId, userId)));
}

export async function generateCallSummaryForSession(callSid: string) {
  const sessions = await db
    .select()
    .from(pabloCallSessionsTable)
    .where(eq(pabloCallSessionsTable.twilioCallSid, callSid))
    .limit(1);

  if (!sessions[0]) return;
  const session = sessions[0];
  const conversation: ConversationTurn[] = JSON.parse(session.conversationJson ?? "[]");
  if (conversation.length < 2) return;

  const transcript = conversation
    .map((t) => `${t.role === "caller" ? "Caller" : "Mila"}: ${t.text}`)
    .join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      max_completion_tokens: 300,
      messages: [
        {
          role: "system",
          content: "Summarize this AI phone agent call in 2-3 sentences. Focus on caller identity, purpose, outcome, and any action items.",
        },
        { role: "user", content: transcript },
      ],
    });

    const summary = completion.choices[0]?.message?.content?.trim() ?? "";
    if (summary) {
      await db
        .update(callHistoryTable)
        .set({ summary })
        .where(and(
          eq(callHistoryTable.twilioCallSid, callSid),
          eq(callHistoryTable.userId, session.userId),
        ));
    }
  } catch (err) {
    console.error("[Pablo] Summary generation error:", err);
  }
}
