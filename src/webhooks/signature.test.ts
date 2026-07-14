import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_WEBHOOK_TOLERANCE_MS,
  verifyWebhookSignature,
} from "./signature.js";

const SECRET = "whsec_0123456789abcdef0123456789abcdef";
const BODY = JSON.stringify({ channel: "trading", type: "event" });

/** Reference implementation of the server-side signing scheme. */
const sign = (secret: string, timestampMs: number, body: string): string =>
  `v1=${createHmac("sha256", secret)
    .update(`${timestampMs}.${body}`)
    .digest("hex")}`;

describe("verifyWebhookSignature", () => {
  it("accepts a fresh, correctly signed delivery", async () => {
    const timestamp = Date.now();
    const result = await verifyWebhookSignature({
      payload: BODY,
      secret: SECRET,
      signature: sign(SECRET, timestamp, BODY),
      timestamp,
    });
    expect(result).toBe(true);
  });

  it("accepts the timestamp as a header string", async () => {
    const timestamp = Date.now();
    const result = await verifyWebhookSignature({
      payload: BODY,
      secret: SECRET,
      signature: sign(SECRET, timestamp, BODY),
      timestamp: String(timestamp),
    });
    expect(result).toBe(true);
  });

  it("accepts the payload as raw bytes", async () => {
    const timestamp = Date.now();
    const result = await verifyWebhookSignature({
      payload: new TextEncoder().encode(BODY),
      secret: SECRET,
      signature: sign(SECRET, timestamp, BODY),
      timestamp,
    });
    expect(result).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const timestamp = Date.now();
    const result = await verifyWebhookSignature({
      payload: `${BODY} `,
      secret: SECRET,
      signature: sign(SECRET, timestamp, BODY),
      timestamp,
    });
    expect(result).toBe(false);
  });

  it("rejects a signature made with another secret", async () => {
    const timestamp = Date.now();
    const result = await verifyWebhookSignature({
      payload: BODY,
      secret: SECRET,
      signature: sign("whsec_other", timestamp, BODY),
      timestamp,
    });
    expect(result).toBe(false);
  });

  it("accepts when any rotation secret matches", async () => {
    const timestamp = Date.now();
    const result = await verifyWebhookSignature({
      payload: BODY,
      secret: ["whsec_old", SECRET],
      signature: sign(SECRET, timestamp, BODY),
      timestamp,
    });
    expect(result).toBe(true);
  });

  it("rejects a replayed delivery older than the tolerance", async () => {
    const timestamp = Date.now() - DEFAULT_WEBHOOK_TOLERANCE_MS - 1000;
    const result = await verifyWebhookSignature({
      payload: BODY,
      secret: SECRET,
      signature: sign(SECRET, timestamp, BODY),
      timestamp,
    });
    expect(result).toBe(false);
  });

  it("honours a custom toleranceMs", async () => {
    const timestamp = Date.now() - 5000;
    const signature = sign(SECRET, timestamp, BODY);
    const base = { payload: BODY, secret: SECRET, signature, timestamp };
    expect(await verifyWebhookSignature({ ...base, toleranceMs: 1000 })).toBe(
      false
    );
    expect(await verifyWebhookSignature({ ...base, toleranceMs: 60_000 })).toBe(
      true
    );
  });

  it("rejects malformed signature values", async () => {
    const timestamp = Date.now();
    const digest = sign(SECRET, timestamp, BODY).slice("v1=".length);
    const base = { payload: BODY, secret: SECRET, timestamp };
    expect(await verifyWebhookSignature({ ...base, signature: digest })).toBe(
      false
    );
    expect(
      await verifyWebhookSignature({ ...base, signature: "v1=nothex" })
    ).toBe(false);
    expect(await verifyWebhookSignature({ ...base, signature: "" })).toBe(
      false
    );
  });

  it("rejects a non-numeric timestamp", async () => {
    const result = await verifyWebhookSignature({
      payload: BODY,
      secret: SECRET,
      signature: sign(SECRET, Date.now(), BODY),
      timestamp: "not-a-timestamp",
    });
    expect(result).toBe(false);
  });
});
