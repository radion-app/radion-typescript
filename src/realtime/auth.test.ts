import { describe, expect, it } from "vitest";

import { buildAuthQueryUrl, normalizeToken } from "./auth.js";

describe("buildAuthQueryUrl", () => {
  it("appends api-key when no existing query", () => {
    expect(buildAuthQueryUrl("wss://api.radion.app/ws", { apiKey: "k1" })).toBe(
      "wss://api.radion.app/ws?api-key=k1"
    );
  });

  it("appends token when provided", () => {
    expect(
      buildAuthQueryUrl("wss://api.radion.app/ws", {
        apiKey: "k1",
        token: "jwt-2",
      })
    ).toBe("wss://api.radion.app/ws?api-key=k1&token=jwt-2");
  });

  it("preserves an existing query", () => {
    expect(
      buildAuthQueryUrl("wss://api.radion.app/ws?v=1", { apiKey: "k1" })
    ).toBe("wss://api.radion.app/ws?v=1&api-key=k1");
  });

  it("url-encodes values", () => {
    expect(
      buildAuthQueryUrl("wss://api.radion.app/ws", {
        apiKey: "a b",
        token: "x/y=",
      })
    ).toBe("wss://api.radion.app/ws?api-key=a%20b&token=x%2Fy%3D");
  });
});

describe("normalizeToken", () => {
  it("returns null when undefined", () => {
    expect(normalizeToken()).toBeNull();
  });

  it("wraps a string into a constant async provider", async () => {
    const provider = normalizeToken("static-jwt");
    expect(await provider?.()).toBe("static-jwt");
  });

  it("wraps a sync callable", async () => {
    const provider = normalizeToken(() => "sync-jwt");
    expect(await provider?.()).toBe("sync-jwt");
  });

  it("uses a promise-returning callable directly", async () => {
    const provider = normalizeToken(
      async () => await Promise.resolve("async-jwt")
    );
    expect(await provider?.()).toBe("async-jwt");
  });
});
