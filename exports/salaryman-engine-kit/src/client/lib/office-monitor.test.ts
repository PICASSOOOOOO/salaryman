import { describe, it, expect } from "vitest";
import {
  statusKey,
  isAwake,
  isFaulted,
  podState,
  partitionByActivation,
  teamKey,
  teamMeta,
  skillLabel,
  botSkills,
  teamSkills,
  groupByTeam,
  floorPlacement,
  type MonitorBot,
} from "./office-monitor";

function bot(p: Partial<MonitorBot> & { id: number }): MonitorBot {
  return {
    name: `BOT-${p.id}`,
    status: "paused",
    ...p,
  } as MonitorBot;
}

describe("statusKey", () => {
  it("passes through the three known states", () => {
    expect(statusKey("active")).toBe("active");
    expect(statusKey("paused")).toBe("paused");
    expect(statusKey("error")).toBe("error");
  });
  it("treats unknown / null / undefined as paused (dormant)", () => {
    expect(statusKey("zzz")).toBe("paused");
    expect(statusKey(null)).toBe("paused");
    expect(statusKey(undefined)).toBe("paused");
  });
});

describe("isAwake / activation gate", () => {
  it("is awake ONLY when activated (status active)", () => {
    expect(isAwake(bot({ id: 1, status: "active" }))).toBe(true);
    expect(isAwake(bot({ id: 2, status: "paused" }))).toBe(false);
    expect(isAwake(bot({ id: 3, status: "error" }))).toBe(false);
    expect(isAwake(bot({ id: 4, status: "whatever" }))).toBe(false);
  });
});

describe("partitionByActivation", () => {
  it("splits working crew from sleeping capsules", () => {
    const { working, asleep } = partitionByActivation([
      bot({ id: 1, status: "active" }),
      bot({ id: 2, status: "paused" }),
      bot({ id: 3, status: "error" }),
      bot({ id: 4, status: "active" }),
    ]);
    expect(working.map((b) => b.id)).toEqual([1, 4]);
    expect(asleep.map((b) => b.id)).toEqual([2, 3]);
  });
  it("puts everything to sleep when nothing is activated", () => {
    const { working, asleep } = partitionByActivation([
      bot({ id: 1 }),
      bot({ id: 2 }),
    ]);
    expect(working).toHaveLength(0);
    expect(asleep).toHaveLength(2);
  });
});

