import type { PlatformConnector, IncomingMessage, OutgoingMessage } from "./bot-connector-types";
import { decryptCredentials } from "./bot-crypto";

const activeDiscordBots = new Map<number, { stop: () => void; token: string }>();

export const discordConnector: PlatformConnector = {
  platform: "discord",

  async start(botId, encryptedCredentials, onMessage) {
    if (activeDiscordBots.has(botId)) return;

    let creds: { botToken?: string; guildId?: string; channelIds?: string[] };
    try {
      const raw = decryptCredentials(encryptedCredentials).trim();
      creds = JSON.parse(raw);
    } catch {
      creds = { botToken: decryptCredentials(encryptedCredentials).trim() };
    }

    const token = creds.botToken;
    if (!token) throw new Error("Discord bot token is required");

    const POLL_INTERVAL = 5000;
    let running = true;
    const processedMessages = new Set<string>();
    const channelTimestamps = new Map<string, string>();

    const pollChannelMessages = async (channelId: string, guildId: string | null) => {
      const msgsRes = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages?limit=10`,
        { headers: { Authorization: `Bot ${token}` } }
      );
      if (!msgsRes.ok) return;
      const messages = await msgsRes.json() as Array<{
        id: string;
        content: string;
        author: { id: string; bot?: boolean; username: string };
        timestamp: string;
      }>;

      const channelLastTs = channelTimestamps.get(channelId) || new Date().toISOString();

      for (const msg of messages.reverse()) {
        if (msg.author.bot) continue;
        if (processedMessages.has(msg.id)) continue;
        if (msg.timestamp <= channelLastTs) continue;
        processedMessages.add(msg.id);
        channelTimestamps.set(channelId, msg.timestamp);

        const isDm = !guildId;
        await onMessage({
          platform: "discord",
          externalUserId: isDm ? `dm:${msg.author.id}` : `${channelId}:${msg.author.id}`,
          text: msg.content,
          metadata: {
            channelId,
            guildId: guildId || undefined,
            messageId: msg.id,
            authorId: msg.author.id,
            authorUsername: msg.author.username,
            isDm,
          },
        });
      }
    };

    const configuredChannelIds = creds.channelIds || [];
    const configuredGuildId = creds.guildId || null;

    const fetchGatewayMessages = async () => {
      while (running) {
        try {
          const dmRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
            headers: { Authorization: `Bot ${token}` },
          });
          if (dmRes.ok) {
            const dmChannels = await dmRes.json() as Array<{ id: string; type: number }>;
            for (const dm of dmChannels.filter(c => c.type === 1).slice(0, 10)) {
              await pollChannelMessages(dm.id, null);
            }
          }

          if (configuredChannelIds.length > 0) {
            for (const channelId of configuredChannelIds) {
              await pollChannelMessages(channelId, configuredGuildId);
            }
          } else if (configuredGuildId) {
            const channelsRes = await fetch(`https://discord.com/api/v10/guilds/${configuredGuildId}/channels`, {
              headers: { Authorization: `Bot ${token}` },
            });
            if (channelsRes.ok) {
              const channels = await channelsRes.json() as Array<{ id: string; type: number }>;
              const textChannels = channels.filter(c => c.type === 0);
              for (const channel of textChannels) {
                await pollChannelMessages(channel.id, configuredGuildId);
              }
            }
          } else {
            const guildsRes = await fetch("https://discord.com/api/v10/users/@me/guilds", {
              headers: { Authorization: `Bot ${token}` },
            });
            if (guildsRes.ok) {
              const guilds = await guildsRes.json() as Array<{ id: string }>;
              for (const guild of guilds.slice(0, 5)) {
                const channelsRes = await fetch(`https://discord.com/api/v10/guilds/${guild.id}/channels`, {
                  headers: { Authorization: `Bot ${token}` },
                });
                if (!channelsRes.ok) continue;
                const channels = await channelsRes.json() as Array<{ id: string; type: number }>;
                const textChannels = channels.filter(c => c.type === 0);
                for (const channel of textChannels.slice(0, 3)) {
                  await pollChannelMessages(channel.id, guild.id);
                }
              }
            }
          }
        } catch (err) {
          console.error(`[Discord Bot ${botId}] polling error:`, err);
        }
        if (running) await new Promise(r => setTimeout(r, POLL_INTERVAL));
      }
    };

    fetchGatewayMessages();
    activeDiscordBots.set(botId, { stop: () => { running = false; }, token });
  },

  async stop(botId) {
    const entry = activeDiscordBots.get(botId);
    if (entry) {
      entry.stop();
      activeDiscordBots.delete(botId);
    }
  },

  async send(botId, externalUserId, message) {
    const entry = activeDiscordBots.get(botId);
    let token = entry?.token;

    if (!token) {
      const { db, botPlatformConnectionsTable } = await import("@workspace/db");
      const { eq, and } = await import("drizzle-orm");
      const [conn] = await db
        .select()
        .from(botPlatformConnectionsTable)
        .where(and(eq(botPlatformConnectionsTable.botId, botId), eq(botPlatformConnectionsTable.platform, "discord")));
      if (!conn) throw new Error("No Discord connection found");
      try {
        const creds = JSON.parse(decryptCredentials(conn.credentials));
        token = creds.botToken;
      } catch {
        token = decryptCredentials(conn.credentials).trim();
      }
    }

    if (!token) throw new Error("Discord bot token not available");

    let channelId: string;
    if (externalUserId.startsWith("dm:")) {
      const recipientId = externalUserId.split(":")[1];
      const dmRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
        method: "POST",
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ recipient_id: recipientId }),
      });
      if (!dmRes.ok) throw new Error("Failed to open DM channel");
      const dmChannel = await dmRes.json() as { id: string };
      channelId = dmChannel.id;
    } else {
      channelId = externalUserId.includes(":") ? externalUserId.split(":")[0] : externalUserId;
    }

    const sendRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: message.text }),
    });
    if (!sendRes.ok) {
      const errText = await sendRes.text().catch(() => "Unknown error");
      throw new Error(`Discord send failed (${sendRes.status}): ${errText}`);
    }
  },

  isActive(botId) {
    return activeDiscordBots.has(botId);
  },
};

