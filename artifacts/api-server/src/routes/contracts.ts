import { Router, type Request, type Response, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getOpenAiTextModel } from "../lib/openai-models";
import { db, contractsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";

const router: IRouter = Router();
const LEGAL_META_PREFIX = "__SALARYMAN_LEGAL_META__";

interface LegalContractMeta {
  clientEmail: string;
  country: string;
  governingLaw: string;
  deliveryMethod: string;
  deliveryReference: string;
  sentAt: string | null;
  extraInstructions: string;
}

function getLegalMeta(value: string): LegalContractMeta {
  if (!value.startsWith(LEGAL_META_PREFIX)) {
    return {
      clientEmail: "",
      country: "",
      governingLaw: "",
      deliveryMethod: "not_sent",
      deliveryReference: "",
      sentAt: null,
      extraInstructions: value,
    };
  }
  try {
    const parsed = JSON.parse(value.slice(LEGAL_META_PREFIX.length)) as Partial<LegalContractMeta>;
    return {
      clientEmail: typeof parsed.clientEmail === "string" ? parsed.clientEmail : "",
      country: typeof parsed.country === "string" ? parsed.country : "",
      governingLaw: typeof parsed.governingLaw === "string" ? parsed.governingLaw : "",
      deliveryMethod: typeof parsed.deliveryMethod === "string" ? parsed.deliveryMethod : "not_sent",
      deliveryReference: typeof parsed.deliveryReference === "string" ? parsed.deliveryReference : "",
      sentAt: typeof parsed.sentAt === "string" ? parsed.sentAt : null,
      extraInstructions: typeof parsed.extraInstructions === "string" ? parsed.extraInstructions : "",
    };
  } catch {
    return getLegalMeta("");
  }
}

function toSavedContract(row: typeof contractsTable.$inferSelect) {
  const meta = getLegalMeta(row.extraClauses);
  return {
    ...row,
    clientEmail: meta.clientEmail,
    country: meta.country,
    jurisdiction: meta.governingLaw || row.jurisdiction,
    summary: row.scope,
    documentText: row.terms,
    deliveryMethod: meta.deliveryMethod,
    deliveryReference: meta.deliveryReference,
    sentAt: meta.sentAt,
  };
}

const CONTRACT_TYPES = {
  nda: {
    label: "Non-Disclosure Agreement (NDA)",
    blurb:
      "Mutual or one-way confidentiality agreement protecting trade secrets, business plans, customer lists, and other proprietary information disclosed between the parties.",
    sections: [
      "Parties & Effective Date",
      "Definition of Confidential Information",
      "Permitted Use & Restrictions",
      "Exclusions (publicly known, independently developed, etc.)",
      "Term & Survival",
      "Return / Destruction of Materials",
      "Remedies (injunctive relief)",
      "Governing Law & Venue",
      "Signatures",
    ],
  },
  service: {
    label: "Master Services Agreement (MSA / SOW)",
    blurb:
      "Professional services agreement covering scope of work, deliverables, fees, IP ownership, warranties, indemnification, and termination.",
    sections: [
      "Parties & Effective Date",
      "Scope of Services / Statement of Work",
      "Deliverables & Acceptance Criteria",
      "Fees, Invoicing & Payment Terms",
      "Term & Termination (for cause and convenience)",
      "Intellectual Property Ownership & Licenses",
      "Confidentiality",
      "Warranties & Disclaimers",
      "Limitation of Liability & Indemnification",
      "Independent Contractor Status",
      "Governing Law, Dispute Resolution & Venue",
      "Signatures",
    ],
  },
  employment: {
    label: "Employment Agreement (W-2)",
    blurb:
      "Full-time / part-time employment agreement covering compensation, benefits, at-will status, IP assignment, confidentiality, and post-employment restrictions where enforceable.",
    sections: [
      "Parties & Start Date",
      "Position, Duties & Reporting",
      "Compensation (base, bonus, equity)",
      "Benefits & PTO",
      "At-Will Employment Statement",
      "Confidentiality & Trade Secrets",
      "Inventions & IP Assignment",
      "Non-Solicitation / Non-Compete (state-law caveats)",
      "Termination & Severance",
      "Governing Law & Venue",
      "Signatures",
    ],
  },
  contractor: {
    label: "Independent Contractor Agreement (1099)",
    blurb:
      "1099 contractor engagement with explicit independent-contractor status, deliverables, payment, IP work-for-hire, and tax responsibility allocation.",
    sections: [
      "Parties & Effective Date",
      "Services & Deliverables",
      "Compensation & Payment Schedule",
      "Independent Contractor Status (no benefits, contractor pays own taxes)",
      "Work-for-Hire / IP Assignment",
      "Confidentiality",
      "Term & Termination",
      "Indemnification & Limitation of Liability",
      "Governing Law & Venue",
      "Signatures",
    ],
  },
  sales: {
    label: "Sales Agreement / Purchase Order Terms",
    blurb:
      "Goods or services sale covering price, delivery, title transfer, warranties, returns, and risk of loss.",
    sections: [
      "Parties & Effective Date",
      "Description of Goods / Services",
      "Price, Taxes & Payment Terms",
      "Delivery, Title & Risk of Loss",
      "Warranties & Disclaimers",
      "Returns / Refunds / Cancellation",
      "Limitation of Liability",
      "Force Majeure",
      "Governing Law & Venue",
      "Signatures",
    ],
  },
  lease: {
    label: "Commercial Lease Agreement",
    blurb:
      "Commercial real estate lease covering premises, term, rent, CAM, use restrictions, maintenance, insurance, default, and assignment.",
    sections: [
      "Parties & Premises",
      "Term & Renewal Options",
      "Base Rent, CAM & Escalations",
      "Security Deposit",
      "Permitted Use & Restrictions",
      "Maintenance, Repairs & Utilities",
      "Insurance & Indemnification",
      "Assignment & Subletting",
      "Default & Remedies",
      "Surrender & Holdover",
      "Governing Law & Venue",
      "Signatures",
    ],
  },
  partnership: {
    label: "Partnership / Operating Agreement",
    blurb:
      "Multi-member LLC operating agreement or general partnership agreement covering capital contributions, profit allocation, management, and dissolution.",
    sections: [
      "Parties, Entity Name & Effective Date",
      "Purpose & Term",
      "Capital Contributions & Ownership %",
      "Profit / Loss Allocation & Distributions",
      "Management & Voting Rights",
      "Books, Records & Tax Matters",
      "Transfer Restrictions & Right of First Refusal",
      "Withdrawal, Dissolution & Buyout",
      "Dispute Resolution",
      "Governing Law & Venue",
      "Signatures",
    ],
  },
  licensing: {
    label: "Software / IP Licensing Agreement",
    blurb:
      "Grant of license to software, trademarks, or other IP with scope, exclusivity, royalties, support, and termination.",
    sections: [
      "Parties & Effective Date",
      "Definition of Licensed IP",
      "License Grant (scope, territory, exclusivity, sublicense rights)",
      "Restrictions on Use",
      "Royalties / Fees / Reporting",
      "Ownership & Reservation of Rights",
      "Warranties, Indemnification & Limitation of Liability",
      "Term & Termination",
      "Effect of Termination",
      "Governing Law & Venue",
      "Signatures",
    ],
  },
} as const;

type ContractType = keyof typeof CONTRACT_TYPES;

router.get("/business/contracts/types", (_req: Request, res: Response): void => {
  res.json({
    types: Object.entries(CONTRACT_TYPES).map(([key, def]) => ({
      key,
      label: def.label,
      blurb: def.blurb,
      sections: def.sections,
    })),
  });
});

router.get("/business/contracts/saved", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated() || !req.user?.id) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const contracts = await db.select().from(contractsTable)
    .where(eq(contractsTable.userId, req.user.id))
    .orderBy(desc(contractsTable.createdAt))
    .limit(50);
  res.json({ contracts: contracts.map(toSavedContract) });
});

