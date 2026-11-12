import {
  db,
  filesFoldersTable,
  orgMembersTable,
  colleaguesTable,
  canonicalPair,
  type ChatChannel,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";

export type ResolvedAttachment = {
  attachmentFileId: number;
  attachmentObjectPath: string;
  attachmentName: string;
  attachmentMimeType: string | null;
  attachmentSizeBytes: number | null;
};

export type AttachmentResult =
  | { ok: true; attachment: ResolvedAttachment }
  | { ok: false; status: number; error: string };

// True when `other` is a coworker (same active org as `me`) OR an accepted
// cross-org associate. Mirrors the /media/share + /chat/private rule.
export async function canShareWith(me: string, other: string): Promise<boolean> {
  if (!other || other === me) return false;

  const [myMembership] = await db
    .select({ orgId: orgMembersTable.orgId })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, me), eq(orgMembersTable.status, "active")))
    .limit(1);
  if (myMembership) {
    const coworker = await db
      .select({ id: orgMembersTable.userId })
      .from(orgMembersTable)
      .where(and(
        eq(orgMembersTable.userId, other),
        eq(orgMembersTable.orgId, myMembership.orgId),
        eq(orgMembersTable.status, "active"),
      ))
      .limit(1);
    if (coworker.length > 0) return true;
  }

  const { userAId, userBId } = canonicalPair(me, other);
  const associate = await db
    .select({ status: colleaguesTable.status })
    .from(colleaguesTable)
    .where(and(
      eq(colleaguesTable.userAId, userAId),
      eq(colleaguesTable.userBId, userBId),
      eq(colleaguesTable.status, "accepted"),
    ))
    .limit(1);
  return associate.length > 0;
}

// Validate that the sender may attach `fileId` to a message in `channel`, and
// resolve the file's metadata from the media-library registry. Enforces:
//  - sender owns the file (filesFoldersTable)
//  - attachments are only allowed in private (to a coworker/associate) and
//    company channels; not global or pablo
export async function resolveChatAttachment(
  senderUserId: string,
  channel: ChatChannel,
  fileId: number,
): Promise<AttachmentResult> {
  if (channel.type === "global" || channel.type === "pablo") {
    return { ok: false, status: 403, error: "Attachments are only allowed in direct and company chats" };
  }

  if (channel.type === "private") {
    const other = channel.user1Id === senderUserId ? channel.user2Id : channel.user1Id;
    if (!other || !(await canShareWith(senderUserId, other))) {
      return { ok: false, status: 403, error: "You can only send files to coworkers or accepted associates" };
    }
  }
  // company channel: all active members are coworkers — allowed.

  const [file] = await db
    .select()
    .from(filesFoldersTable)
    .where(and(eq(filesFoldersTable.id, fileId), eq(filesFoldersTable.userId, senderUserId)))
    .limit(1);
  if (!file || file.isFolder || !file.objectPath) {
    return { ok: false, status: 403, error: "You don't own that file" };
  }

  return {
    ok: true,
    attachment: {
      attachmentFileId: file.id,
      attachmentObjectPath: file.objectPath,
      attachmentName: file.name,
      attachmentMimeType: file.mimeType || null,
      attachmentSizeBytes: file.fileSize ?? null,
    },
  };
}
