import { Router, type IRouter, type Request, type Response } from "express";
import { db, invoicesTable, contractsTable, filesFoldersTable } from "@workspace/db";
import { eq, and, isNull, sql, asc } from "drizzle-orm";
import { randomBytes } from "crypto";
import { ObjectStorageService } from "../lib/objectStorage";
import { creditOrgAccount } from "./org-accounts";
import { resolveCurrentOrgId } from "../lib/org-permissions";

function computeInvoiceTotal(lineItems: unknown, taxRate: number): number {
  if (!Array.isArray(lineItems)) return 0;
  const sub = (lineItems as { quantity?: number; rate?: number }[]).reduce(
    (s, item) => s + (Number(item.quantity) || 0) * (Number(item.rate) || 0),
    0
  );
  return Math.round(sub * (1 + (Number(taxRate) || 0) / 100));
}

const router: IRouter = Router();

async function requirePro(req: Request, res: Response): Promise<boolean> {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

const objectStorage = new ObjectStorageService();

router.get("/tools/documents/invoices", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const rows = await db.select().from(invoicesTable)
    .where(eq(invoicesTable.userId, req.user!.id))
    .orderBy(sql`${invoicesTable.createdAt} DESC`);
  res.json({ invoices: rows });
});

router.post("/tools/documents/invoices", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const body = req.body as {
    clientName?: string; clientEmail?: string; clientAddress?: string;
    invoiceNumber?: string; issueDate?: string; dueDate?: string;
    lineItems?: unknown; taxRate?: number; notes?: string; terms?: string; status?: string;
  };
  if (!body.clientName?.trim()) { res.status(400).json({ error: "Client name required" }); return; }
  if (!body.invoiceNumber?.trim()) { res.status(400).json({ error: "Invoice number required" }); return; }
  const [record] = await db.insert(invoicesTable).values({
    userId: req.user!.id,
    clientName: body.clientName.trim(),
    clientEmail: body.clientEmail ?? "",
    clientAddress: body.clientAddress ?? "",
    invoiceNumber: body.invoiceNumber.trim(),
    issueDate: body.issueDate ?? "",
    dueDate: body.dueDate ?? "",
    lineItems: body.lineItems ?? [],
    taxRate: body.taxRate ?? 0,
    notes: body.notes ?? "",
    terms: body.terms ?? "",
    status: body.status ?? "draft",
  }).returning();
  res.status(201).json({ invoice: record });
});

router.put("/tools/documents/invoices/:id", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const userId = req.user!.id;
  const id = Number(req.params.id);
  const body = req.body as Partial<{
    clientName: string; clientEmail: string; clientAddress: string;
    invoiceNumber: string; issueDate: string; dueDate: string;
    lineItems: unknown; taxRate: number; notes: string; terms: string; status: string;
  }>;

  const [before] = await db.select().from(invoicesTable)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.userId, userId)));
  if (!before) { res.status(404).json({ error: "Invoice not found" }); return; }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.clientName !== undefined) updates.clientName = body.clientName;
  if (body.clientEmail !== undefined) updates.clientEmail = body.clientEmail;
  if (body.clientAddress !== undefined) updates.clientAddress = body.clientAddress;
  if (body.invoiceNumber !== undefined) updates.invoiceNumber = body.invoiceNumber;
  if (body.issueDate !== undefined) updates.issueDate = body.issueDate;
  if (body.dueDate !== undefined) updates.dueDate = body.dueDate;
  if (body.lineItems !== undefined) updates.lineItems = body.lineItems;
  if (body.taxRate !== undefined) updates.taxRate = body.taxRate;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.terms !== undefined) updates.terms = body.terms;
  if (body.status !== undefined) updates.status = body.status;

  const [record] = await db.update(invoicesTable).set(updates)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.userId, userId)))
    .returning();
  if (!record) { res.status(404).json({ error: "Invoice not found" }); return; }

  // Shadow-credit the org checking account when an invoice transitions to "paid".
  // Fire-and-forget so a credit failure never blocks the invoice update itself.
  if (before.status !== "paid" && record.status === "paid") {
    const lineItems = body.lineItems ?? record.lineItems;
    const taxRate = body.taxRate ?? record.taxRate;
    const total = computeInvoiceTotal(lineItems, taxRate);
    if (total > 0) {
      resolveCurrentOrgId(userId).then((orgId) => {
        if (!orgId) return;
        return creditOrgAccount(
          orgId,
          "checking",
          total,
          `INVOICE PAID: ${record.invoiceNumber} — ${record.clientName}`,
          "invoice",
          userId,
        );
      }).catch((err) => {
        console.error(`[OrgAccounts] Invoice shadow credit failed (invoice ${id}):`, err);
      });
    }
  }

  res.json({ invoice: record });
});

