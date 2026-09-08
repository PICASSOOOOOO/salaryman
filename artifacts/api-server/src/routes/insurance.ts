import { Router, type Request, type Response } from "express";
import {
  db,
  insuranceCarriersTable,
  insuranceAgencyConnectionsTable,
  insuranceClientsTable,
  insurancePoliciesTable,
  insuranceCallLogsTable,
  INSURANCE_CARRIERS_SEED,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";

const router = Router();

function requireAuth(req: Request, res: Response): req is Request & { user: Express.User } {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

router.get("/insurance/carriers", async (_req: Request, res: Response): Promise<void> => {
  const carriers = await db.select().from(insuranceCarriersTable).where(eq(insuranceCarriersTable.isActive, true));
  res.json(carriers);
});

router.get("/insurance/connections", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const userId = (req.user as any).id;
  const connections = await db
    .select({
      connection: insuranceAgencyConnectionsTable,
      carrier: insuranceCarriersTable,
    })
    .from(insuranceAgencyConnectionsTable)
    .innerJoin(insuranceCarriersTable, eq(insuranceAgencyConnectionsTable.carrierId, insuranceCarriersTable.id))
    .where(and(eq(insuranceAgencyConnectionsTable.userId, userId), eq(insuranceAgencyConnectionsTable.isActive, true)));
  const masked = connections.map(c => ({
    ...c,
    connection: {
      ...c.connection,
      apiToken: c.connection.apiToken ? "••••" + c.connection.apiToken.slice(-8) : null,
    },
  }));
  res.json(masked);
});

router.post("/insurance/connections", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const userId = (req.user as any).id;
  const { carrierId, agencyName, npn, apiToken, apiConfig, orgId } = req.body;
  if (!carrierId) {
    res.status(400).json({ error: "carrierId required" });
    return;
  }
  const [conn] = await db.insert(insuranceAgencyConnectionsTable).values({
    userId,
    orgId: orgId || null,
    carrierId,
    agencyName: agencyName || null,
    npn: npn || null,
    apiToken: apiToken || null,
    apiConfig: apiConfig || null,
  }).returning();
  res.json(conn);
});

router.put("/insurance/connections/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const userId = (req.user as any).id;
  const connId = parseInt(req.params.id as string);
  const { agencyName, npn, apiToken, apiConfig, isActive } = req.body;
  const updates: Record<string, any> = {};
  if (agencyName !== undefined) updates.agencyName = agencyName;
  if (npn !== undefined) updates.npn = npn;
  if (apiToken !== undefined) updates.apiToken = apiToken;
  if (apiConfig !== undefined) updates.apiConfig = apiConfig;
  if (isActive !== undefined) updates.isActive = isActive;
  const [updated] = await db
    .update(insuranceAgencyConnectionsTable)
    .set(updates)
    .where(and(eq(insuranceAgencyConnectionsTable.id, connId), eq(insuranceAgencyConnectionsTable.userId, userId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }
  res.json(updated);
});

router.delete("/insurance/connections/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const userId = (req.user as any).id;
  const connId = parseInt(req.params.id as string);
  await db
    .update(insuranceAgencyConnectionsTable)
    .set({ isActive: false })
    .where(and(eq(insuranceAgencyConnectionsTable.id, connId), eq(insuranceAgencyConnectionsTable.userId, userId)));
  res.json({ ok: true });
});

router.get("/insurance/clients", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const userId = (req.user as any).id;
  const clients = await db
    .select()
    .from(insuranceClientsTable)
    .where(eq(insuranceClientsTable.userId, userId))
    .orderBy(desc(insuranceClientsTable.createdAt));
  res.json(clients);
});

router.post("/insurance/clients", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const userId = (req.user as any).id;
  const { firstName, lastName, email, phone, dateOfBirth, state, zipCode, connectionId, orgId, source } = req.body;
  if (!firstName || !lastName) {
    res.status(400).json({ error: "firstName and lastName required" });
    return;
  }
  const [client] = await db.insert(insuranceClientsTable).values({
    userId,
    orgId: orgId || null,
    connectionId: connectionId || null,
    firstName,
    lastName,
    email: email || null,
    phone: phone || null,
    dateOfBirth: dateOfBirth || null,
    state: state || null,
    zipCode: zipCode || null,
    source: source || "manual",
  }).returning();
  res.json(client);
});

