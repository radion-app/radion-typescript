import { describe, expect, it, vi } from "vitest";

import { RealtimeClient } from "./client.js";

describe("RealtimeClient auth wiring", () => {
  it("defaults authInQuery to false under node", () => {
    const client = new RealtimeClient({ apiKey: "k" });
    // @ts-expect-error private field access for the test
    expect(client.authInQuery).toBe(false);
  });

  it("normalizes a token string into a provider", async () => {
    const client = new RealtimeClient({ apiKey: "k", token: "jwt" });
    // @ts-expect-error private field access for the test
    const provider = client.tokenProvider;
    expect(provider).not.toBeNull();
    expect(await provider?.()).toBe("jwt");
  });

  it("invokes an async token provider", async () => {
    const getToken = vi.fn(async () => await Promise.resolve("fresh"));
    const client = new RealtimeClient({ apiKey: "k", token: getToken });
    // @ts-expect-error private field access for the test
    const provider = client.tokenProvider;
    expect(await provider?.()).toBe("fresh");
    expect(getToken).toHaveBeenCalledTimes(1);
  });
});
