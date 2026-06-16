import { describe, it, expect } from "vitest";
import { isReadyToEnter, isCostCurious, isShowPapers } from "./signup-intent";

describe("isReadyToEnter — readiness / sign-up buying signals", () => {
  const positives = [
    "let me in",
    "I'm ready",
    "ready to sign up",
    "sign me in",
    "sign me up",
    "sign up",
    "signup",
    "how do I sign up?",
    "where do I sign up",
    "how to join",
    "create an account",
    "make my account",
    "set up account",
    "I want to join",
    "I want in",
    "take me inside",
    "can I use the app",
    "can I use the apps?",
    "can I use this platform",
    "can I play the game",
  ];
  for (const t of positives) {
    it(`positive: ${JSON.stringify(t)}`, () => {
      expect(isReadyToEnter(t)).toBe(true);
    });
  }

  const negatives = [
    "I can't sign up",
    "don't want to join",
    "won't sign up",
    "never join this",
    "do not sign me up",
    "what is a salaryman?",
    "how much time does this take",
    "tell me about the world",
    "ok",
    "hi there",
  ];
  for (const t of negatives) {
    it(`negative: ${JSON.stringify(t)}`, () => {
      expect(isReadyToEnter(t)).toBe(false);
    });
  }
});

describe("isCostCurious — cost / 'is it free' buying signals", () => {
  const positives = [
    "is it free?",
    "is this free",
    "it's free?",
    "are you free",
    "are the apps free",
    "free to join",
    "free to use",
    "free to sign up",
    "how much does it cost",
    "how much is it",
    "how much to join",
    "how much is the plan",
    "does it cost anything",
    "do I have to pay",
    "will I have to pay",
    "I have to pay to join?",
    "I don't want to pay",
    "do not want to pay",
    "won't pay",
    "without paying",
    "is there a fee",
    "is there a catch",
  ];
  for (const t of positives) {
    it(`positive: ${JSON.stringify(t)}`, () => {
      expect(isCostCurious(t)).toBe(true);
    });
  }

  const negatives = [
    "how much time does this take",
    "I have to pay rent this week",
    "how much do they pay you",
    "tell me about the city",
    "what is a salaryman?",
    "hello",
  ];
  for (const t of negatives) {
    it(`negative: ${JSON.stringify(t)}`, () => {
      expect(isCostCurious(t)).toBe(false);
    });
  }
});

describe("isShowPapers — immigration 'papers' admittance signal", () => {
  const positives = [
    "here are my papers",
    "here's my paperwork",
    "I have my papers",
    "I've got my documents",
    "check my papers",
    "process my paperwork",
    "stamp my papers",
    "verify my id",
    "show you my papers",
    "let me show you my papers",
    "show me your papers",
    "my papers are ready",
    "papers ready",
    "ready with my papers",
    "papers",
    "my papers",
    "papers!",
    "take my passport",
    "here is my identification",
  ];
  for (const t of positives) {
    it(`positive: ${JSON.stringify(t)}`, () => {
      expect(isShowPapers(t)).toBe(true);
    });
  }

  const negatives = [
    "I don't have papers",
    "no documents",
    "I lost my id",
    "without my paperwork",
    "I haven't got my passport",
    "tell me about the research papers",
    "what is a salaryman?",
    "hello",
    "how much does it cost",
  ];
  for (const t of negatives) {
    it(`negative: ${JSON.stringify(t)}`, () => {
      expect(isShowPapers(t)).toBe(false);
    });
  }
});