router.post("/business/contracts/save", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated() || !req.user?.id) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const body = req.body ?? {};
  const type = typeof body.type === "string" ? body.type : "";
  const def = CONTRACT_TYPES[type as ContractType];
  const partyA = typeof body.partyA === "string" ? body.partyA.trim().slice(0, 300) : "";
  const partyB = typeof body.partyB === "string" ? body.partyB.trim().slice(0, 300) : "";
  const documentText = typeof body.documentText === "string" ? body.documentText.trim() : "";
  const clientEmail = typeof body.clientEmail === "string" ? body.clientEmail.trim().slice(0, 300) : "";
  const country = typeof body.country === "string" ? body.country.trim().slice(0, 100) : "";
  const jurisdiction = typeof body.governingLaw === "string" ? body.governingLaw.trim().slice(0, 200) : "";
  const summary = typeof body.summary === "string" ? body.summary.trim().slice(0, 6000) : "";
  if (!def || !partyA || !partyB || !documentText || !country) {
    res.status(400).json({ error: "Contract type, both parties, country, and generated contract text are required." });
    return;
  }
  if (documentText.length > 60_000) {
    res.status(413).json({ error: "Contract too long (60k character max)." });
    return;
  }
  const [contract] = await db.insert(contractsTable).values({
    userId: req.user.id,
    templateType: type,
    partyA,
    partyB,
    startDate: typeof body.effectiveDate === "string" ? body.effectiveDate.slice(0, 20) : "",
    terms: documentText,
    scope: summary,
    jurisdiction: [country, jurisdiction].filter(Boolean).join(" — ").slice(0, 200),
    extraClauses: `${LEGAL_META_PREFIX}${JSON.stringify({
      clientEmail,
      country,
      governingLaw: jurisdiction,
      deliveryMethod: "not_sent",
      deliveryReference: "",
      sentAt: null,
      extraInstructions: typeof body.extraInstructions === "string" ? body.extraInstructions.slice(0, 10_000) : "",
    } satisfies LegalContractMeta)}`,
    status: "draft",
  }).returning();
  res.status(201).json({ contract: toSavedContract(contract) });
});

