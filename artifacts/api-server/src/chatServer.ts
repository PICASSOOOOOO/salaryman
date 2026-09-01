import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage, Server } from 'http';
import { db, chatChannelsTable, chatMessagesTable, chatReadCursorsTable, orgMembersTable, organizationsTable, notificationsTable, usersTable } from '@workspace/db';
import { eq, and, sql } from 'drizzle-orm';
import { resolveChatAttachment, type ResolvedAttachment } from './lib/chat-attachments';
import { resolveClerkWebSocketUser } from './lib/clerk-websocket-auth';
async function resolveSessionUserId(req: IncomingMessage): Promise<string | null> {
  return (await resolveClerkWebSocketUser(req))?.id ?? null;
}

interface ChatClient {
  ws: WebSocket;
  userId: string;
  userName: string;
  username: string | null;
  profileImageUrl: string | null;
  orgId: number | null;
  cityId: string | null;
  subscribedChannels: Set<number>;
}

// A user may have several tabs/devices connected at once. Keep socket identity
// as the primary lifecycle key, and derive recipient groups from it.
const clients = new Set<ChatClient>();
const clientsByUser = new Map<string, Set<ChatClient>>();
const clientsByChannel = new Map<number, Set<ChatClient>>();
const clientsByOrg = new Map<number, Set<ChatClient>>();

function send(ws: WebSocket, data: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function sendSerialized(ws: WebSocket, data: string) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(data);
  }
}

function addToIndex<K>(index: Map<K, Set<ChatClient>>, key: K, client: ChatClient) {
  let recipients = index.get(key);
  if (!recipients) {
    recipients = new Set();
    index.set(key, recipients);
  }
  recipients.add(client);
}

function removeFromIndex<K>(index: Map<K, Set<ChatClient>>, key: K, client: ChatClient) {
  const recipients = index.get(key);
  if (!recipients) return;
  recipients.delete(client);
  if (recipients.size === 0) index.delete(key);
}

function subscribe(client: ChatClient, channelId: number) {
  if (client.ws.readyState !== WebSocket.OPEN || client.subscribedChannels.has(channelId)) return;
  client.subscribedChannels.add(channelId);
  addToIndex(clientsByChannel, channelId, client);
}

function unsubscribe(client: ChatClient, channelId: number) {
  if (!client.subscribedChannels.delete(channelId)) return;
  removeFromIndex(clientsByChannel, channelId, client);
}

function registerClient(client: ChatClient) {
  if (client.ws.readyState !== WebSocket.OPEN) return;
  clients.add(client);
  addToIndex(clientsByUser, client.userId, client);
  if (client.orgId) addToIndex(clientsByOrg, client.orgId, client);
}

function removeClient(client: ChatClient) {
  // close and error can both fire; more importantly, removing this exact
  // client cannot disturb a newer socket belonging to the same user.
  if (!clients.delete(client)) return;
  removeFromIndex(clientsByUser, client.userId, client);
  if (client.orgId) removeFromIndex(clientsByOrg, client.orgId, client);
  for (const channelId of [...client.subscribedChannels]) {
    unsubscribe(client, channelId);
  }
}

function broadcastToChannel(channelId: number, data: object, excludeUserId?: string) {
  const serialized = JSON.stringify(data);
  for (const client of clientsByChannel.get(channelId) ?? []) {
    if (client.subscribedChannels.has(channelId) && client.userId !== excludeUserId) {
      sendSerialized(client.ws, serialized);
    }
  }
}

async function getOrCreateGlobalChannel(): Promise<number> {
  const existing = await db
    .select()
    .from(chatChannelsTable)
    .where(eq(chatChannelsTable.type, 'global'))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [ch] = await db
    .insert(chatChannelsTable)
    .values({ type: 'global', name: 'Global' })
    .returning();
  return ch.id;
}

async function getOrCreateCompanyChannel(orgId: number, orgName: string): Promise<number> {
  const existing = await db
    .select()
    .from(chatChannelsTable)
    .where(and(eq(chatChannelsTable.type, 'company'), eq(chatChannelsTable.orgId, orgId)))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [ch] = await db
    .insert(chatChannelsTable)
    .values({ type: 'company', name: orgName, orgId })
    .returning();
  return ch.id;
}

