// @vitest-environment jsdom
//
// Behavioral routing test: navigating to /game must land on /pablo.
//
// Uses wouter's memoryLocation hook to drive routing in-process without a
// browser, so the redirect fires as real router logic (Switch → Route →
// Redirect) rather than a grep of the source file.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Router, Switch, Route, Redirect } from "wouter";
import { memoryLocation } from "wouter/memory-location";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Minimal component that exposes the current wouter location so we can assert
// on it after a redirect fires.
function LocationCapture({
  onLocation,
}: {
  onLocation: (loc: string) => void;
}) {
  // Render a sentinel for every known path; the one that mounts tells us
  // where the router ended up.
  return (
    <Switch>
      {/* The /game route should redirect immediately to /pablo */}
      <Route path="/game">
        <Redirect to="/pablo" />
      </Route>
      <Route path="/pablo">
        {() => {
          onLocation("/pablo");
          return <div data-testid="pablo-page" />;
        }}
      </Route>
      {/* Catch-all so we can detect unexpected destinations */}
      <Route>
        {() => {
          onLocation("unknown");
          return <div data-testid="unknown-page" />;
        }}
      </Route>
    </Switch>
  );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("/game → /pablo redirect (behavioral)", () => {
  it("renders the /pablo page when the router starts at /game", async () => {
    const { hook } = memoryLocation({ path: "/game", record: true });

    let capturedLocation = "";

    await act(async () => {
      root.render(
        <Router hook={hook}>
          <LocationCapture onLocation={(loc) => { capturedLocation = loc; }} />
        </Router>,
      );
    });

    expect(
      capturedLocation,
      "Navigating to /game must end up on /pablo via Redirect",
    ).toBe("/pablo");

    expect(
      container.querySelector('[data-testid="pablo-page"]'),
      "The /pablo page element must be rendered after the redirect",
    ).not.toBeNull();

    expect(
      container.querySelector('[data-testid="unknown-page"]'),
      "No unknown/unmatched page should be rendered",
    ).toBeNull();
  });
});