router.post("/business/contracts/saved/:id/delivery", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated() || !req.user?.id) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const id = Number(req.params.id);
  const method = typeof req.body?.method === "string" ? req.body.method.trim().slice(0, 60) : "";
  const reference = typeof req.body?.reference === "string" ? req.body.reference.trim().slice(0, 2000) : "";
  if (!Number.isSafeInteger(id) || id <= 0 || !method || method === "not_sent") {
    res.status(400).json({ error: "A valid contract and delivery method are required." });
    return;
  }
  const [before] = await db.select().from(contractsTable)
    .where(and(eq(contractsTable.id, id), eq(contractsTable.userId, req.user.id)))
    .limit(1);
  if (!before) {
    res.status(404).json({ error: "Contract not found." });
    return;
  }
  const meta = getLegalMeta(before.extraClauses);
  const [contract] = await db.update(contractsTable).set({
    extraClauses: `${LEGAL_META_PREFIX}${JSON.stringify({
      ...meta,
      deliveryMethod: method,
      deliveryReference: reference,
      sentAt: new Date().toISOString(),
    })}`,
    status: "sent",
    updatedAt: new Date(),
  }).where(and(eq(contractsTable.id, id), eq(contractsTable.userId, req.user.id))).returning();
  if (!contract) {
    res.status(404).json({ error: "Contract not found." });
    return;
  }
  res.json({ contract: toSavedContract(contract) });
});

