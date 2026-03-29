import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { db, chatChannelsTable, chatMessagesTable, chatReadCursorsTable, orgMembersTable, organizationsTable } from '@workspace/db';
import { eq, and, or } from 'drizzle-orm';

interface ChatClient {
  ws: WebSocket;
  userId: string;
  userName: string;
  profileImageUrl: string | null;
  orgId: number | null;
  subscribedChannels: Set<number>;
}

const clients = new Map<string, ChatClient>();

function send(ws: WebSocket, data: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcastToChannel(channelId: number, data: object, excludeUserId?: string) {
  for (const [, client] of clients) {
    if (client.subscribedChannels.has(channelId) && client.userId !== excludeUserId) {
      send(client.ws, data);
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
    client.subscribedChannels.add(channelId);
    send(client.ws, { type: 'subscribed', channelId });
    return;
  }

  if (channel.type === 'private') {
    if (channel.user1Id !== client.userId && channel.user2Id !== client.userId) return;
    client.subscribedChannels.add(channelId);
    send(client.ws, { type: 'subscribed', channelId });
    return;
  }

  if (channel.type === 'company') {
    if (!client.orgId || channel.orgId !== client.orgId) return;
    client.subscribedChannels.add(channelId);
    send(client.ws, { type: 'subscribed', channelId });
  }
}

async function handleSendMessage(client: ChatClient, channelId: number, content: string) {
  const [channel] = await db
    .select()
    .from(chatChannelsTable)
    .where(eq(chatChannelsTable.id, channelId));
  if (!channel) return;

  if (channel.type === 'private') {
    if (channel.user1Id !== client.userId && channel.user2Id !== client.userId) return;
    if (!client.subscribedChannels.has(channelId)) {
      client.subscribedChannels.add(channelId);
    }
    const otherUserId = channel.user1Id === client.userId ? channel.user2Id : channel.user1Id;
    const otherClient = otherUserId ? clients.get(otherUserId) : null;
    if (otherClient && !otherClient.subscribedChannels.has(channelId)) {
      otherClient.subscribedChannels.add(channelId);
    }
  } else if (channel.type === 'company') {
    if (!client.orgId || channel.orgId !== client.orgId) return;
  }

  const [msg] = await db
    .insert(chatMessagesTable)
    .values({
      channelId,
      senderUserId: client.userId,
      senderName: client.userName,
      isBot: false,
      content: content.slice(0, 2000),
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
      senderProfileImageUrl: client.profileImageUrl,
      isBot: false,
      content: msg.content,
      createdAt: msg.createdAt,
    },
  };

  broadcastToChannel(channelId, payload);

  if (channel.type === 'private') {
    const otherUserId = channel.user1Id === client.userId ? channel.user2Id : channel.user1Id;
    if (otherUserId) {
      const otherClient = clients.get(otherUserId);
      if (otherClient && !otherClient.subscribedChannels.has(channelId)) {
        send(otherClient.ws, { type: 'new_private_channel', channelId });
        send(otherClient.ws, payload);
      }
    }
  }
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
  for (const [, client] of clients) {
    if (client.orgId === orgId) {
      send(client.ws, { ...event, _channel: 'leads' });
    }
  }
}

export function setupChatServer(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws/chat' });

  wss.on('connection', async (ws: WebSocket, req) => {
    const url = new URL(req.url ?? '', `http://localhost`);
    const userId = url.searchParams.get('userId');
    const userName = url.searchParams.get('userName') ?? 'User';
    const profileImageUrl = url.searchParams.get('profileImageUrl') ?? null;
    const orgIdParam = url.searchParams.get('orgId');
    let orgId = orgIdParam ? parseInt(orgIdParam) : null;

    if (!userId) {
      ws.close(1008, 'userId required');
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

    const client: ChatClient = {
      ws,
      userId,
      userName: decodeURIComponent(userName),
      profileImageUrl: profileImageUrl ? decodeURIComponent(profileImageUrl) : null,
      orgId,
      subscribedChannels: new Set(),
    };

    clients.set(userId, client);

    getOrCreateGlobalChannel().then((globalChannelId) => {
      client.subscribedChannels.add(globalChannelId);
      send(ws, { type: 'ready', globalChannelId, orgId });

      if (orgId) {
        db.select()
          .from(organizationsTable)
          .where(eq(organizationsTable.id, orgId))
          .limit(1)
          .then(([org]) => {
            if (org) {
              getOrCreateCompanyChannel(org.id, org.name).then((companyChannelId) => {
                client.subscribedChannels.add(companyChannelId);
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
          if (!isNaN(channelId) && content.length > 0) {
            await handleSendMessage(client, channelId, content);
          }
          break;
        }
        case 'mark_read': {
          const channelId = typeof msg.channelId === 'number' ? msg.channelId : parseInt(msg.channelId);
          const lastMessageId = typeof msg.lastMessageId === 'number' ? msg.lastMessageId : parseInt(msg.lastMessageId);
          if (!isNaN(channelId) && !isNaN(lastMessageId)) {
            const existing = await db
              .select()
              .from(chatReadCursorsTable)
              .where(and(eq(chatReadCursorsTable.channelId, channelId), eq(chatReadCursorsTable.userId, userId)))
              .limit(1);
            if (existing[0]) {
              await db
                .update(chatReadCursorsTable)
                .set({ lastReadMessageId: lastMessageId })
                .where(and(eq(chatReadCursorsTable.channelId, channelId), eq(chatReadCursorsTable.userId, userId)));
            } else {
              await db
                .insert(chatReadCursorsTable)
                .values({ channelId, userId, lastReadMessageId: lastMessageId });
            }
            send(ws, { type: 'read_ack', channelId, lastMessageId });
          }
          break;
        }
        default:
          break;
      }
    });

    ws.on('close', () => {
      clients.delete(userId);
    });

    ws.on('error', () => {
      clients.delete(userId);
    });
  });

  console.log('[Chat] WebSocket server attached at /ws/chat');
}