router.put("/insurance/clients/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const userId = (req.user as any).id;
  const clientId = parseInt(req.params.id as string);
  const { firstName, lastName, email, phone, dateOfBirth, state, zipCode } = req.body;
  const updates: Record<string, any> = { updatedAt: new Date() };
  if (firstName !== undefined) updates.firstName = firstName;
  if (lastName !== undefined) updates.lastName = lastName;
  if (email !== undefined) updates.email = email;
  if (phone !== undefined) updates.phone = phone;
  if (dateOfBirth !== undefined) updates.dateOfBirth = dateOfBirth;
  if (state !== undefined) updates.state = state;
  if (zipCode !== undefined) updates.zipCode = zipCode;
  const [updated] = await db
    .update(insuranceClientsTable)
    .set(updates)
    .where(and(eq(insuranceClientsTable.id, clientId), eq(insuranceClientsTable.userId, userId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  res.json(updated);
});

router.get("/insurance/policies", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const userId = (req.user as any).id;
  const clientId = req.query.clientId ? parseInt(req.query.clientId as string) : undefined;
  const conditions = [eq(insurancePoliciesTable.userId, userId)];
  if (clientId) conditions.push(eq(insurancePoliciesTable.clientId, clientId));
  const policies = await db
    .select({
      policy: insurancePoliciesTable,
      carrier: insuranceCarriersTable,
    })
    .from(insurancePoliciesTable)
    .innerJoin(insuranceCarriersTable, eq(insurancePoliciesTable.carrierId, insuranceCarriersTable.id))
    .where(and(...conditions))
    .orderBy(desc(insurancePoliciesTable.createdAt));
  res.json(policies);
});

router.post("/insurance/policies", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const userId = (req.user as any).id;
  const { clientId, carrierId, connectionId, orgId, policyNumber, planName, planType, status, premiumMonthly, effectiveDate, terminationDate, notes } = req.body;
  if (!clientId || !carrierId) {
    res.status(400).json({ error: "clientId and carrierId required" });
    return;
  }
  const [policy] = await db.insert(insurancePoliciesTable).values({
    clientId,
    userId,
    orgId: orgId || null,
    carrierId,
    connectionId: connectionId || null,
    policyNumber: policyNumber || null,
    planName: planName || null,
    planType: planType || null,
    status: status || "quoted",
    premiumMonthly: premiumMonthly || null,
    effectiveDate: effectiveDate || null,
    terminationDate: terminationDate || null,
    notes: notes || null,
  }).returning();
  res.json(policy);
});

router.put("/insurance/policies/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const userId = (req.user as any).id;
  const policyId = parseInt(req.params.id as string);
  const { policyNumber, planName, planType, status, premiumMonthly, effectiveDate, terminationDate, cancelReason, notes } = req.body;
  const updates: Record<string, any> = { updatedAt: new Date() };
  if (policyNumber !== undefined) updates.policyNumber = policyNumber;
  if (planName !== undefined) updates.planName = planName;
  if (planType !== undefined) updates.planType = planType;
  if (status !== undefined) updates.status = status;
  if (premiumMonthly !== undefined) updates.premiumMonthly = premiumMonthly;
  if (effectiveDate !== undefined) updates.effectiveDate = effectiveDate;
  if (terminationDate !== undefined) updates.terminationDate = terminationDate;
  if (cancelReason !== undefined) updates.cancelReason = cancelReason;
  if (notes !== undefined) updates.notes = notes;
  const [updated] = await db
    .update(insurancePoliciesTable)
    .set(updates)
    .where(and(eq(insurancePoliciesTable.id, policyId), eq(insurancePoliciesTable.userId, userId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Policy not found" });
    return;
  }
  res.json(updated);
});

router.get("/insurance/stats", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const userId = (req.user as any).id;
  const [clientCount] = await db.select({ count: sql<number>`count(*)` }).from(insuranceClientsTable).where(eq(insuranceClientsTable.userId, userId));
  const [policyCount] = await db.select({ count: sql<number>`count(*)` }).from(insurancePoliciesTable).where(eq(insurancePoliciesTable.userId, userId));
  const [activeCount] = await db.select({ count: sql<number>`count(*)` }).from(insurancePoliciesTable).where(and(eq(insurancePoliciesTable.userId, userId), eq(insurancePoliciesTable.status, "active")));
  const [pendingCount] = await db.select({ count: sql<number>`count(*)` }).from(insurancePoliciesTable).where(and(eq(insurancePoliciesTable.userId, userId), eq(insurancePoliciesTable.status, "pending")));
  const [connectionCount] = await db.select({ count: sql<number>`count(*)` }).from(insuranceAgencyConnectionsTable).where(and(eq(insuranceAgencyConnectionsTable.userId, userId), eq(insuranceAgencyConnectionsTable.isActive, true)));
  const [callCount] = await db.select({ count: sql<number>`count(*)` }).from(insuranceCallLogsTable).where(eq(insuranceCallLogsTable.userId, userId));
  res.json({
    totalClients: Number(clientCount?.count ?? 0),
    totalPolicies: Number(policyCount?.count ?? 0),
    activePolicies: Number(activeCount?.count ?? 0),
    pendingPolicies: Number(pendingCount?.count ?? 0),
    carrierConnections: Number(connectionCount?.count ?? 0),
    totalCalls: Number(callCount?.count ?? 0),
  });
});