router.post("/business/contracts/draft", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }

  const {
    type,
    partyA,
    partyB,
    governingLaw,
    country,
    effectiveDate,
    terms,
    extraInstructions,
  } = req.body ?? {};

  const def = CONTRACT_TYPES[type as ContractType];
  if (!def) {
    res.status(400).json({ error: `Unknown contract type. Choose one of: ${Object.keys(CONTRACT_TYPES).join(", ")}` });
    return;
  }

  const partyAName = String(partyA ?? "").trim();
  const partyBName = String(partyB ?? "").trim();
  if (!partyAName || !partyBName) {
    res.status(400).json({ error: "Both parties (partyA and partyB) are required." });
    return;
  }

  const countryName = String(country ?? "").trim();
  if (!countryName || countryName.length > 100) {
    res.status(400).json({ error: "Country is required for a jurisdiction-aware draft." });
    return;
  }
  const jurisdiction = String(governingLaw ?? "").trim().slice(0, 200);
  const effective = String(effectiveDate ?? "").trim() || new Date().toISOString().slice(0, 10);
  const userTerms = String(terms ?? "").trim();
  const extras = String(extraInstructions ?? "").trim();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const sectionList = def.sections.map((s, i) => `  ${i + 1}. ${s}`).join("\n");

    const system = `You are a legal-document drafting assistant preparing a ${def.label} for two parties. You are not a lawyer and must not claim the draft is enforceable, legally sufficient, or attorney-approved. Draft a practical, neutral first draft using the country and jurisdiction supplied. Do not invent statutes, cite rules you cannot verify, or imply that one country's template works elsewhere. If the requested country requires specialized local counsel or the relevant law is uncertain, flag that clearly for attorney review.

Begin with a "Plain-language summary" section (3–6 sentences that explains the deal, key obligations, and unresolved details), followed by a complete draft for review and signature preparation. Use Markdown headings (##) for each section. Number all sections and subsections. Use defined terms consistently. Mark unsupplied facts with [BRACKETED PLACEHOLDER].

Always end with:
1. A "Notice" section stating this is an AI-generated draft and not legal advice, and recommending review by a qualified lawyer in the relevant jurisdiction before signature.
2. Signature blocks for both parties (name, title, date).

Required sections for this ${def.label}:
${sectionList}

Tone: professional and neutral. Flag jurisdiction-dependent clauses and material unresolved terms in "Negotiation Notes"; do not describe the draft as ready for execution without lawyer review.`;

    const userMsg = `Draft a ${def.label}.

Party A: ${partyAName}
Party B: ${partyBName}
Effective Date: ${effective}
Country: ${countryName}
State / Province / Territory / Governing Law / Venue (if supplied): ${jurisdiction || "[NOT SPECIFIED — flag for review]"}

Key business terms supplied by the user:
${userTerms || "(none — use reasonable industry-standard defaults and mark unsupplied facts with [BRACKETED PLACEHOLDERS])"}

Additional instructions:
${extras || "(none)"}

Draft the full contract now. End with the Notice + Signature blocks + (if any concerns) Negotiation Notes.`;

    const stream = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      stream: true,
      max_completion_tokens: 4000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) send("token", { text: delta });
    }
    send("done", { ok: true });
    res.end();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error drafting contract";
    send("error", { error: msg });
    res.end();
  }
});

router.post("/business/contracts/review", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const { text, perspective } = req.body ?? {};
  const body = String(text ?? "").trim();
  if (!body) {
    res.status(400).json({ error: "Contract text required." });
    return;
  }
  if (body.length > 60_000) {
    res.status(413).json({ error: "Contract too long (60k char max). Split into sections." });
    return;
  }
  const lens = String(perspective ?? "").trim() || "neutral";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const system = `You are a senior US business attorney performing a contract review for the ${lens} party. Identify:
- HIGH-RISK clauses (unbounded liability, one-sided indemnification, automatic renewal traps, IP overreach, illegal non-competes in CA/ND/OK, missing limitation of liability, etc.)
- MISSING standard protections (confidentiality, governing law, dispute resolution, force majeure, severability, entire agreement)
- AMBIGUOUS or undefined terms
- NEGOTIATION LEVERS the ${lens} side should push back on, with specific redline suggestions

Format:
## Executive Summary
(2-3 sentence verdict: sign / negotiate / walk away)

## High-Risk Clauses
- **[Clause name]** — what's wrong, why it matters, suggested redline

## Missing Protections
- **[Protection]** — why you need it, where to add it

## Ambiguities
- **[Term]** — current language, why ambiguous, suggested fix

## Negotiation Priorities (ranked)
1. ...

## Notice
This is an AI-generated review, not legal advice. Engage a licensed attorney in the relevant jurisdiction before signing.`;

    const stream = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      stream: true,
      max_completion_tokens: 3000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Review this contract from the ${lens} party's perspective:\n\n${body}` },
      ],
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) send("token", { text: delta });
    }
    send("done", { ok: true });
    res.end();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error reviewing contract";
    send("error", { error: msg });
    res.end();
  }
});

export default router;
