import { describe, expect, it } from "vitest";
import { findExactSheetRow } from "../lib/pablo-google-sheets";

describe("Pablo Google Sheets row safety", () => {
  it("returns one exact key match and rejects duplicate keys", () => {
    const rows = [["a@example.com", "A"], ["b@example.com", "B"]];
    expect(findExactSheetRow(rows, 0, "A@EXAMPLE.COM")?.index).toBe(0);
    expect(findExactSheetRow([...rows, ["a@example.com", "duplicate"]], 0, "a@example.com")).toBeNull();
    expect(findExactSheetRow(rows, 0, "missing")).toBeNull();
  });

  it("does not match partial keys", () => {
    expect(findExactSheetRow([["a@example.com"]], 0, "a@example.com.evil")).toBeNull();
  });
});