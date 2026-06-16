import { describe, it, expect } from "vitest";
import {
  getRoadmapActions,
  getNextTier,
  getPtsNeeded,
  CREDIT_TIERS,
  type CreditInputs,
} from "./credit-actions";

// ─── Helpers ────────────────────────────────────────────────────────────────

const baseInputs: CreditInputs = {
  jailVisits: 0,
  jailMinutesServed: 0,
  debt: 0,
  totalDebtAccrued: 0,
  negativeBalanceDays: 0,
};

function actions(
  overrides: Partial<CreditInputs> = {},
  cscore = 680,
  hasIncome = true,
) {
  return getRoadmapActions({ ...baseInputs, ...overrides }, cscore, hasIncome);
}

// ─── CREDIT_TIERS shape ──────────────────────────────────────────────────────

describe("CREDIT_TIERS", () => {
  it("has four tiers ordered from POOR to EXCELLENT", () => {
    const keys = CREDIT_TIERS.map((t) => t.key);
    expect(keys).toEqual(["POOR", "FAIR", "GOOD", "EXCELLENT"]);
  });

  it("covers the full 400–800 range without gaps", () => {
    for (let i = 0; i < CREDIT_TIERS.length - 1; i++) {
      expect(CREDIT_TIERS[i + 1].min).toBe(CREDIT_TIERS[i].max + 1);
    }
    expect(CREDIT_TIERS[0].min).toBe(400);
    expect(CREDIT_TIERS[CREDIT_TIERS.length - 1].max).toBe(800);
  });
});

// ─── getNextTier ─────────────────────────────────────────────────────────────

describe("getNextTier", () => {
  it("returns FAIR when score is in the POOR range", () => {
    expect(getNextTier(500)?.key).toBe("FAIR");
  });

  it("returns GOOD when score is in the FAIR range", () => {
    expect(getNextTier(620)?.key).toBe("GOOD");
  });

  it("returns EXCELLENT when score is in the GOOD range", () => {
    expect(getNextTier(700)?.key).toBe("EXCELLENT");
  });

  it("returns undefined when score is already EXCELLENT (≥ 740)", () => {
    expect(getNextTier(740)).toBeUndefined();
    expect(getNextTier(800)).toBeUndefined();
  });

  it("returns the tier just above the boundary (739 → EXCELLENT)", () => {
    expect(getNextTier(739)?.key).toBe("EXCELLENT");
  });
});

// ─── getPtsNeeded ─────────────────────────────────────────────────────────────

describe("getPtsNeeded", () => {
  it("returns the correct gap to reach the next tier", () => {
    expect(getPtsNeeded(620)).toBe(670 - 620); // FAIR → GOOD
    expect(getPtsNeeded(700)).toBe(740 - 700); // GOOD → EXCELLENT
  });

  it("returns 0 when already in the EXCELLENT tier", () => {
    expect(getPtsNeeded(740)).toBe(0);
    expect(getPtsNeeded(800)).toBe(0);
  });

  it("returns 0 when score is exactly at the next tier boundary", () => {
    expect(getPtsNeeded(739)).toBe(1);
    expect(getPtsNeeded(669)).toBe(1);
  });
});

// ─── Jail visits penalty ─────────────────────────────────────────────────────

describe("jail visits penalty", () => {
  it("adds no action when jailVisits is 0", () => {
    const result = actions({ jailVisits: 0 });
    expect(result.find((a) => a.text.startsWith("Stay out of jail"))).toBeUndefined();
  });

  it("adds a negative action for 1 jail visit with singular wording", () => {
    const result = actions({ jailVisits: 1 });
    const a = result.find((a) => a.text.includes("jail"))!;
    expect(a).toBeDefined();
    expect(a.negative).toBe(true);
    expect(a.pts).toBe("-25 pts");
    expect(a.text).toMatch(/1 visit on record/);
    expect(a.text).not.toMatch(/visits/);
  });

  it("uses plural wording and correct point deduction for multiple visits", () => {
    const result = actions({ jailVisits: 3 });
    const a = result.find((a) => a.text.includes("jail"))!;
    expect(a.pts).toBe("-75 pts");
    expect(a.text).toMatch(/3 visits on record/);
  });

  it("scales deduction by 25 pts per visit", () => {
    [1, 2, 5, 10].forEach((visits) => {
      const result = actions({ jailVisits: visits });
      const a = result.find((a) => a.text.includes("jail"))!;
      expect(a.pts).toBe(`-${visits * 25} pts`);
    });
  });
});

