import { describe, expect, it } from "vitest";

import {
  clobBestBidAskPayloadSchema,
  clobBookLevelSchema,
  clobLastTradePayloadSchema,
  clobMidpointPayloadSchema,
  clobPriceChangeSchema,
} from "./payloads.js";

describe("clob payloads carry money as decimal strings", () => {
  it("parses a book level with string price and size", () => {
    const level = clobBookLevelSchema.parse({ price: "0.4", size: "100" });
    expect(level.price).toBe("0.4");
    expect(level.size).toBe("100");
  });

  it("rejects a numeric price on a book level", () => {
    expect(() =>
      clobBookLevelSchema.parse({ price: 0.4, size: 100 })
    ).toThrow();
  });

  it("parses midpoint money as a string", () => {
    const mid = clobMidpointPayloadSchema.parse({
      asset_id: "1",
      market: "0x0",
      midpoint: "0.5",
      timestamp: 1,
    });
    expect(mid.midpoint).toBe("0.5");
  });

  it("parses price-change bid/ask/price/size as strings", () => {
    const change = clobPriceChangeSchema.parse({
      asset_id: "1",
      best_ask: "0.56",
      best_bid: "0.54",
      price: "0.55",
      size: "10",
    });
    expect(change.best_bid).toBe("0.54");
    expect(change.price).toBe("0.55");
  });

  it("parses last-trade and best-bid-ask money as strings", () => {
    const trade = clobLastTradePayloadSchema.parse({
      asset_id: "1",
      market: "0x0",
      price: "0.55",
      size: "10",
      timestamp: 1,
    });
    expect(trade.price).toBe("0.55");

    const top = clobBestBidAskPayloadSchema.parse({
      asset_id: "1",
      best_ask: "0.56",
      best_bid: "0.54",
      market: "0x0",
      timestamp: 1,
    });
    expect(top.best_bid).toBe("0.54");
  });
});