describe("teams", () => {
  it("defaults a missing/blank department to general", () => {
    expect(teamKey(bot({ id: 1 }))).toBe("general");
    expect(teamKey(bot({ id: 2, department: "" }))).toBe("general");
    expect(teamKey(bot({ id: 3, department: "  " }))).toBe("general");
  });
  it("lower-cases the department", () => {
    expect(teamKey(bot({ id: 1, department: "Trading" }))).toBe("trading");
  });
  it("gives known teams a label + accent, and titlecases unknown ones", () => {
    expect(teamMeta("trading").label).toBe("Trading Desk");
    expect(teamMeta("trading").accent).toMatch(/^#/);
    expect(teamMeta("growth_ops").label).toBe("Growth Ops");
  });
});

describe("skills", () => {
  it("humanises known + unknown permission keys", () => {
    expect(skillLabel("trading_execute")).toBe("Trade Exec");
    expect(skillLabel("ai_chat")).toBe("Chat");
    expect(skillLabel("custom_power")).toBe("Custom Power");
  });
  it("de-dupes a bot's skills preserving order", () => {
    expect(
      botSkills(bot({ id: 1, permissions: ["ai_chat", "ai_chat", "email_send"] })),
    ).toEqual(["Chat", "Email"]);
  });
  it("unions team skills sorted", () => {
    const skills = teamSkills([
      bot({ id: 1, permissions: ["email_send"] }),
      bot({ id: 2, permissions: ["ai_chat", "crm_write"] }),
    ]);
    expect(skills).toEqual(["Chat", "CRM Write", "Email"]);
  });
});

describe("groupByTeam", () => {
  it("orders teams by the canonical order, unknowns alpha after known", () => {
    const groups = groupByTeam([
      bot({ id: 1, department: "zeta" }),
      bot({ id: 2, department: "marketing" }),
      bot({ id: 3, department: "trading" }),
      bot({ id: 4, department: "alpha" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual([
      "trading",
      "marketing",
      "alpha",
      "zeta",
    ]);
  });

  it("clusters similar skills together within a team, then by name", () => {
    const groups = groupByTeam([
      bot({ id: 1, name: "ZED", department: "sales", permissions: ["ai_chat"] }),
      bot({ id: 2, name: "ABE", department: "sales", permissions: ["crm_write"] }),
      bot({ id: 3, name: "AMY", department: "sales", permissions: ["ai_chat"] }),
    ]);
    expect(groups).toHaveLength(1);
    // ai_chat group (AMY, ZED by name) before crm_write (ABE)
    expect(groups[0].bots.map((b) => b.name)).toEqual(["AMY", "ZED", "ABE"]);
  });

  it("reports working vs asleep counts per team", () => {
    const groups = groupByTeam([
      bot({ id: 1, department: "support", status: "active" }),
      bot({ id: 2, department: "support", status: "paused" }),
      bot({ id: 3, department: "support", status: "error" }),
    ]);
    expect(groups[0].workingCount).toBe(1);
    expect(groups[0].asleepCount).toBe(2);
  });

  it("returns an empty list for an empty roster", () => {
    expect(groupByTeam([])).toEqual([]);
  });
});

describe("isFaulted / podState", () => {
  it("only flags errored bots as faulted", () => {
    expect(isFaulted(bot({ id: 1, status: "error" }))).toBe(true);
    expect(isFaulted(bot({ id: 2, status: "active" }))).toBe(false);
    expect(isFaulted(bot({ id: 3, status: "paused" }))).toBe(false);
  });

  it("treats an errored bot as a CAPSULE (asleep), never awake", () => {
    const errored = bot({ id: 1, status: "error" });
    expect(isAwake(errored)).toBe(false);
    expect(podState(errored)).toBe("fault");
  });

  it("an errored bot lands in the asleep partition, not working", () => {
    const { working, asleep } = partitionByActivation([
      bot({ id: 1, status: "active" }),
      bot({ id: 2, status: "error" }),
      bot({ id: 3, status: "paused" }),
    ]);
    expect(working.map((b) => b.id)).toEqual([1]);
    expect(asleep.map((b) => b.id)).toEqual([2, 3]);
  });

  it("maps each status to its pod visual state", () => {
    expect(podState(bot({ id: 1, status: "active" }))).toBe("working");
    expect(podState(bot({ id: 2, status: "paused" }))).toBe("asleep");
    expect(podState(bot({ id: 3, status: "error" }))).toBe("fault");
    // unknown/null statuses fall back to a plain capsule
    expect(podState(bot({ id: 4, status: null }))).toBe("asleep");
  });
});

describe("floorPlacement", () => {
  it("sends activated bots to desks and everyone else to capsules", () => {
    const { deskBots, capsuleBots } = floorPlacement([
      bot({ id: 1, status: "active" }),
      bot({ id: 2, status: "paused" }),
      bot({ id: 3, status: "error" }),
    ]);
    expect(deskBots.map((b) => b.id)).toEqual([1]);
    expect(capsuleBots.map((b) => b.id).sort()).toEqual([2, 3]);
  });

  it("clusters both populations by team order", () => {
    const { deskBots, capsuleBots } = floorPlacement([
      bot({ id: 1, department: "sales", status: "active" }),
      bot({ id: 2, department: "trading", status: "active" }),
      bot({ id: 3, department: "sales", status: "paused" }),
      bot({ id: 4, department: "trading", status: "paused" }),
    ]);
    // trading (TEAM_ORDER[0]) before sales (TEAM_ORDER[1]) in both lists
    expect(deskBots.map((b) => b.id)).toEqual([2, 1]);
    expect(capsuleBots.map((b) => b.id)).toEqual([4, 3]);
  });

  it("attaches each bot's team colour + label", () => {
    const { deskBots } = floorPlacement([
      bot({ id: 1, department: "trading", status: "active" }),
    ]);
    expect(deskBots[0].teamColor).toBe("#fbbf24");
    expect(deskBots[0].teamLabel).toBe("Trading Desk");
  });

  it("normalises status onto the FloorBot", () => {
    const { capsuleBots } = floorPlacement([bot({ id: 1, status: null })]);
    expect(capsuleBots[0].status).toBe("paused");
  });

  it("handles an empty roster", () => {
    expect(floorPlacement([])).toEqual({ deskBots: [], capsuleBots: [] });
  });
});