router.delete("/tools/documents/invoices/:id", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const id = Number(req.params.id);
  await db.delete(invoicesTable)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.userId, req.user!.id)));
  res.json({ ok: true });
});

router.get("/tools/documents/contracts", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const rows = await db.select().from(contractsTable)
    .where(eq(contractsTable.userId, req.user!.id))
    .orderBy(sql`${contractsTable.createdAt} DESC`);
  res.json({ contracts: rows });
});

router.post("/tools/documents/contracts", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const body = req.body as {
    templateType?: string; partyA?: string; partyB?: string; startDate?: string;
    endDate?: string; terms?: string; scope?: string; compensation?: string;
    jurisdiction?: string; extraClauses?: string; status?: string;
  };
  if (!body.partyA?.trim()) { res.status(400).json({ error: "Party A required" }); return; }
  if (!body.partyB?.trim()) { res.status(400).json({ error: "Party B required" }); return; }
  const [record] = await db.insert(contractsTable).values({
    userId: req.user!.id,
    templateType: body.templateType ?? "nda",
    partyA: body.partyA.trim(),
    partyB: body.partyB.trim(),
    startDate: body.startDate ?? "",
    endDate: body.endDate ?? "",
    terms: body.terms ?? "",
    scope: body.scope ?? "",
    compensation: body.compensation ?? "",
    jurisdiction: body.jurisdiction ?? "",
    extraClauses: body.extraClauses ?? "",
    status: body.status ?? "draft",
  }).returning();
  res.status(201).json({ contract: record });
});

router.put("/tools/documents/contracts/:id", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const id = Number(req.params.id);
  const body = req.body as Partial<{
    templateType: string; partyA: string; partyB: string; startDate: string;
    endDate: string; terms: string; scope: string; compensation: string;
    jurisdiction: string; extraClauses: string; status: string;
  }>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  Object.keys(body).forEach(k => {
    if (body[k as keyof typeof body] !== undefined) updates[k] = body[k as keyof typeof body];
  });
  const [record] = await db.update(contractsTable).set(updates)
    .where(and(eq(contractsTable.id, id), eq(contractsTable.userId, req.user!.id)))
    .returning();
  if (!record) { res.status(404).json({ error: "Contract not found" }); return; }
  res.json({ contract: record });
});

router.delete("/tools/documents/contracts/:id", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const id = Number(req.params.id);
  await db.delete(contractsTable)
    .where(and(eq(contractsTable.id, id), eq(contractsTable.userId, req.user!.id)));
  res.json({ ok: true });
});

router.get("/tools/documents/files", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const parentId = req.query.parentId ? Number(req.query.parentId) : null;
  const rows = await db.select().from(filesFoldersTable)
    .where(and(
      eq(filesFoldersTable.userId, req.user!.id),
      parentId ? eq(filesFoldersTable.parentId, parentId) : isNull(filesFoldersTable.parentId)
    ))
    .orderBy(asc(filesFoldersTable.isFolder), asc(filesFoldersTable.name));
  res.json({ items: rows });
});

router.post("/tools/documents/files/folder", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const body = req.body as { name?: string; parentId?: number | null };
  if (!body.name?.trim()) { res.status(400).json({ error: "Folder name required" }); return; }
  const [record] = await db.insert(filesFoldersTable).values({
    userId: req.user!.id,
    name: body.name.trim(),
    parentId: body.parentId ?? null,
    isFolder: true,
  }).returning();
  res.status(201).json({ item: record });
});

