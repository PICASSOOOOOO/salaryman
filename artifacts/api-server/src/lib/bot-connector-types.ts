import type { PlatformType } from "@workspace/db";

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