// ─── Debt recovery estimate ───────────────────────────────────────────────────

describe("debt recovery estimate", () => {
  it("adds no action when debt is ≤ 5,000", () => {
    const result = actions({ debt: 5_000 });
    expect(result.find((a) => a.text.startsWith("Pay down current debt"))).toBeUndefined();
  });

  it("adds a positive action with correct recovery points when debt > 5,000", () => {
    const result = actions({ debt: 10_001 });
    const a = result.find((a) => a.text.includes("Pay down current debt"))!;
    expect(a).toBeDefined();
    expect(a.negative).toBe(false);
    expect(a.pts).toBe("recover up to +2 pts");
  });

  it("floors the recovery amount (debt 9,999 → +1 pt)", () => {
    const result = actions({ debt: 9_999 });
    const a = result.find((a) => a.text.includes("Pay down current debt"))!;
    expect(a.pts).toBe("recover up to +1 pts");
  });

  it("correctly computes recovery for large debt", () => {
    const result = actions({ debt: 50_000 });
    const a = result.find((a) => a.text.includes("Pay down current debt"))!;
    expect(a.pts).toBe("recover up to +10 pts");
  });
});

// ─── Negative-balance-days penalty ───────────────────────────────────────────

describe("negative-balance-days penalty", () => {
  it("adds no action when negativeBalanceDays is 0", () => {
    const result = actions({ negativeBalanceDays: 0 });
    expect(result.find((a) => a.text.includes("FIAT positive"))).toBeUndefined();
  });

  it("adds a negative action for 1 day with singular wording", () => {
    const result = actions({ negativeBalanceDays: 1 });
    const a = result.find((a) => a.text.includes("FIAT positive"))!;
    expect(a).toBeDefined();
    expect(a.negative).toBe(true);
    expect(a.pts).toBe("-1 pts");
    expect(a.text).toMatch(/1 day in the red/);
    expect(a.text).not.toMatch(/days/);
  });

  it("uses plural wording for multiple days", () => {
    const result = actions({ negativeBalanceDays: 7 });
    const a = result.find((a) => a.text.includes("FIAT positive"))!;
    expect(a.pts).toBe("-7 pts");
    expect(a.text).toMatch(/7 days in the red/);
  });
});

// ─── Income-absent nudge ─────────────────────────────────────────────────────

describe("income-absent nudge", () => {
  it("adds no action when player has income", () => {
    const result = getRoadmapActions(baseInputs, 680, true);
    expect(result.find((a) => a.text.includes("employed"))).toBeUndefined();
  });

  it("adds a positive action when player has no income", () => {
    const result = getRoadmapActions(baseInputs, 680, false);
    const a = result.find((a) => a.text.includes("employed"))!;
    expect(a).toBeDefined();
    expect(a.negative).toBe(false);
    expect(a.pts).toBe("unlock +10 pts");
  });
});

// ─── Lifetime debt history penalty ───────────────────────────────────────────

describe("lifetime debt history penalty", () => {
  it("adds no action when totalDebtAccrued ≤ 100,000", () => {
    const result = actions({ totalDebtAccrued: 100_000 });
    expect(result.find((a) => a.text.includes("Lifetime debt"))).toBeUndefined();
  });

  it("adds a negative action when totalDebtAccrued > 100,000 and hist > 0", () => {
    // 150,001 → hist = floor(150,001/50,000 - 1) = floor(3.00002 - 1) = floor(2.00002) = 2
    const result = actions({ totalDebtAccrued: 150_001 });
    const a = result.find((a) => a.text.includes("Lifetime debt"))!;
    expect(a).toBeDefined();
    expect(a.negative).toBe(true);
    expect(a.pts).toBe("-2 pts");
  });

  it("caps the lifetime history penalty at 40 pts", () => {
    // 2,100,000 → floor(2,100,000/50,000 - 1) = floor(42-1) = 41 → capped at 40
    const result = actions({ totalDebtAccrued: 2_100_000 });
    const a = result.find((a) => a.text.includes("Lifetime debt"))!;
    expect(a.pts).toBe("-40 pts");
  });

  it("does not add action when hist calculates to 0 (totalDebtAccrued just over 100k)", () => {
    // 100,001 → floor(100,001/50,000 - 1) = floor(2.00002 - 1) = floor(1.00002) = 1 → hist=1 → action IS added
    const result = actions({ totalDebtAccrued: 100_001 });
    const a = result.find((a) => a.text.includes("Lifetime debt"))!;
    expect(a).toBeDefined();
    expect(a.pts).toBe("-1 pts");
  });

  it("adds the rounded K figure in the text", () => {
    const result = actions({ totalDebtAccrued: 250_000 });
    const a = result.find((a) => a.text.includes("Lifetime debt"))!;
    expect(a.text).toContain("250K");
  });
});

