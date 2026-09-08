import { describe, it, expect } from "vitest";
import {
  toE164,
  countryForCity,
  regulatoryRequirement,
  isSupportedCountry,
  getCountryInfo,
  SUPPORTED_COUNTRIES,
  DEFAULT_COUNTRY,
} from "../lib/phone";

describe("toE164 — country-aware normalization", () => {
  it("defaults to US (+1) when no country is given (byte-identical to old behavior)", () => {
    expect(toE164("4155550100")).toBe("+14155550100");
    expect(toE164("(415) 555-0100")).toBe("+14155550100");
  });

  it("normalizes a Vietnamese local number, dropping the trunk '0'", () => {
    expect(toE164("0912345678", "VN")).toBe("+84912345678");
    expect(toE164("091 234 5678", "VN")).toBe("+84912345678");
  });

  it("normalizes a Vietnamese number with no trunk prefix", () => {
    expect(toE164("912345678", "VN")).toBe("+84912345678");
  });

  it("preserves an explicit international number regardless of default country", () => {
    expect(toE164("+84912345678", "US")).toBe("+84912345678");
    expect(toE164("+14155550100", "VN")).toBe("+14155550100");
  });

  it("returns null for empty or implausibly short/long input", () => {
    expect(toE164("")).toBeNull();
    expect(toE164("123")).toBeNull();
    expect(toE164("+1234567890123456")).toBeNull();
  });

  it("falls back to the US default for an unknown country code", () => {
    expect(toE164("4155550100", "ZZ")).toBe("+14155550100");
  });
});

describe("countryForCity", () => {
  it("maps Huda City to Vietnam", () => {
    expect(countryForCity("huda_city")).toBe("VN");
    expect(countryForCity("HUDA_CITY")).toBe("VN");
  });

  it("maps Minx City, configured regional cities, and empty cities", () => {
    expect(countryForCity("minx_city")).toBe("US");
    expect(countryForCity("solaris_drift")).toBe("MX");
    expect(countryForCity(null)).toBe(DEFAULT_COUNTRY);
    expect(countryForCity(undefined)).toBe(DEFAULT_COUNTRY);
  });
});

describe("regulatoryRequirement", () => {
  it("requires a bundle for Vietnam with an actionable message", () => {
    const vn = regulatoryRequirement("VN");
    expect(vn.required).toBe(true);
    expect(vn.message.length).toBeGreaterThan(0);
    expect(vn.docsUrl).toBeTruthy();
  });

  it("requires nothing for the US", () => {
    const us = regulatoryRequirement("US");
    expect(us.required).toBe(false);
  });
});

describe("country registry helpers", () => {
  it("knows the supported countries", () => {
    expect(isSupportedCountry("US")).toBe(true);
    expect(isSupportedCountry("VN")).toBe(true);
    expect(isSupportedCountry("ZZ")).toBe(false);
    expect(isSupportedCountry(null)).toBe(false);
  });

  it("returns the US default for unknown country info", () => {
    expect(getCountryInfo("ZZ").iso).toBe("US");
    expect(getCountryInfo("VN").dialCode).toBe("84");
    expect(getCountryInfo("VN").region).toBe("ASIA");
  });

  it("each supported country carries a dial code and region", () => {
    for (const c of Object.values(SUPPORTED_COUNTRIES)) {
      expect(c.dialCode).toMatch(/^\d+$/);
      expect(c.region.length).toBeGreaterThan(0);
    }
  });
});
