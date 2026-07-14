import { describe, expect, it } from "vitest";

import { parseWebhookEvent } from "./events.js";

/** A webhook POST body: the same event frame the WebSocket sends. */
const deliveryBody = () => ({
  channel: "trading",
  confirmed: true,
  data: { maker: "0xmaker", type: "order_filled_v2" },
  id: "0",
  sent_at_ms: 1_721_818_200_123,
  seq: 7,
  type: "event",
});

describe("parseWebhookEvent", () => {
  it("parses a delivery body into a typed event", () => {
    const event = parseWebhookEvent(JSON.stringify(deliveryBody()));
    expect(event).not.toBeNull();
    expect(event?.channel).toBe("trading");
    expect(event?.id).toBe("0");
    expect(event?.seq).toBe(7);
    expect(event?.sent_at_ms).toBe(1_721_818_200_123);
    expect(event?.data).toMatchObject({ type: "order_filled_v2" });
  });

  it("returns null for invalid JSON", () => {
    expect(parseWebhookEvent("{not json")).toBeNull();
  });

  it("returns null for a non-event frame", () => {
    expect(parseWebhookEvent(JSON.stringify({ type: "pong" }))).toBeNull();
  });

  it("returns null when the envelope misses seq and sent_at_ms", () => {
    const { channel, confirmed, data, id, type } = deliveryBody();
    const incomplete = { channel, confirmed, data, id, type };
    expect(parseWebhookEvent(JSON.stringify(incomplete))).toBeNull();
  });
});
