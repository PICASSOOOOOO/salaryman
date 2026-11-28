// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ADMIN_SUBS,
  MODULES,
  PROFILE_MODULES,
  SETTINGS_MODULES,
} from "./modules";
import { isGameOnlyBrowserPath } from "./game-release";
import { WORKSPACE_STARTER_PATHS, WORKSPACE_WIDGET_GROUPS } from "./workspace-widget-catalog";

const features = WORKSPACE_WIDGET_GROUPS.flatMap((group) =>
  group.features.map((feature) => ({ ...feature, groupId: group.id })),
);

function canonicalPath(path: string): string {
  return path === "/creative" ? "/creative/design" : path.split("?")[0];
}

function routeMatches(route: string, pathname: string): boolean {
  const routeParts = route.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  let index = 0;
  for (; index < routeParts.length; index += 1) {
    const routePart = routeParts[index];
    if (routePart === "*" || /^:[^/]+\*$/.test(routePart)) return true;
    const pathPart = pathParts[index];
    if (routePart.startsWith(":")) {
      if (!pathPart) return false;
      continue;
    }
    if (routePart !== pathPart) return false;
  }
  return index === pathParts.length;
}

describe("workspace widget feature coverage", () => {
  it("lists every supported module and settings subfeature exactly once", () => {
    const listed = new Set(features.map((feature) => feature.path));
    const requiredPaths = [
      ...MODULES.flatMap((module) => [module.path, module.defaultPath, ...module.subs.map((sub) => sub.path)]),
      ...PROFILE_MODULES.map((item) => item.path),
      ...SETTINGS_MODULES.map((item) => item.path),
      ...ADMIN_SUBS.map((item) => item.path),
    ].filter((path) => !isGameOnlyBrowserPath(path));

    for (const path of requiredPaths) {
      const catalogPath = path === "/creative" ? "/creative/design" : path;
      expect(listed, path).toContain(catalogPath);
    }

    const featurePaths = features.map((feature) => feature.path);
    expect(new Set(featurePaths).size).toBe(featurePaths.length);
    expect(features.every((feature) => !feature.label.includes("/"))).toBe(true);
  });

  it("keeps requested tools in the correct groups and settings last", () => {
    const groupForPath = (path: string) => features.find((feature) => feature.path === path)?.groupId;

    expect(groupForPath("/workspace/calculator")).toBe("business");
    expect(groupForPath("/workspace/notepad")).toBe("hemingway");
    expect(groupForPath("/business/documents")).toBe("hemingway");
    expect(groupForPath("/creative/classroom")).toBe("comms");
    expect(groupForPath("/creative/media")).toBe("settings");
    expect(groupForPath("/desktop")).toBeUndefined();
    expect(WORKSPACE_WIDGET_GROUPS.at(-1)).toMatchObject({ id: "settings", label: "THE OFFICE" });
    expect(WORKSPACE_STARTER_PATHS).toEqual(["/pablo", "/phone", "/business", "/business/autopilot"]);
  });

  it("keeps game-only menus out of the browser workspace", () => {
    expect(features.every((feature) => !isGameOnlyBrowserPath(feature.path))).toBe(true);
    for (const path of ["/armory", "/desktop", "/game/settings", "/marketplace", "/tower", "/vending"]) {
      expect(features.some((feature) => feature.path === path), path).toBe(false);
    }
  });

  it("offers only paths registered in the app router", () => {
    const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    const routePaths = [...appSource.matchAll(/<Route path="([^"]+)"/g)].map((match) => match[1]);

    for (const feature of features) {
      const pathname = canonicalPath(feature.path);
      expect(routePaths.some((route) => routeMatches(route, pathname)), feature.path).toBe(true);
    }
  });
});