async function handleSubscribe(client: ChatClient, channelId: number) {
  const [channel] = await db
    .select()
    .from(chatChannelsTable)
    .where(eq(chatChannelsTable.id, channelId));
  if (!channel) return;

  if (channel.type === 'global') {
    subscribe(client, channelId);
    send(client.ws, { type: 'subscribed', channelId });
    return;
  }

  if (channel.type === 'pablo') {
    if (channel.user1Id !== client.userId) return;
    subscribe(client, channelId);
    send(client.ws, { type: 'subscribed', channelId });
    return;
  }

  if (channel.type === 'private') {
    if (channel.user1Id !== client.userId && channel.user2Id !== client.userId) return;
    subscribe(client, channelId);
    send(client.ws, { type: 'subscribed', channelId });
    return;
  }

  if (channel.type === 'company') {
    if (!client.orgId || channel.orgId !== client.orgId) return;
    subscribe(client, channelId);
    send(client.ws, { type: 'subscribed', channelId });
  }
}

async function handleSendMessage(
  client: ChatClient,
  channelId: number,
  content: string,
  attachmentFileId?: number,
) {
  const [channel] = await db
    .select()
    .from(chatChannelsTable)
    .where(eq(chatChannelsTable.id, channelId));
  if (!channel) return;

  if (channel.type === 'pablo') {
    if (channel.user1Id !== client.userId) return;
    const [u] = await db
      .select({ pabloPrivacyMode: usersTable.pabloPrivacyMode })
      .from(usersTable)
      .where(eq(usersTable.id, client.userId));
    if (u?.pabloPrivacyMode) return;
  } else if (channel.type === 'private') {
    if (channel.user1Id !== client.userId && channel.user2Id !== client.userId) return;
    if (!client.subscribedChannels.has(channelId)) {
      subscribe(client, channelId);
    }
    const otherUserId = channel.user1Id === client.userId ? channel.user2Id : channel.user1Id;
    for (const otherClient of otherUserId ? clientsByUser.get(otherUserId) ?? [] : []) {
      if (!otherClient.subscribedChannels.has(channelId)) {
        subscribe(otherClient, channelId);
        send(otherClient.ws, { type: 'new_private_channel', channelId });
      }
    }
  } else if (channel.type === 'company') {
    if (!client.orgId || channel.orgId !== client.orgId) return;
  }

  let attachment: ResolvedAttachment | null = null;
  if (typeof attachmentFileId === 'number' && Number.isFinite(attachmentFileId)) {
    const resolved = await resolveChatAttachment(client.userId, channel, attachmentFileId);
    if (!resolved.ok) {
      send(client.ws, { type: 'error', channelId, error: resolved.error });
      return;
    }
    attachment = resolved.attachment;
  }

  if (!content.trim() && !attachment) return;

  const [msg] = await db
    .insert(chatMessagesTable)
    .values({
      channelId,
      senderUserId: client.userId,
      senderName: client.userName,
      senderUsername: client.username,
      senderCity: client.cityId,
      isBot: false,
      content: content.slice(0, 2000),
      attachmentFileId: attachment?.attachmentFileId ?? null,
      attachmentObjectPath: attachment?.attachmentObjectPath ?? null,
      attachmentName: attachment?.attachmentName ?? null,
      attachmentMimeType: attachment?.attachmentMimeType ?? null,
      attachmentSizeBytes: attachment?.attachmentSizeBytes ?? null,
    })
    .returning();

  const payload = {
    type: 'chat_message',
    channelId,
    message: {
      id: msg.id,
      channelId: msg.channelId,
      senderUserId: msg.senderUserId,
      senderName: client.userName,
      senderUsername: client.username,
      senderProfileImageUrl: client.profileImageUrl,
      senderCity: msg.senderCity,
      isBot: false,
      content: msg.content,
      attachmentFileId: msg.attachmentFileId,
      attachmentObjectPath: msg.attachmentObjectPath,
      attachmentName: msg.attachmentName,
      attachmentMimeType: msg.attachmentMimeType,
      attachmentSizeBytes: msg.attachmentSizeBytes,
      createdAt: msg.createdAt,
    },
  };

  broadcastToChannel(channelId, payload);

  if (channel.type === 'private') {
    const otherUserId = channel.user1Id === client.userId ? channel.user2Id : channel.user1Id;
    if (otherUserId) {
      const otherClients = clientsByUser.get(otherUserId);
      if (!otherClients?.size) {
        db.insert(notificationsTable).values({
          userId: otherUserId,
          type: "dm",
          title: `New message from ${client.userName}`,
          body: content.slice(0, 200),
          link: `/console/chat`,
        }).catch(err => console.error("[Chat] DM notification error:", err));
      }
    }
  }
}

export function broadcastChatMessage(channelId: number, message: {
  id: number; channelId: number; senderUserId: string | null;
  senderName: string; senderUsername?: string | null; senderProfileImageUrl: string | null;
  isBot: boolean; content: string; createdAt: string | Date;
  attachmentFileId?: number | null; attachmentObjectPath?: string | null;
  attachmentName?: string | null; attachmentMimeType?: string | null;
  attachmentSizeBytes?: number | null;
}) {
  broadcastToChannel(channelId, { type: 'chat_message', channelId, message });
}

