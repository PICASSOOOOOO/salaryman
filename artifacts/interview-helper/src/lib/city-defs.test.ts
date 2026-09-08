import { describe, expect, it } from "vitest";
import { getSavedCityId } from "./city-defs";

describe("getSavedCityId", () => {
  it("uses the current city before the home-city compatibility field", () => {
    expect(getSavedCityId({ cityId: "huda_city", homeCityId: "minx_city" })).toBe("huda_city");
  });

  it("hydrates legacy onboarding saves from homeCityId", () => {
    expect(getSavedCityId({ homeCityId: "huda_city" })).toBe("huda_city");
  });

  it("rejects unknown and malformed persisted values", () => {
    expect(getSavedCityId({ cityId: "elsewhere", homeCityId: "also_elsewhere" })).toBeNull();
    expect(getSavedCityId(null)).toBeNull();
  });
});