import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "crypto";
import { inArray } from "drizzle-orm";
import {
  db,
  orgMembersTable,
  orgCustomAppsTable,
  orgCustomAppRecordsTable,
  organizationsTable,
  usersTable,
  type OrgRole,
} from "@workspace/db";
import orgCustomAppsRouter from "../routes/org-custom-apps";

process.env.SESSION_SECRET ||= "org-custom-app-route-tests";

const authState = { user: { id: "", email: "" } };
const createdUserIds: string[] = [];
const createdOrgIds: number[] = [];

function actAs(user: { id: string; email: string }) {
  authState.user = user;
}

async function createUser() {
  const email = `org-custom-app-${randomUUID()}@example.test`;
  const [user] = await db
    .insert(usersTable)
    .values({ email })
    .returning({ id: usersTable.id, email: usersTable.email });
  const result = { id: user.id, email: user.email ?? email };
  createdUserIds.push(result.id);
  return result;
}

async function createOrg(ownerId: string) {
  const [org] = await db
    .insert(organizationsTable)
    .values({
      name: `CUSTOM APP TEST ${randomUUID()}`,
      ownerUserId: ownerId,
      isDeveloper: false,
    })
    .returning({ id: organizationsTable.id });
  createdOrgIds.push(org.id);
  await db.insert(orgMembersTable).values({
    orgId: org.id,
    userId: ownerId,
    role: "owner",
    status: "active",
  });
  return org;
}

async function addMember(orgId: number, userId: string, role: OrgRole) {
  await db.insert(orgMembersTable).values({ orgId, userId, role, status: "active" });
}

let app: Express;
beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { user: typeof authState.user }).user = authState.user;
    next();
  });
  app.use("/api", orgCustomAppsRouter);
});

afterAll(async () => {
  if (createdOrgIds.length) {
    await db.delete(orgCustomAppRecordsTable).where(inArray(orgCustomAppRecordsTable.orgId, createdOrgIds));
    await db.delete(orgCustomAppsTable).where(inArray(orgCustomAppsTable.orgId, createdOrgIds));
    await db.delete(orgMembersTable).where(inArray(orgMembersTable.orgId, createdOrgIds));
    await db.delete(organizationsTable).where(inArray(organizationsTable.id, createdOrgIds));
  }
  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
});

describe("organization custom pages", () => {
  it("keeps drafts manager-only and lets specialists use published records only in their org", async () => {
    const ownerA = await createUser();
    const specialistA = await createUser();
    const ownerB = await createUser();
    const orgA = await createOrg(ownerA.id);
    const orgB = await createOrg(ownerB.id);
    await addMember(orgA.id, specialistA.id, "specialist");

    actAs(ownerA);
    const created = await request(app)
      .post("/api/orgs/current/custom-apps")
      .send({
        name: "Equipment approvals",
        description: "Review team equipment requests.",
        fields: [
          { key: "approved", label: "Approved", type: "checkbox", required: true },
          { key: "requested_by", label: "Requested by", type: "text", required: true },
        ],
      });
    expect(created.status).toBe(201);
    const appSlug = created.body.app.slug as string;

    actAs(specialistA);
    const listBeforePublish = await request(app).get("/api/orgs/current/custom-apps");
    expect(listBeforePublish.status).toBe(200);
    expect(listBeforePublish.body.items).toHaveLength(0);
    expect((await request(app).get(`/api/orgs/current/custom-apps/${appSlug}`)).status).toBe(404);
    expect((await request(app).post("/api/orgs/current/custom-apps").send({
      name: "Not allowed",
      description: "",
      fields: [{ key: "title", label: "Title", type: "text", required: false }],
    })).status).toBe(403);

    actAs(ownerA);
    const published = await request(app)
      .patch(`/api/orgs/current/custom-apps/${appSlug}/status`)
      .send({ status: "published" });
    expect(published.status).toBe(200);

    actAs(specialistA);
    const list = await request(app).get("/api/orgs/current/custom-apps");
    expect(list.status).toBe(200);
    expect(list.body.items.map((item: { slug: string }) => item.slug)).toContain(appSlug);

    const rejectedRequiredCheckbox = await request(app)
      .post(`/api/orgs/current/custom-apps/${appSlug}/records`)
      .send({ data: { approved: false, requested_by: "Alex" } });
    expect(rejectedRequiredCheckbox.status).toBe(400);

    const rejectedWhitespace = await request(app)
      .post(`/api/orgs/current/custom-apps/${appSlug}/records`)
      .send({ data: { approved: true, requested_by: "   " } });
    expect(rejectedWhitespace.status).toBe(400);

    const createdRecord = await request(app)
      .post(`/api/orgs/current/custom-apps/${appSlug}/records`)
      .send({ data: { approved: true, requested_by: "Alex" } });
    expect(createdRecord.status).toBe(201);
    const recordId = createdRecord.body.id as string;

    actAs(ownerA);
    const removeStoredField = await request(app)
      .put(`/api/orgs/current/custom-apps/${appSlug}`)
      .send({
        name: "Equipment approvals",
        description: "Review team equipment requests.",
        fields: [{ key: "approved", label: "Approved", type: "checkbox", required: true }],
      });
    expect(removeStoredField.status).toBe(409);

    const renameField = await request(app)
      .put(`/api/orgs/current/custom-apps/${appSlug}`)
      .send({
        name: "Equipment approvals",
        description: "Review team equipment requests.",
        fields: [
          { key: "approved", label: "Manager approved", type: "checkbox", required: true },
          { key: "requested_by", label: "Requested by", type: "text", required: true },
        ],
      });
    expect(renameField.status).toBe(200);

    actAs(ownerB);
    expect((await request(app).get(`/api/orgs/current/custom-apps/${appSlug}`)).status).toBe(404);
    expect((await request(app).get(`/api/orgs/current/custom-apps/${appSlug}/records/page/0`)).status).toBe(404);
    expect((await request(app).post(`/api/orgs/current/custom-apps/${appSlug}/records`).send({
      data: { approved: true, requested_by: "Alex" },
    })).status).toBe(404);
    expect((await request(app).put(`/api/orgs/current/custom-apps/${appSlug}/records/${recordId}`).send({
      data: { approved: false, requested_by: "Alex" },
    })).status).toBe(404);
    expect((await request(app).delete(`/api/orgs/current/custom-apps/${appSlug}/records/${recordId}`)).status).toBe(404);

    actAs(specialistA);
    const records = await request(app).get(`/api/orgs/current/custom-apps/${appSlug}/records/page/0`);
    expect(records.status).toBe(200);
    expect(records.body.items).toHaveLength(1);
    expect(records.body.items[0]).toMatchObject({ id: recordId, data: { approved: true } });
    const updatedApp = await request(app).get(`/api/orgs/current/custom-apps/${appSlug}`);
    expect(updatedApp.body.app.fields[0].label).toBe("Manager approved");
    expect(orgB.id).not.toBe(orgA.id);
  });
});