router.post("/tools/documents/files/register", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const body = req.body as {
    name?: string; parentId?: number | null; objectPath?: string;
    mimeType?: string; fileSize?: number;
  };
  if (!body.name?.trim()) { res.status(400).json({ error: "File name required" }); return; }
  if (!body.objectPath) { res.status(400).json({ error: "Object path required" }); return; }
  const [record] = await db.insert(filesFoldersTable).values({
    userId: req.user!.id,
    name: body.name.trim(),
    parentId: body.parentId ?? null,
    isFolder: false,
    objectPath: body.objectPath,
    mimeType: body.mimeType ?? "",
    fileSize: body.fileSize ?? 0,
  }).returning();
  res.status(201).json({ item: record });
});

router.post("/tools/documents/files/:id/share", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const id = Number(req.params.id);
  const token = randomBytes(24).toString("hex");
  const [record] = await db.update(filesFoldersTable)
    .set({ isPublic: true, shareToken: token, updatedAt: new Date() })
    .where(and(eq(filesFoldersTable.id, id), eq(filesFoldersTable.userId, req.user!.id)))
    .returning();
  if (!record) { res.status(404).json({ error: "File not found" }); return; }
  res.json({ shareToken: token, item: record });
});

router.delete("/tools/documents/files/:id/share", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const id = Number(req.params.id);
  const [record] = await db.update(filesFoldersTable)
    .set({ isPublic: false, shareToken: null, updatedAt: new Date() })
    .where(and(eq(filesFoldersTable.id, id), eq(filesFoldersTable.userId, req.user!.id)))
    .returning();
  if (!record) { res.status(404).json({ error: "File not found" }); return; }
  res.json({ ok: true });
});

router.delete("/tools/documents/files/:id", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const id = Number(req.params.id);
  await db.delete(filesFoldersTable)
    .where(and(eq(filesFoldersTable.id, id), eq(filesFoldersTable.userId, req.user!.id)));
  res.json({ ok: true });
});

router.get("/tools/documents/files/shared/:token", async (req, res) => {
  const token = req.params.token;
  const [item] = await db.select().from(filesFoldersTable)
    .where(and(eq(filesFoldersTable.shareToken, token), eq(filesFoldersTable.isPublic, true)));
  if (!item || item.isFolder || !item.objectPath) {
    res.status(404).json({ error: "File not found or not shared" }); return;
  }
  try {
    const file = await objectStorage.getObjectEntityFile(item.objectPath);
    const response = await objectStorage.downloadObject(file);
    const headers = response.headers;
    headers.forEach((value, name) => { res.setHeader(name, value); });
    res.setHeader("Content-Disposition", `attachment; filename="${item.name}"`);
    if (response.body) {
      const { Readable } = await import("stream");
      Readable.fromWeb(response.body as never).pipe(res);
    } else {
      res.status(204).end();
    }
  } catch {
    res.status(404).json({ error: "File not accessible" });
  }
});

router.get("/tools/documents/files/:id/download", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const id = Number(req.params.id);
  const [item] = await db.select().from(filesFoldersTable)
    .where(and(eq(filesFoldersTable.id, id), eq(filesFoldersTable.userId, req.user!.id)));
  if (!item || item.isFolder || !item.objectPath) {
    res.status(404).json({ error: "File not found" }); return;
  }
  try {
    const file = await objectStorage.getObjectEntityFile(item.objectPath);
    const response = await objectStorage.downloadObject(file);
    const headers = response.headers;
    headers.forEach((value, name) => { res.setHeader(name, value); });
    res.setHeader("Content-Disposition", `attachment; filename="${item.name}"`);
    if (response.body) {
      const { Readable } = await import("stream");
      Readable.fromWeb(response.body as never).pipe(res);
    } else {
      res.status(204).end();
    }
  } catch {
    res.status(500).json({ error: "Download failed" });
  }
});

router.post("/tools/documents/uploads/request-url", async (req, res) => {
  if (!(await requirePro(req, res))) return;
  const body = req.body as { name?: string; size?: number; contentType?: string };
  if (!body.name || !body.contentType) {
    res.status(400).json({ error: "name and contentType required" }); return;
  }
  const uploadURL = await objectStorage.getObjectEntityUploadURL();
  const normalizedPath = objectStorage.normalizeObjectEntityPath(uploadURL);
  res.json({ uploadURL, objectPath: normalizedPath });
});

export default router;