router.get("/insurance/call-logs", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const userId = (req.user as any).id;
  const logs = await db
    .select()
    .from(insuranceCallLogsTable)
    .where(eq(insuranceCallLogsTable.userId, userId))
    .orderBy(desc(insuranceCallLogsTable.createdAt))
    .limit(50);
  res.json(logs);
});

router.post("/insurance/call-logs", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const userId = (req.user as any).id;
  const { clientId, callSid, direction, callType, callerPhone, duration, outcome, transcript, extractedInfo } = req.body;
  const [log] = await db.insert(insuranceCallLogsTable).values({
    userId,
    clientId: clientId || null,
    callSid: callSid || null,
    direction: direction || "inbound",
    callType: callType || "sales",
    callerPhone: callerPhone || null,
    duration: duration || null,
    outcome: outcome || null,
    transcript: transcript || null,
    extractedInfo: extractedInfo || null,
  }).returning();
  res.json(log);
});

router.post("/insurance/carrier/test", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const { connectionId } = req.body;
  if (!connectionId) {
    res.status(400).json({ error: "connectionId required" });
    return;
  }
  const userId = (req.user as any).id;
  const [conn] = await db
    .select({
      connection: insuranceAgencyConnectionsTable,
      carrier: insuranceCarriersTable,
    })
    .from(insuranceAgencyConnectionsTable)
    .innerJoin(insuranceCarriersTable, eq(insuranceAgencyConnectionsTable.carrierId, insuranceCarriersTable.id))
    .where(and(eq(insuranceAgencyConnectionsTable.id, connectionId), eq(insuranceAgencyConnectionsTable.userId, userId)));
  if (!conn) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }
  if (!conn.connection.apiToken) {
    res.json({ status: "no_token", message: "NO API TOKEN CONFIGURED. ADD YOUR TOKEN IN CONNECTION SETTINGS." });
    return;
  }
  if (!conn.carrier.apiBaseUrl) {
    res.json({ status: "no_endpoint", message: `${conn.carrier.name} API ENDPOINT NOT YET CONFIGURED. PLACEHOLDER INTEGRATION READY.` });
    return;
  }
  try {
    const testUrl = `${conn.carrier.apiBaseUrl}/api/v1/health`;
    const resp = await fetch(testUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${conn.connection.apiToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) {
      res.json({ status: "connected", message: `${conn.carrier.name} API CONNECTION SUCCESSFUL` });
    } else {
      res.json({ status: "error", message: `${conn.carrier.name} RETURNED STATUS ${resp.status}` });
    }
  } catch (e: any) {
    res.json({ status: "error", message: `${conn.carrier.name} UNREACHABLE: ${e.message}` });
  }
});

export async function seedInsuranceCarriers() {
  for (const carrier of INSURANCE_CARRIERS_SEED) {
    const existing = await db.select().from(insuranceCarriersTable).where(eq(insuranceCarriersTable.slug, carrier.slug));
    if (existing.length === 0) {
      await db.insert(insuranceCarriersTable).values({
        slug: carrier.slug,
        name: carrier.name,
        shortName: carrier.shortName,
        category: carrier.category,
        logoColor: carrier.logoColor,
        authType: carrier.authType,
        apiBaseUrl: carrier.apiBaseUrl || null,
      });
    }
  }
  console.log(`[Insurance Seed] Seeded ${INSURANCE_CARRIERS_SEED.length} carriers`);
}

export default router;