const activeFacebookBots = new Set<number>();

export const facebookConnector: PlatformConnector = {
  platform: "facebook",

  async start(botId, encryptedCredentials, _onMessage) {
    if (activeFacebookBots.has(botId)) return;

    let creds: { pageAccessToken?: string; appId?: string; webhookUrl?: string };
    try {
      creds = JSON.parse(decryptCredentials(encryptedCredentials));
    } catch {
      creds = {};
    }

    if (creds.pageAccessToken && creds.appId && creds.webhookUrl) {
      try {
        const { db, botPlatformConnectionsTable } = await import("@workspace/db");
        const { eq, and } = await import("drizzle-orm");
        const [conn] = await db
          .select()
          .from(botPlatformConnectionsTable)
          .where(and(eq(botPlatformConnectionsTable.botId, botId), eq(botPlatformConnectionsTable.platform, "facebook")));

        const verifyToken = conn?.webhookSecret || "";

        const subscribeRes = await fetch(
          `https://graph.facebook.com/v19.0/${creds.appId}/subscriptions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${creds.pageAccessToken}`,
            },
            body: JSON.stringify({
              object: "page",
              callback_url: creds.webhookUrl,
              fields: "messages,messaging_postbacks,messaging_optins",
              verify_token: verifyToken,
            }),
          }
        );
        if (!subscribeRes.ok) {
          console.warn(`[Facebook Bot ${botId}] Webhook subscription failed:`, await subscribeRes.text().catch(() => ""));
        }

        await fetch(
          `https://graph.facebook.com/v19.0/me/subscribed_apps`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${creds.pageAccessToken}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ subscribed_fields: "messages,messaging_postbacks" }).toString(),
          }
        );
      } catch (err) {
        console.warn(`[Facebook Bot ${botId}] Subscription setup error:`, err);
      }
    }

    activeFacebookBots.add(botId);
  },

  async stop(botId) {
    activeFacebookBots.delete(botId);
  },

  async send(botId, externalUserId, message: OutgoingMessage) {
    const { db, botPlatformConnectionsTable } = await import("@workspace/db");
    const { eq, and } = await import("drizzle-orm");
    const [conn] = await db
      .select()
      .from(botPlatformConnectionsTable)
      .where(and(eq(botPlatformConnectionsTable.botId, botId), eq(botPlatformConnectionsTable.platform, "facebook")));
    if (!conn) throw new Error("No Facebook connection found");

    let creds: { pageAccessToken?: string };
    try {
      creds = JSON.parse(decryptCredentials(conn.credentials));
    } catch {
      creds = { pageAccessToken: decryptCredentials(conn.credentials).trim() };
    }

    const pageToken = creds.pageAccessToken;
    if (!pageToken) throw new Error("Facebook Page Access Token is required");

    const fbRes = await fetch("https://graph.facebook.com/v19.0/me/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pageToken}`,
      },
      body: JSON.stringify({
        recipient: { id: externalUserId },
        message: { text: message.text },
      }),
    });
    if (!fbRes.ok) {
      const errText = await fbRes.text().catch(() => "Unknown error");
      throw new Error(`Facebook send failed (${fbRes.status}): ${errText}`);
    }
  },

  isActive(botId) {
    return activeFacebookBots.has(botId);
  },
};