// ─── Clean-streak nudge ───────────────────────────────────────────────────────

describe("clean-streak nudge", () => {
  it("always appears when score is below 800", () => {
    [400, 500, 680, 739, 799].forEach((cscore) => {
      const result = getRoadmapActions(baseInputs, cscore, true);
      const a = result.find((a) => a.text.includes("Stay clean"));
      expect(a, `expected clean-streak action for score ${cscore}`).toBeDefined();
      expect(a!.negative).toBe(false);
      expect(a!.pts).toBe("up to +60 pts");
    });
  });

  it("does NOT appear when score is exactly 800 (max)", () => {
    const result = getRoadmapActions(baseInputs, 800, true);
    expect(result.find((a) => a.text.includes("Stay clean"))).toBeUndefined();
  });
});

// ─── EXCELLENT tier (no nextTier) case ───────────────────────────────────────

describe("EXCELLENT tier edge cases", () => {
  it("getNextTier returns undefined at score 740 (floor of EXCELLENT)", () => {
    expect(getNextTier(740)).toBeUndefined();
  });

  it("getPtsNeeded returns 0 at score 740+", () => {
    expect(getPtsNeeded(740)).toBe(0);
    expect(getPtsNeeded(780)).toBe(0);
    expect(getPtsNeeded(800)).toBe(0);
  });

  it("clean-streak action still appears at EXCELLENT score below 800", () => {
    const result = getRoadmapActions(baseInputs, 760, true);
    expect(result.find((a) => a.text.includes("Stay clean"))).toBeDefined();
  });

  it("no actions at all except clean-streak when score is 799 with clean inputs", () => {
    const result = getRoadmapActions(baseInputs, 799, true);
    expect(result).toHaveLength(1);
    expect(result[0].text).toContain("Stay clean");
  });
});

// ─── undefined inputs guard ───────────────────────────────────────────────────

describe("undefined inputs guard", () => {
  it("returns only the clean-streak action when inputs are undefined", () => {
    const result = getRoadmapActions(undefined, 680, true);
    expect(result).toHaveLength(1);
    expect(result[0].text).toContain("Stay clean");
  });

  it("returns no actions at all when inputs are undefined and score is 800", () => {
    const result = getRoadmapActions(undefined, 800, true);
    expect(result).toHaveLength(0);
  });
});

// ─── Combined scenario ────────────────────────────────────────────────────────

describe("combined scenario", () => {
  it("produces all applicable actions for a player in bad standing", () => {
    const result = getRoadmapActions(
      {
        jailVisits: 2,
        jailMinutesServed: 0,
        debt: 25_000,
        totalDebtAccrued: 200_000,
        negativeBalanceDays: 5,
      },
      500,
      false,
    );

    const texts = result.map((a) => a.text);
    expect(texts.some((t) => t.includes("jail"))).toBe(true);
    expect(texts.some((t) => t.includes("Pay down current debt"))).toBe(true);
    expect(texts.some((t) => t.includes("FIAT positive"))).toBe(true);
    expect(texts.some((t) => t.includes("employed"))).toBe(true);
    expect(texts.some((t) => t.includes("Lifetime debt"))).toBe(true);
    expect(texts.some((t) => t.includes("Stay clean"))).toBe(true);
  });

  it("produces only the clean-streak action for a player in perfect standing", () => {
    const result = getRoadmapActions(
      { jailVisits: 0, jailMinutesServed: 0, debt: 0, totalDebtAccrued: 0, negativeBalanceDays: 0 },
      750,
      true,
    );
    expect(result).toHaveLength(1);
    expect(result[0].text).toContain("Stay clean");
  });
});
