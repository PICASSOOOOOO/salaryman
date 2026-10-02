import { describe, expect, it } from "vitest";
import {
  classifyPabloCallAnswer,
  interpolatePabloScript,
  parsePabloOutboundScript,
  type PabloOutboundScript,
} from "./pablo-outbound-script";

const validFlow: PabloOutboundScript = {
  version: 1,
  businessName: "Northstar",
  opening: "This is a short call about our service.",
  startNodeId: "intro",
  closing: "Thank you for your time.",
  nodes: [
    {
      id: "intro",
      question: "Would you like to hear more?",
      yes: { response: "Great, I'll explain.", nextNodeId: "details" },
      no: { response: "No problem.", nextNodeId: null },
    },
    {
      id: "details",
      question: "Would you like to schedule a follow-up?",
      yes: { response: "I'll note that you are interested.", nextNodeId: null },
      no: { response: "Understood. Thanks for your time.", nextNodeId: null },
    },
  ],
};

describe("Pablo outbound script matrix", () => {
  it("accepts a reachable yes/no follow-up matrix", () => {
    expect(parsePabloOutboundScript(JSON.stringify(validFlow))).toEqual(validFlow);
  });

  it("rejects missing branches, cycles, and unreachable questions", () => {
    expect(() => parsePabloOutboundScript(JSON.stringify({
      ...validFlow,
      nodes: [{ ...validFlow.nodes[0], yes: { response: "", nextNodeId: "details" } }],
    }))).toThrow(/yes branch/i);

    const cycle = structuredClone(validFlow);
    cycle.nodes[1].yes.nextNodeId = "intro";
    expect(() => parsePabloOutboundScript(JSON.stringify(cycle))).toThrow(/loop/i);

    expect(() => parsePabloOutboundScript(JSON.stringify({
      ...validFlow,
      nodes: [...validFlow.nodes, {
        id: "unused",
        question: "Hidden question?",
        yes: { response: "Yes.", nextNodeId: null },
        no: { response: "No.", nextNodeId: null },
      }],
    }))).toThrow(/reachable/i);
  });

  it("distinguishes yes, no, stop, and unclear speech", () => {
    expect(classifyPabloCallAnswer("Yes, tell me more.")).toBe("yes");
    expect(classifyPabloCallAnswer("No thanks.")).toBe("no");
    expect(classifyPabloCallAnswer("Please stop calling me.")).toBe("stop");
    expect(classifyPabloCallAnswer("Maybe next month.")).toBeNull();
  });

  it("fills only the supported contact placeholders", () => {
    expect(interpolatePabloScript("Hi {{name}} at {{company}}", "Mina", "Acme"))
      .toBe("Hi Mina at Acme");
  });
});