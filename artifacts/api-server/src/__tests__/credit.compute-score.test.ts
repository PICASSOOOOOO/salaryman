import { describe, it, expect } from "vitest";
import { applicationAprBps, computeScore } from "../routes/credit";

type Led = Parameters<typeof computeScore>[0];

function makeInput(overrides: Partial<Led> = {}): Led {
  return {
    jailVisits: 0,
    jailMinutesServed: 0,
    debt: 0,
    inGameDebt: 0,
    totalDebtAccrued: 0,
    negativeBalanceDays: 0,
    lastNegativeAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3_600_000);
}

describe("computeScore — unit tests", () => {
  describe("baseline", () => {
    it("returns 680 for a brand-new account with no history and no income", () => {
      const score = computeScore(makeInput());
      expect(score).toBe(680);
    });
  });

  describe("jail penalty", () => {
    it("subtracts 25 per jail visit", () => {
      const score = computeScore(makeInput({ jailVisits: 2 }));
      expect(score).toBe(680 - 2 * 25);
    });

    it("subtracts 1 per 10 minutes served (floored)", () => {
      const score = computeScore(makeInput({ jailMinutesServed: 53 }));
      expect(score).toBe(680 - Math.floor(53 / 10));
    });
  });

  describe("debt penalty", () => {
    it("subtracts 1 per ƒ5 000 of current bank/CF debt", () => {
      const score = computeScore(makeInput({ debt: 15_000 }));
      expect(score).toBe(680 - 3);
    });

    it("subtracts 1 per ƒ5 000 of in-game obligations (tax debt, bounties, loans)", () => {
      const score = computeScore(makeInput({ inGameDebt: 20_000 }));
      expect(score).toBe(680 - 4);
    });

    it("bank debt and in-game debt are each penalised independently", () => {
      const score = computeScore(makeInput({ debt: 10_000, inGameDebt: 5_000 }));
      expect(score).toBe(680 - 2 - 1);
    });

    it("subtracts 1 per ƒ50 000 of lifetime debt accrued", () => {
      const score = computeScore(makeInput({ totalDebtAccrued: 150_000 }));
      expect(score).toBe(680 - 3);
    });
  });

  describe("negative-balance-days penalty", () => {
    it("subtracts 1 per day spent under water", () => {
      const score = computeScore(makeInput({ negativeBalanceDays: 12 }));
      expect(score).toBe(680 - 12);
    });
  });

  describe("clean-streak bonus", () => {
    it("adds +5 per 7 hours clean (partial weeks grant nothing)", () => {
      const score = computeScore(makeInput({ lastNegativeAt: hoursAgo(21) }));
      expect(score).toBe(680 + 15);
    });

    it("counts from account creation when there has never been a negative event", () => {
      const score = computeScore(makeInput({ createdAt: hoursAgo(21) }));
      expect(score).toBe(680 + 15);
    });

    it("caps the clean-streak bonus at +60", () => {
      const score = computeScore(makeInput({ lastNegativeAt: hoursAgo(200) }));
      expect(score).toBe(680 + 60);
    });
  });

  describe("debt-to-income ratio", () => {
    it("adds +15 for low DTI (debt < 1× monthly income)", () => {
      const score = computeScore(makeInput({ debt: 500 }), 5_000);
      expect(score).toBe(680 + 15 + 10);
    });

    it("adds +15 for zero debt when income > 0 (DTI = 0)", () => {
      const score = computeScore(makeInput(), 5_000);
      expect(score).toBe(680 + 15 + 10);
    });

    it("applies no DTI bonus or penalty when DTI is between 1 and 5", () => {
      // debt=10_000 → debt penalty −2; DTI=2 (neutral band); income presence +10
      const score = computeScore(makeInput({ debt: 10_000 }), 5_000);
      expect(score).toBe(680 - 2 + 10);
    });

    it("penalises high DTI (debt > 5× monthly income)", () => {
      // debt=60_000 → debt penalty −12; DTI=12 → penalty −min(80,56)=−56; income +10
      const score = computeScore(makeInput({ debt: 60_000 }), 5_000);
      expect(score).toBe(680 - 12 - 56 + 10);
    });

    it("caps the DTI high penalty at −80", () => {
      // debt=100_000 → debt penalty −20; DTI=20 → penalty −min(80,120)=−80; income +10
      const s1 = computeScore(makeInput({ debt: 100_000 }), 5_000);
      expect(s1).toBe(680 - 20 - 80 + 10);
      // Doubling debt doesn't push DTI penalty beyond −80
      const s2 = computeScore(makeInput({ debt: 200_000 }), 5_000);
      const debtPenaltyDelta = Math.floor(200_000 / 5_000) - Math.floor(100_000 / 5_000);
      expect(s1 - s2).toBe(debtPenaltyDelta); // only debt-per-5k changes, not DTI cap
    });

    it("adds +10 income-presence bonus whenever monthly income > 0", () => {
      const withIncome = computeScore(makeInput(), 1_000);
      const withoutIncome = computeScore(makeInput());
      expect(withIncome - withoutIncome).toBe(15 + 10);
    });
  });

  describe("historical-leverage penalty", () => {
    it("penalises chronic borrowers when lifetime accrual > 2× annual income", () => {
      // totalDebtAccrued=360_000, income=5_000
      // totalDebtAccrued penalty: floor(360000/50000)=7 → −7
      // DTI: debt=0 → dti=0 <1 → +15
      // income presence: +10
      // annualIncome=60000, leverage=6 → leveragePenalty=min(40,floor((6-2)*6))=24 → −24
      const score = computeScore(makeInput({ totalDebtAccrued: 360_000 }), 5_000);
      expect(score).toBe(680 - 7 + 15 + 10 - 24);
    });

    it("applies no historical-leverage penalty below 2× annual income", () => {
      // totalDebtAccrued=50_000, income=5_000
      // totalDebtAccrued penalty: floor(50000/50000)=1 → −1
      // DTI: debt=0 → +15; income: +10
      // leverage=50000/60000=0.83 <2 → no leverage penalty
      const score = computeScore(makeInput({ totalDebtAccrued: 50_000 }), 5_000);
      expect(score).toBe(680 - 1 + 15 + 10);
    });

    it("caps the historical-leverage penalty at −40", () => {
      // totalDebtAccrued=1_000_000, income=1_000
      // totalDebtAccrued penalty: floor(1000000/50000)=20 → −20
      // DTI: debt=0 → +15; income: +10
      // leverage=1000000/12000=83.3>2 → penalty=min(40,floor((83.3-2)*6))=40 → −40
      const s1 = computeScore(makeInput({ totalDebtAccrued: 1_000_000 }), 1_000);
      expect(s1).toBe(680 - 20 + 15 + 10 - 40);

      // Quadrupling the debt doesn't push the leverage penalty past −40
      // (totalDebtAccrued penalty grows independently, but leverage cap holds)
      const s2 = computeScore(makeInput({ totalDebtAccrued: 4_000_000 }), 1_000);
      const extraTdaPenalty = Math.floor(4_000_000 / 50_000) - Math.floor(1_000_000 / 50_000);
      expect(s1 - s2).toBe(extraTdaPenalty);
    });
  });

  describe("floor and ceiling", () => {
    it("never returns a score below 400", () => {
      const score = computeScore(
        makeInput({
          jailVisits: 20,
          jailMinutesServed: 600,
          debt: 500_000,
          negativeBalanceDays: 200,
        }),
      );
      expect(score).toBe(400);
    });

    it("clamps to 800 when raw arithmetic exceeds the ceiling", () => {
      // Synthetic fixture: negative debt means floor(debt/5_000) is negative,
      // so `s -= negative` becomes a net addition. Combined with streak cap +60,
      // income presence +10, and low-DTI +15 this pushes raw s well above 800.
      // The clamp must fire and return exactly 800.
      const score = computeScore(
        makeInput({ debt: -500_000, lastNegativeAt: hoursAgo(200) }),
        10_000,
      );
      expect(score).toBe(800);
    });
  });

  describe("combined penalties", () => {
    it("correctly combines multiple independent penalties", () => {
      const jailVisits = 1;
      const jailMinutesServed = 30;
      const debt = 10_000;
      const negativeBalanceDays = 5;
      const expected = Math.max(
        400,
        680 -
          jailVisits * 25 -
          Math.floor(jailMinutesServed / 10) -
          Math.floor(debt / 5_000) -
          negativeBalanceDays,
      );
      const score = computeScore(makeInput({ jailVisits, jailMinutesServed, debt, negativeBalanceDays }));
      expect(score).toBe(expected);
    });
  });
});

describe("applicationAprBps", () => {
  it("never prices any manually reviewed product below 15% APR", () => {
    expect(applicationAprBps(800, 365 * 100, 100)).toBe(1500);
    expect(applicationAprBps(680, 0, 0)).toBeGreaterThanOrEqual(1500);
    expect(applicationAprBps(400, 0, 0)).toBeGreaterThanOrEqual(1500);
  });

  it("rewards stronger credit, longer organization history, and consistent usage", () => {
    expect(applicationAprBps(760, 365 * 5, 90)).toBeLessThan(applicationAprBps(580, 90, 10));
  });
});