export function broadcastBotMessage(channelId: number, content: string, senderName = 'SYSTEM') {
  const payload = {
    type: 'chat_message',
    channelId,
    message: {
      id: Date.now(),
      channelId,
      senderUserId: null,
      senderName,
      senderProfileImageUrl: null,
      isBot: true,
      content,
      createdAt: new Date().toISOString(),
    },
  };
  broadcastToChannel(channelId, payload);
}

export function broadcastLeadEvent(orgId: number, event: { type: string; [key: string]: unknown }) {
  const serialized = JSON.stringify({ ...event, _channel: 'leads' });
  for (const client of clientsByOrg.get(orgId) ?? []) {
    sendSerialized(client.ws, serialized);
  }
}

export function setupChatServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const pathname = (req.url ?? '').split('?')[0];
    if (pathname === '/ws/chat') {
      wss.handleUpgrade(req, socket as any, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', async (ws: WebSocket, req) => {
    const url = new URL(req.url ?? '', `http://localhost`);
    const userId = await resolveSessionUserId(req);
    const orgIdParam = url.searchParams.get('orgId');
    let orgId = orgIdParam ? parseInt(orgIdParam) : null;
    const cityId = (url.searchParams.get('cityId') ?? '').slice(0, 40) || null;

    if (!userId) {
      ws.close(1008, 'Authentication required');
      return;
    }

    if (orgId && !isNaN(orgId)) {
      const membership = await db.select().from(orgMembersTable)
        .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.status, 'active')))
        .limit(1);
      if (membership.length === 0) {
        orgId = null;
      }
    }

    const [userRow] = await db
      .select({
        username: usersTable.username,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        profileImageUrl: usersTable.profileImageUrl,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    const client: ChatClient = {
      ws,
      userId,
      userName: [userRow?.firstName, userRow?.lastName].filter(Boolean).join(' ') || userRow?.username || 'User',
      username: userRow?.username ?? null,
      profileImageUrl: userRow?.profileImageUrl ?? null,
      orgId,
      cityId,
      subscribedChannels: new Set(),
    };

    registerClient(client);

    getOrCreateGlobalChannel().then((globalChannelId) => {
      subscribe(client, globalChannelId);
      send(ws, { type: 'ready', globalChannelId, orgId });

      if (orgId) {
        db.select()
          .from(organizationsTable)
          .where(eq(organizationsTable.id, orgId))
          .limit(1)
          .then(([org]) => {
            if (org) {
              getOrCreateCompanyChannel(org.id, org.name).then((companyChannelId) => {
                subscribe(client, companyChannelId);
                send(ws, { type: 'company_channel', channelId: companyChannelId });
              });
            }
          });
      }
    });

    ws.on('message', async (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      switch (msg.type) {
        case 'subscribe': {
          const channelId = typeof msg.channelId === 'number' ? msg.channelId : parseInt(msg.channelId);
          if (!isNaN(channelId)) await handleSubscribe(client, channelId);
          break;
        }
        case 'send_message': {
          const channelId = typeof msg.channelId === 'number' ? msg.channelId : parseInt(msg.channelId);
          const content = typeof msg.content === 'string' ? msg.content.trim() : '';
          const attachmentFileId = typeof msg.attachmentFileId === 'number' ? msg.attachmentFileId : undefined;
          if (!isNaN(channelId) && (content.length > 0 || attachmentFileId !== undefined)) {
            await handleSendMessage(client, channelId, content, attachmentFileId);
          }
          break;
        }
        case 'mark_read': {
          const channelId = typeof msg.channelId === 'number' ? msg.channelId : parseInt(msg.channelId);
          const lastMessageId = typeof msg.lastMessageId === 'number' ? msg.lastMessageId : parseInt(msg.lastMessageId);
          if (!isNaN(channelId) && !isNaN(lastMessageId)) {
            if (!client.subscribedChannels.has(channelId)) break;
            await db
              .insert(chatReadCursorsTable)
              .values({ channelId, userId, lastReadMessageId: lastMessageId })
              .onConflictDoUpdate({
                target: [chatReadCursorsTable.userId, chatReadCursorsTable.channelId],
                set: {
                  lastReadMessageId: sql`greatest(coalesce(${chatReadCursorsTable.lastReadMessageId}, 0), ${lastMessageId})`,
                },
              });
            send(ws, { type: 'read_ack', channelId, lastMessageId });
          }
          break;
        }
        default:
          break;
      }
    });

    ws.on('close', () => {
      removeClient(client);
    });

    ws.on('error', () => {
      removeClient(client);
    });
  });

  console.log('[Chat] WebSocket server attached at /ws/chat');
}
