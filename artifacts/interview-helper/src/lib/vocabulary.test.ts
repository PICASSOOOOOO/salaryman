import { describe, expect, it } from "vitest";
import {
  BOOMER_MODE_ENABLED,
  boomerLabel,
  getBoomerAppLabel,
  getBoomerModuleLabel,
} from "./vocabulary";

describe("browser vocabulary policy", () => {
  it("keeps plain-language mode enabled for every surface", () => {
    expect(BOOMER_MODE_ENABLED).toBe(true);
    expect(boomerLabel("Organization", "ORG")).toBe("Organization");
    expect(boomerLabel("Messages", "COMMS")).toBe("Messages");
  });

  it("normalizes shared app navigation labels", () => {
    expect(getBoomerAppLabel("org", "ORG")).toBe("ORGANIZATION");
    expect(getBoomerAppLabel("creative", "CREATIVE")).toBe("CREATIVE");
    expect(getBoomerAppLabel("unknown", "Fallback")).toBe("Fallback");
  });

  it("normalizes legacy workspace module headings", () => {
    expect(getBoomerModuleLabel("console", "CIPHER-X")).toBe("TOOLS");
    expect(getBoomerModuleLabel("intel", "COMMAND NET")).toBe("REPORTS");
    expect(getBoomerModuleLabel("other", "Workspace")).toBe("Workspace");
  });
});