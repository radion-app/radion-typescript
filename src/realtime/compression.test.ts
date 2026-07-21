import { deflateRawSync, deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { RadionError } from "../errors.js";
import { buildCompressQueryUrl, inflateFrame } from "./compression.js";

describe("buildCompressQueryUrl", () => {
  it("appends compress=zlib when no existing query", () => {
    expect(buildCompressQueryUrl("wss://api.radion.app/ws")).toBe(
      "wss://api.radion.app/ws?compress=zlib"
    );
  });

  it("preserves an existing query", () => {
    expect(buildCompressQueryUrl("wss://api.radion.app/ws?api-key=k1")).toBe(
      "wss://api.radion.app/ws?api-key=k1&compress=zlib"
    );
  });
});

describe("inflateFrame", () => {
  it("inflates a zlib frame into text", async () => {
    const json = '{"type":"pong"}';
    expect(await inflateFrame(deflateSync(Buffer.from(json, "utf-8")))).toBe(
      json
    );
  });

  it("round-trips a full event frame", async () => {
    const json = JSON.stringify({
      channel: "trading",
      data: { kind: "trade" },
      id: "sub-1",
      sent_at_ms: 1,
      seq: 0,
      type: "event",
    });
    expect(await inflateFrame(deflateSync(Buffer.from(json, "utf-8")))).toBe(
      json
    );
  });

  it("throws a RadionError on bytes that are not zlib", async () => {
    await expect(
      inflateFrame(new Uint8Array([1, 2, 3, 4]))
    ).rejects.toBeInstanceOf(RadionError);
  });

  it("throws a RadionError on raw deflate without a zlib header", async () => {
    await expect(
      inflateFrame(deflateRawSync(Buffer.from("hello", "utf-8")))
    ).rejects.toBeInstanceOf(RadionError);
  });
});
