import { and, desc, eq, gte, getTableColumns, inArray, lte } from "drizzle-orm";
import { Router, type Request, type Response } from "express";
import {
  CreateOrganizationTimeOffRequestBody,
  CreateOrganizationTimeOffRequestResponse,
  ListOrganizationTimeOffRequestsResponse,
  UpdateOrganizationTimeOffRequestBody,
  UpdateOrganizationTimeOffRequestResponse,
} from "@workspace/api-zod";
import {
  db,
  orgTimeOffRequestsTable,
  usersTable,
  type OrgTimeOffRequest,
} from "@workspace/db";
import { canDoInOrg } from "../lib/org-permissions";

const router = Router();

type JoinedRequest = OrgTimeOffRequest & {
  firstName: string | null;
  lastName: string | null;
};

function userId(req: Request, res: Response): string | null {
  if (!req.isAuthenticated?.() || !req.user?.id) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  return String(req.user.id);
}

function positiveId(value: unknown): number | null {
  const id = Number(Array.isArray(value) ? value[0] : value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function serializeRequest(row: JoinedRequest) {
  const requesterName = [row.firstName, row.lastName].filter(Boolean).join(" ") || "Employee";
  return {
    id: row.id,
    orgId: row.orgId,
    requesterUserId: row.requesterUserId,
    requesterName,
    startDate: row.startDate,
    endDate: row.endDate,
    leaveType: row.leaveType,
    note: row.note,
    status: row.status,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function findRequest(orgId: number, requestId: number): Promise<JoinedRequest | null> {
  const [row] = await db
    .select({
      ...getTableColumns(orgTimeOffRequestsTable),
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
    })
    .from(orgTimeOffRequestsTable)
    .leftJoin(usersTable, eq(usersTable.id, orgTimeOffRequestsTable.requesterUserId))
    .where(and(
      eq(orgTimeOffRequestsTable.orgId, orgId),
      eq(orgTimeOffRequestsTable.id, requestId),
    ))
    .limit(1);
  return row ?? null;
}

router.get("/orgs/:orgId/time-off", async (req, res): Promise<void> => {
  const callerId = userId(req, res);
  if (!callerId) return;
  const orgId = positiveId(req.params.orgId);
  if (!orgId) {
    res.status(400).json({ error: "Invalid organization ID" });
    return;
  }

  const viewAccess = await canDoInOrg(callerId, orgId, "members.view");
  if (!viewAccess.allowed) {
    res.status(403).json({ error: "Organization member access required" });
    return;
  }
  const reviewAccess = await canDoInOrg(callerId, orgId, "members.manage");
  const conditions = reviewAccess.allowed
    ? eq(orgTimeOffRequestsTable.orgId, orgId)
    : and(
        eq(orgTimeOffRequestsTable.orgId, orgId),
        eq(orgTimeOffRequestsTable.requesterUserId, callerId),
      );
  const rows = await db
    .select({
      ...getTableColumns(orgTimeOffRequestsTable),
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
    })
    .from(orgTimeOffRequestsTable)
    .leftJoin(usersTable, eq(usersTable.id, orgTimeOffRequestsTable.requesterUserId))
    .where(conditions)
    .orderBy(desc(orgTimeOffRequestsTable.createdAt))
    .limit(100);

  res.json(ListOrganizationTimeOffRequestsResponse.parse({
    requests: rows.map(serializeRequest),
    canReview: reviewAccess.allowed,
  }));
});

router.post("/orgs/:orgId/time-off", async (req, res): Promise<void> => {
  const callerId = userId(req, res);
  if (!callerId) return;
  const orgId = positiveId(req.params.orgId);
  if (!orgId) {
    res.status(400).json({ error: "Invalid organization ID" });
    return;
  }
  const viewAccess = await canDoInOrg(callerId, orgId, "members.view");
  if (!viewAccess.allowed) {
    res.status(403).json({ error: "Organization member access required" });
    return;
  }

  const parsed = CreateOrganizationTimeOffRequestBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { startDate, endDate, leaveType, note = "" } = parsed.data;
  if (!isCalendarDate(startDate) || !isCalendarDate(endDate) || endDate < startDate) {
    res.status(400).json({ error: "Enter a valid date range with the end date on or after the start date" });
    return;
  }

  const [overlap] = await db
    .select({ id: orgTimeOffRequestsTable.id })
    .from(orgTimeOffRequestsTable)
    .where(and(
      eq(orgTimeOffRequestsTable.orgId, orgId),
      eq(orgTimeOffRequestsTable.requesterUserId, callerId),
      inArray(orgTimeOffRequestsTable.status, ["pending", "approved"]),
      lte(orgTimeOffRequestsTable.startDate, endDate),
      gte(orgTimeOffRequestsTable.endDate, startDate),
    ))
    .limit(1);
  if (overlap) {
    res.status(409).json({ error: "This request overlaps an existing pending or approved request" });
    return;
  }

  const [created] = await db.insert(orgTimeOffRequestsTable).values({
    orgId,
    requesterUserId: callerId,
    startDate,
    endDate,
    leaveType,
    note: note.trim(),
  }).returning({ id: orgTimeOffRequestsTable.id });
  const row = created ? await findRequest(orgId, created.id) : null;
  if (!row) {
    res.status(500).json({ error: "Time-off request could not be loaded after creation" });
    return;
  }
  res.status(201).json(CreateOrganizationTimeOffRequestResponse.parse({
    request: serializeRequest(row),
  }));
});

router.patch("/orgs/:orgId/time-off/:requestId", async (req, res): Promise<void> => {
  const callerId = userId(req, res);
  if (!callerId) return;
  const orgId = positiveId(req.params.orgId);
  const requestId = positiveId(req.params.requestId);
  if (!orgId || !requestId) {
    res.status(400).json({ error: "Invalid organization or request ID" });
    return;
  }
  const viewAccess = await canDoInOrg(callerId, orgId, "members.view");
  if (!viewAccess.allowed) {
    res.status(403).json({ error: "Organization member access required" });
    return;
  }
  const parsed = UpdateOrganizationTimeOffRequestBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const request = await findRequest(orgId, requestId);
  if (!request) {
    res.status(404).json({ error: "Time-off request not found" });
    return;
  }
  if (request.status !== "pending") {
    res.status(409).json({ error: "Only pending requests can be changed" });
    return;
  }

  const { status } = parsed.data;
  let updates: Partial<OrgTimeOffRequest>;
  if (status === "cancelled") {
    if (request.requesterUserId !== callerId) {
      res.status(403).json({ error: "Only the requester can withdraw this request" });
      return;
    }
    updates = { status, updatedAt: new Date() };
  } else {
    const manageAccess = await canDoInOrg(callerId, orgId, "members.manage");
    if (!manageAccess.allowed) {
      res.status(403).json({ error: "Member-management permission required" });
      return;
    }
    if (request.requesterUserId === callerId) {
      res.status(403).json({ error: "You cannot review your own request" });
      return;
    }
    updates = { status, reviewerUserId: callerId, reviewedAt: new Date(), updatedAt: new Date() };
  }

  const [updated] = await db
    .update(orgTimeOffRequestsTable)
    .set(updates)
    .where(and(
      eq(orgTimeOffRequestsTable.orgId, orgId),
      eq(orgTimeOffRequestsTable.id, requestId),
      eq(orgTimeOffRequestsTable.status, "pending"),
    ))
    .returning({ id: orgTimeOffRequestsTable.id });
  if (!updated) {
    res.status(409).json({ error: "Request is no longer pending" });
    return;
  }
  const row = await findRequest(orgId, requestId);
  if (!row) {
    res.status(404).json({ error: "Time-off request not found" });
    return;
  }
  res.json(UpdateOrganizationTimeOffRequestResponse.parse({
    request: serializeRequest(row),
  }));
});

export default router;