const activeGmailBots = new Map<number, { stop: () => void }>();

export const gmailConnector: PlatformConnector = {
  platform: "email",

  async start(botId, encryptedCredentials, onMessage) {
    if (activeGmailBots.has(botId)) return;

    let creds: {
      accessToken?: string;
      refreshToken?: string;
      clientId?: string;
      clientSecret?: string;
    };
    try {
      creds = JSON.parse(decryptCredentials(encryptedCredentials));
    } catch {
      throw new Error("Gmail credentials must be a JSON object");
    }

    const POLL_INTERVAL = 60_000;
    let running = true;
    let historyId: string | null = null;

    const getAccessToken = async (): Promise<string> => {
      if (!creds.refreshToken || !creds.clientId || !creds.clientSecret) {
        return creds.accessToken || "";
      }
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          refresh_token: creds.refreshToken,
          grant_type: "refresh_token",
        }).toString(),
      });
      const data = await res.json() as { access_token?: string };
      return data.access_token || creds.accessToken || "";
    };

    const processedMessageIds = new Set<string>();

    const poll = async () => {
      while (running) {
        try {
          const token = await getAccessToken();
          if (!token) {
            await new Promise(r => setTimeout(r, POLL_INTERVAL));
            continue;
          }

          const listUrl = historyId
            ? `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${historyId}&historyTypes=messageAdded&labelId=INBOX`
            : `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=10&q=is:unread`;

          const res = await fetch(listUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (!res.ok) {
            await new Promise(r => setTimeout(r, POLL_INTERVAL));
            continue;
          }

          const data = await res.json() as {
            messages?: Array<{ id: string; threadId: string }>;
            history?: Array<{ messages?: Array<{ id: string; threadId: string }> }>;
            historyId?: string;
          };

          if (data.historyId) historyId = data.historyId;

          const messages: Array<{ id: string; threadId: string }> = [];
          if (data.messages) messages.push(...data.messages);
          if (data.history) {
            for (const h of data.history) {
              if (h.messages) messages.push(...h.messages);
            }
          }

          for (const msg of messages) {
            if (processedMessageIds.has(msg.id)) continue;
            processedMessageIds.add(msg.id);

            const msgRes = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!msgRes.ok) continue;
            const msgData = await msgRes.json() as {
              id: string;
              threadId: string;
              payload?: {
                headers?: Array<{ name: string; value: string }>;
                parts?: Array<{ mimeType: string; body?: { data?: string } }>;
                body?: { data?: string };
              };
              snippet?: string;
            };

            const headers = msgData.payload?.headers || [];
            const from = headers.find(h => h.name === "From")?.value || "";
            const subject = headers.find(h => h.name === "Subject")?.value || "(no subject)";

            let body = msgData.snippet || "";
            const parts = msgData.payload?.parts || [];
            const textPart = parts.find(p => p.mimeType === "text/plain");
            if (textPart?.body?.data) {
              body = Buffer.from(textPart.body.data, "base64url").toString("utf8");
            } else if (msgData.payload?.body?.data) {
              body = Buffer.from(msgData.payload.body.data, "base64url").toString("utf8");
            }

            const emailMatch = from.match(/<([^>]+)>/) || [null, from];
            const senderEmail = emailMatch[1] || from;

            await onMessage({
              platform: "email",
              externalUserId: `${senderEmail}:${msg.threadId}`,
              text: `From: ${from}\nSubject: ${subject}\n\n${body.slice(0, 2000)}`,
              metadata: { messageId: msg.id, threadId: msg.threadId, from, subject },
            });
          }
        } catch (err) {
          console.error(`[Gmail Bot ${botId}] polling error:`, err);
        }
        if (running) await new Promise(r => setTimeout(r, POLL_INTERVAL));
      }
    };

    poll();
    activeGmailBots.set(botId, { stop: () => { running = false; } });
  },

  async stop(botId) {
    const entry = activeGmailBots.get(botId);
    if (entry) {
      entry.stop();
      activeGmailBots.delete(botId);
    }
  },

  async send(botId, externalUserId, message: OutgoingMessage) {
    const { db, botPlatformConnectionsTable } = await import("@workspace/db");
    const { eq, and } = await import("drizzle-orm");
    const [conn] = await db
      .select()
      .from(botPlatformConnectionsTable)
      .where(and(eq(botPlatformConnectionsTable.botId, botId), eq(botPlatformConnectionsTable.platform, "email")));
    if (!conn) throw new Error("No Gmail connection found");

    let creds: {
      accessToken?: string;
      refreshToken?: string;
      clientId?: string;
      clientSecret?: string;
      fromEmail?: string;
    };
    try {
      creds = JSON.parse(decryptCredentials(conn.credentials));
    } catch {
      throw new Error("Gmail credentials must be a JSON object");
    }

    const getToken = async () => {
      if (!creds.refreshToken || !creds.clientId || !creds.clientSecret) return creds.accessToken || "";
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          refresh_token: creds.refreshToken,
          grant_type: "refresh_token",
        }).toString(),
      });
      const data = await res.json() as { access_token?: string };
      return data.access_token || creds.accessToken || "";
    };

    const [toEmail, threadId] = externalUserId.split(":");
    const token = await getToken();
    if (!token) throw new Error("Could not obtain Gmail access token");

    let messageId: string | undefined;
    if (threadId) {
      try {
        const threadRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=Message-ID`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (threadRes.ok) {
          const threadData = await threadRes.json() as {
            messages?: Array<{ payload?: { headers?: Array<{ name: string; value: string }> } }>;
          };
          const msgs = threadData.messages;
          if (msgs && msgs.length > 0) {
            const lastMsg = msgs[msgs.length - 1];
            const headers = lastMsg?.payload?.headers || [];
            const msgIdHeader = headers.find(h => h.name === "Message-ID");
            if (msgIdHeader) messageId = msgIdHeader.value;
          }
        }
      } catch {}
    }

    const emailLines = [
      `To: ${toEmail}`,
      "Content-Type: text/plain; charset=utf-8",
      "MIME-Version: 1.0",
      "",
      message.text,
    ];

    if (messageId) {
      emailLines.splice(1, 0, `In-Reply-To: ${messageId}`);
      emailLines.splice(2, 0, `References: ${messageId}`);
    }

    const raw = Buffer.from(emailLines.join("\r\n")).toString("base64url");

    const body: Record<string, unknown> = { raw };
    if (threadId) body.threadId = threadId;

    const gmailRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!gmailRes.ok) {
      const errText = await gmailRes.text().catch(() => "Unknown error");
      throw new Error(`Gmail send failed (${gmailRes.status}): ${errText}`);
    }
  },

  isActive(botId) {
    return activeGmailBots.has(botId);
  },
};

const activeLinkedInBots = new Set<number>();

const linkedinRateLimiter = new Map<number, { count: number; resetAt: number }>();
const LINKEDIN_DAILY_LIMIT = 80;

function checkLinkedInRateLimit(botId: number): boolean {
  const now = Date.now();
  const entry = linkedinRateLimiter.get(botId);
  if (!entry || now > entry.resetAt) {
    linkedinRateLimiter.set(botId, { count: 1, resetAt: now + 24 * 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= LINKEDIN_DAILY_LIMIT) return false;
  entry.count++;
  return true;
}

async function getLinkedInCreds(botId: number): Promise<{ accessToken: string }> {
  const { db, botPlatformConnectionsTable } = await import("@workspace/db");
  const { eq, and } = await import("drizzle-orm");
  const [conn] = await db
    .select()
    .from(botPlatformConnectionsTable)
    .where(and(eq(botPlatformConnectionsTable.botId, botId), eq(botPlatformConnectionsTable.platform, "linkedin")));
  if (!conn) throw new Error("No LinkedIn connection found");

  let creds: { accessToken?: string; refreshToken?: string; clientId?: string; clientSecret?: string; expiresAt?: number };
  try {
    creds = JSON.parse(decryptCredentials(conn.credentials));
  } catch {
    creds = { accessToken: decryptCredentials(conn.credentials).trim() };
  }
  if (!creds.accessToken) throw new Error("LinkedIn access token is required");

  const now = Date.now();
  const expiresAt = creds.expiresAt || 0;
  const isExpiredOrSoon = expiresAt > 0 && (expiresAt - now) < 5 * 60 * 1000;

  if (isExpiredOrSoon) {
    if (creds.refreshToken && creds.clientId && creds.clientSecret) {
      try {
        const refreshRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: creds.refreshToken,
            client_id: creds.clientId,
            client_secret: creds.clientSecret,
          }).toString(),
        });
        if (refreshRes.ok) {
          const tokenData = await refreshRes.json() as { access_token: string; expires_in?: number; refresh_token?: string };
          creds.accessToken = tokenData.access_token;
          creds.expiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000;
          if (tokenData.refresh_token) creds.refreshToken = tokenData.refresh_token;
          const { encryptCredentials: enc } = await import("./bot-crypto");
          await db.update(botPlatformConnectionsTable)
            .set({ credentials: enc(JSON.stringify(creds)) })
            .where(eq(botPlatformConnectionsTable.id, conn.id));
        } else {
          console.error(`[LinkedIn Bot ${botId}] Token refresh failed (${refreshRes.status}) — marking connection as error`);
          await db.update(botPlatformConnectionsTable)
            .set({ status: "error" })
            .where(eq(botPlatformConnectionsTable.id, conn.id));
          throw new Error("LinkedIn token refresh failed — reconnect the platform to continue.");
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes("reconnect")) throw err;
        console.error(`[LinkedIn Bot ${botId}] Token refresh error:`, err);
        throw new Error("LinkedIn token refresh error — please reconnect the platform.");
      }
    } else {
      console.error(`[LinkedIn Bot ${botId}] Token expired and no refresh token available — marking connection as error`);
      await db.update(botPlatformConnectionsTable)
        .set({ status: "error" })
        .where(eq(botPlatformConnectionsTable.id, conn.id));
      throw new Error("LinkedIn access token expired and no refresh token is available — please reconnect the platform.");
    }
  }

  return { accessToken: creds.accessToken };
}

export const linkedinConnector: PlatformConnector & {
  sendConnectionRequest: (botId: number, profileUrn: string, customMessage?: string) => Promise<void>;
} = {
  platform: "linkedin",

  async start(botId, encryptedCredentials, onMessage) {
    if (activeLinkedInBots.has(botId)) return;
    activeLinkedInBots.add(botId);

    let creds: { accessToken?: string };
    try {
      const raw = decryptCredentials(encryptedCredentials).trim();
      creds = JSON.parse(raw);
    } catch {
      activeLinkedInBots.delete(botId);
      throw new Error("Invalid LinkedIn credentials");
    }

    const accessToken = creds.accessToken;
    if (!accessToken) {
      activeLinkedInBots.delete(botId);
      throw new Error("LinkedIn access token is required");
    }

    const POLL_INTERVAL = 30000;
    const processedMessages = new Set<string>();
    let lastPollTime = Date.now();

    const poll = async () => {
      if (!activeLinkedInBots.has(botId)) return;

      try {
        const res = await fetch(
          `https://api.linkedin.com/rest/conversations?q=criteria&createdAfter=${lastPollTime}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "LinkedIn-Version": "202401",
              "X-Restli-Protocol-Version": "2.0.0",
            },
          }
        );

        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            console.error(`[LinkedIn Bot ${botId}] Auth failed (${res.status}), stopping polling`);
            activeLinkedInBots.delete(botId);
            return;
          }
          return;
        }

        const data = await res.json() as {
          elements?: Array<{
            id: string;
            lastActivityAt?: number;
          }>;
        };

        if (data.elements) {
          for (const conv of data.elements) {
            const eventsRes = await fetch(
              `https://api.linkedin.com/rest/conversations/${encodeURIComponent(conv.id)}/events?q=criteria`,
              {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "LinkedIn-Version": "202401",
                  "X-Restli-Protocol-Version": "2.0.0",
                },
              }
            );

            if (!eventsRes.ok) continue;

            const eventsData = await eventsRes.json() as {
              elements?: Array<{
                createdAt?: number;
                from?: string;
                messageEvent?: { body?: string };
              }>;
            };

            if (!eventsData.elements) continue;

            for (const event of eventsData.elements) {
              const msgBody = event.messageEvent?.body;
              const senderId = event.from || "";
              const msgId = `${conv.id}_${event.createdAt}`;

              if (!msgBody || !senderId || processedMessages.has(msgId)) continue;
              processedMessages.add(msgId);

              if (processedMessages.size > 5000) {
                const entries = Array.from(processedMessages);
                for (let i = 0; i < 2500; i++) processedMessages.delete(entries[i]);
              }

              await onMessage({
                platform: "linkedin",
                externalUserId: senderId,
                text: msgBody,
                metadata: { conversationId: conv.id },
              });
            }
          }
        }

        lastPollTime = Date.now();
      } catch (err) {
        console.error(`[LinkedIn Bot ${botId}] Poll error:`, err);
      }

      if (activeLinkedInBots.has(botId)) {
        setTimeout(poll, POLL_INTERVAL);
      }
    };

    setTimeout(poll, 2000);
  },

  async stop(botId) {
    activeLinkedInBots.delete(botId);
    linkedinRateLimiter.delete(botId);
  },

  async send(botId, externalUserId, message: OutgoingMessage) {
    if (!checkLinkedInRateLimit(botId)) {
      throw new Error("LinkedIn daily message limit reached (80/day). Messages will resume tomorrow.");
    }

    const { accessToken } = await getLinkedInCreds(botId);

    const liRes = await fetch("https://api.linkedin.com/rest/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": "202401",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        recipients: [externalUserId],
        body: message.text,
        messageType: "MEMBER_TO_MEMBER",
      }),
    });
    if (!liRes.ok) {
      const errText = await liRes.text().catch(() => "Unknown error");
      throw new Error(`LinkedIn send failed (${liRes.status}): ${errText}`);
    }
  },

  async sendConnectionRequest(botId: number, profileUrn: string, customMessage?: string) {
    if (!checkLinkedInRateLimit(botId)) {
      throw new Error("LinkedIn daily action limit reached (80/day). Requests will resume tomorrow.");
    }

    const { accessToken } = await getLinkedInCreds(botId);

    const body: Record<string, unknown> = {
      inviteeUrn: profileUrn,
    };
    if (customMessage) {
      body.message = customMessage.slice(0, 300);
    }

    const res = await fetch("https://api.linkedin.com/rest/invitations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": "202401",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "Unknown error");
      throw new Error(`LinkedIn connection request failed: ${err}`);
    }
  },

  isActive(botId) {
    return activeLinkedInBots.has(botId);
  },
};
