import type { PlatformType } from "@workspace/db";
import { decryptCredentials } from "./bot-crypto";

export interface IncomingMessage {
  platform: PlatformType;
  externalUserId: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface OutgoingMessage {
  text: string;
  parseMode?: "markdown" | "html" | "plain";
  metadata?: Record<string, unknown>;
}

export interface PlatformConnector {
  platform: PlatformType;
  start(botId: number, encryptedCredentials: string, onMessage: (msg: IncomingMessage) => Promise<void>): Promise<void>;
  stop(botId: number): Promise<void>;
  send(botId: number, externalUserId: string, message: OutgoingMessage): Promise<void>;
  isActive(botId: number): boolean;
}

const activeTelegramBots = new Map<number, { stop: () => void }>();
const activeWhatsappBots = new Set<number>();

export const telegramConnector: PlatformConnector = {
  platform: "telegram",

  async start(botId, encryptedCredentials, onMessage) {
    if (activeTelegramBots.has(botId)) return;

    const token = decryptCredentials(encryptedCredentials).trim();
    if (!token) throw new Error("Telegram bot token is required");

    const POLL_INTERVAL = 3000;
    let offset = 0;
    let running = true;

    try {
      const infoRes = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=-1&limit=1`);
      const infoData = await infoRes.json() as { ok: boolean; result?: Array<{ update_id: number }> };
      if (infoData.ok && infoData.result && infoData.result.length > 0) {
        offset = infoData.result[infoData.result.length - 1].update_id + 1;
      }
    } catch {}

    const poll = async () => {
      while (running) {
        try {
          const res = await fetch(
            `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=30&allowed_updates=["message"]`
          );
          const data = await res.json() as { ok: boolean; result?: Array<{ update_id: number; message?: { chat: { id: number }; from?: { id: number; username?: string }; text?: string } }> };
          if (data.ok && data.result) {
            for (const update of data.result) {
              offset = update.update_id + 1;
              if (update.message?.text) {
                await onMessage({
                  platform: "telegram",
                  externalUserId: String(update.message.chat.id),
                  text: update.message.text,
                  metadata: { chatId: update.message.chat.id, from: update.message.from },
                });
              }
            }
          }
        } catch (err) {
          console.error(`[Telegram Bot ${botId}] polling error:`, err);
        }
        if (running) await new Promise(r => setTimeout(r, POLL_INTERVAL));
      }
    };

    poll();
    activeTelegramBots.set(botId, { stop: () => { running = false; } });
  },

  async stop(botId) {
    const entry = activeTelegramBots.get(botId);
    if (entry) {
      entry.stop();
      activeTelegramBots.delete(botId);
    }
  },

  async send(botId, externalUserId, message) {
    const { db, botPlatformConnectionsTable } = await import("@workspace/db");
    const { eq, and } = await import("drizzle-orm");
    const [conn] = await db
      .select()
      .from(botPlatformConnectionsTable)
      .where(and(eq(botPlatformConnectionsTable.botId, botId), eq(botPlatformConnectionsTable.platform, "telegram")));
    if (!conn) throw new Error("No Telegram connection found");

    const token = decryptCredentials(conn.credentials).trim();
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: externalUserId,
        text: message.text,
        parse_mode: message.parseMode === "markdown" ? "MarkdownV2" : message.parseMode === "html" ? "HTML" : undefined,
      }),
    });
  },

  isActive(botId) {
    return activeTelegramBots.has(botId);
  },
};

export const whatsappConnector: PlatformConnector = {
  platform: "whatsapp",

  async start(botId, _credentials, _onMessage) {
    activeWhatsappBots.add(botId);
  },

  async stop(botId) {
    activeWhatsappBots.delete(botId);
  },

  async send(botId, externalUserId, message) {
    const { db, botPlatformConnectionsTable } = await import("@workspace/db");
    const { eq, and } = await import("drizzle-orm");
    const [conn] = await db
      .select()
      .from(botPlatformConnectionsTable)
      .where(and(eq(botPlatformConnectionsTable.botId, botId), eq(botPlatformConnectionsTable.platform, "whatsapp")));
    if (!conn) throw new Error("No WhatsApp connection found");

    let creds: { accountSid?: string; authToken?: string; fromNumber?: string };
    try {
      creds = JSON.parse(decryptCredentials(conn.credentials));
    } catch {
      throw new Error("Invalid WhatsApp credentials format");
    }

    const accountSid = creds.accountSid || process.env.TWILIO_ACCOUNT_SID;
    const authToken = creds.authToken || process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = creds.fromNumber;
    if (!accountSid || !authToken || !fromNumber) throw new Error("WhatsApp/Twilio credentials incomplete");

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const body = new URLSearchParams({
      To: `whatsapp:${externalUserId}`,
      From: `whatsapp:${fromNumber}`,
      Body: message.text,
    });

    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
  },

  isActive(botId) {
    return activeWhatsappBots.has(botId);
  },
};

const connectorRegistry = new Map<PlatformType, PlatformConnector>();
connectorRegistry.set("telegram", telegramConnector);
connectorRegistry.set("whatsapp", whatsappConnector);

export function getConnector(platform: PlatformType): PlatformConnector | undefined {
  return connectorRegistry.get(platform);
}

export function registerConnector(connector: PlatformConnector) {
  connectorRegistry.set(connector.platform, connector);
}

export function getAllConnectors(): PlatformConnector[] {
  return Array.from(connectorRegistry.values());
}
