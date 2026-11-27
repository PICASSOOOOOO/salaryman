import { describe, expect, it } from "vitest";
import { PHONE_ROUTE_TO_TAB } from "./CalllHomeContext";

describe("CALLL HOME legacy routes", () => {
  it("opens the requested dialer and dialing-session tabs", () => {
    expect(PHONE_ROUTE_TO_TAB["/phone/dialer"]).toBe("dial");
    expect(PHONE_ROUTE_TO_TAB["/phone/sessions"]).toBe("auto");
  });

  it("keeps Voice Coach in CALLL HOME and call handling in PABLO PRIME", () => {
    expect(PHONE_ROUTE_TO_TAB["/phone/coach"]).toBe("ai");
    expect(PHONE_ROUTE_TO_TAB["/phone/secretary"]).toBeUndefined();
  });
});