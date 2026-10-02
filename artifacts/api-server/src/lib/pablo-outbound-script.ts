export type PabloScriptBranch = {
  response: string;
  nextNodeId: string | null;
  transferToUserId: string | null;
};

export type PabloScriptNode = {
  id: string;
  question: string;
  yes: PabloScriptBranch;
  no: PabloScriptBranch;
};

export type PabloOutboundScript = {
  version: 1;
  businessName: string;
  opening: string;
  startNodeId: string;
  closing: string;
  nodes: PabloScriptNode[];
};

const MAX_NODES = 8;
const MAX_LINE_LENGTH = 1200;

export function parsePabloOutboundScript(raw: string): PabloOutboundScript {
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    throw new Error("Script matrix must be valid JSON");
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("Script matrix is required");
  }

  const value = candidate as Record<string, unknown>;
  const businessName = cleanLine(value.businessName, "Business name", 120);
  const opening = cleanLine(value.opening, "Opening", MAX_LINE_LENGTH);
  const closing = cleanLine(value.closing, "Closing", MAX_LINE_LENGTH);
  const startNodeId = cleanId(value.startNodeId, "Starting question");
  if (value.version !== 1 || !Array.isArray(value.nodes) || value.nodes.length === 0 || value.nodes.length > MAX_NODES) {
    throw new Error(`Add between 1 and ${MAX_NODES} script questions`);
  }

  const nodes = value.nodes.map((rawNode, index): PabloScriptNode => {
    if (!rawNode || typeof rawNode !== "object" || Array.isArray(rawNode)) {
      throw new Error(`Question ${index + 1} is invalid`);
    }
    const node = rawNode as Record<string, unknown>;
    return {
      id: cleanId(node.id, `Question ${index + 1} ID`),
      question: cleanLine(node.question, `Question ${index + 1}`, MAX_LINE_LENGTH),
      yes: parseBranch(node.yes, `Question ${index + 1} yes branch`),
      no: parseBranch(node.no, `Question ${index + 1} no branch`),
    };
  });

  const ids = new Set<string>();
  for (const node of nodes) {
    if (ids.has(node.id)) throw new Error("Question IDs must be unique");
    ids.add(node.id);
  }
  if (!ids.has(startNodeId)) throw new Error("Starting question does not exist");

  for (const node of nodes) {
    for (const branch of [node.yes, node.no]) {
      if (branch.nextNodeId && !ids.has(branch.nextNodeId)) {
        throw new Error(`Question ${node.id} points to a missing follow-up`);
      }
      if (branch.nextNodeId === node.id) throw new Error("A question cannot point to itself");
    }
  }

  assertAcyclicReachable(nodes, startNodeId);
  return { version: 1, businessName, opening, startNodeId, closing, nodes };
}

function cleanLine(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new Error(`${label} is required (maximum ${maxLength} characters)`);
  }
  return value.trim();
}

function cleanId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,48}$/.test(value)) {
    throw new Error(`${label} has an invalid ID`);
  }
  return value;
}

function parseBranch(value: unknown, label: string): PabloScriptBranch {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is required`);
  }
  const branch = value as Record<string, unknown>;
  const nextNodeId = branch.nextNodeId == null || branch.nextNodeId === ""
    ? null
    : cleanId(branch.nextNodeId, `${label} follow-up`);
  const transferToUserId = cleanTransferUserId(branch.transferToUserId, label);
  if (nextNodeId && transferToUserId) {
    throw new Error(`${label} cannot both continue to a follow-up and transfer to an employee`);
  }
  return {
    response: cleanLine(branch.response, label, MAX_LINE_LENGTH),
    nextNodeId,
    transferToUserId,
  };
}

function cleanTransferUserId(value: unknown, label: string): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^[a-zA-Z0-9._:-]{1,256}$/.test(value)) {
    throw new Error(`${label} has an invalid employee transfer target`);
  }
  return value;
}

function assertAcyclicReachable(nodes: PabloScriptNode[], startNodeId: string): void {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error("Script follow-ups cannot contain a loop");
    if (visited.has(id)) return;
    visiting.add(id);
    const node = byId.get(id);
    if (!node) return;
    for (const branch of [node.yes, node.no]) {
      if (branch.nextNodeId) visit(branch.nextNodeId);
    }
    visiting.delete(id);
    visited.add(id);
  };
  visit(startNodeId);
  if (visited.size !== nodes.length) throw new Error("Every question must be reachable from the starting question");
}

export function classifyPabloCallAnswer(text: string): "yes" | "no" | "stop" | null {
  const answer = text.trim().toLowerCase().replace(/[’']/g, "'");
  if (/\b(?:stop|remove me|take me off|do not call|don't call|never call|no more calls|unsubscribe)\b/.test(answer)) {
    return "stop";
  }
  if (/^(?:yes|yeah|yep|yup|sure|correct|okay|ok|absolutely|please do)\b/.test(answer)) return "yes";
  if (/^(?:no|nope|nah|not interested|not now|no thanks|no thank you)\b/.test(answer)) return "no";
  return null;
}

export function interpolatePabloScript(text: string, leadName: string, companyName: string): string {
  return text
    .replace(/\{\{\s*name\s*\}\}/gi, leadName || "there")
    .replace(/\{\{\s*company\s*\}\}/gi, companyName);
}