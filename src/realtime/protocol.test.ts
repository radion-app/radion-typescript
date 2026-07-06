import { describe, expect, it } from "vitest";

import { mempoolPayloadSchema } from "./payloads.js";
import {
  parseInboundFrame,
  serializeOutboundFrame,
  validateSubscriptionFilters,
} from "./protocol.js";

/** Wrap a decoded `call` (or `null`) in a full pending-transaction envelope. */
const pendingTransaction = (call: unknown) => ({
  call,
  contract_kinds: ["exchange"],
  from: "0xfrom",
  input: "0xdeadbeef",
  method_selector: "0xdeadbeef",
  seen_at_ms: 1_720_000_000_000,
  to: "0xto",
  transaction_hash: "0xhash",
  value: "0",
});

describe("v0.6.0 subscribe wire contract", () => {
  it("serializes a pending subscribe with confirmed: false", () => {
    const raw = serializeOutboundFrame({
      action: "subscribe",
      channel: "trading",
      confirmed: false,
      id: "trading-pending",
    });
    expect(JSON.parse(raw)).toEqual({
      action: "subscribe",
      channel: "trading",
      confirmed: false,
      id: "trading-pending",
    });
  });

  it("uses bare channel requirements with no mempool. prefix", () => {
    expect(
      validateSubscriptionFilters({ channel: "wallets", id: "w" })
    ).toMatch(/requires a wallets filter/u);
    expect(
      validateSubscriptionFilters({
        channel: "trading",
        confirmed: false,
        id: "t",
      })
    ).toBeNull();
  });

  it("rejects a former mempool.-prefixed channel as unknown", () => {
    expect(
      // @ts-expect-error the mempool. prefix is no longer a valid channel
      validateSubscriptionFilters({ channel: "mempool.trading", id: "m" })
    ).toMatch(/unknown channel/u);
  });
});

describe("v0.6.0 inbound frames", () => {
  it("parses an event envelope carrying confirmed", () => {
    const frame = parseInboundFrame(
      JSON.stringify({
        channel: "trading",
        confirmed: false,
        data: pendingTransaction({
          market_ids: ["0xabc"],
          method: "fillOrder",
          notional_usd: 1234.5,
          orders: [
            {
              maker: "0x1",
              maker_amount: "1000000",
              side: "buy",
              taker: null,
              taker_amount: "500000",
              token_id: "42",
            },
          ],
          token_ids: ["42"],
          wallets: ["0x1"],
        }),
        id: "trading-pending",
        type: "event",
      })
    );
    expect(frame?.type).toBe("event");
    if (frame?.type === "event") {
      expect(frame.confirmed).toBe(false);
      expect(frame.channel).toBe("trading");
    }
  });

  it("parses a subscribed ack that echoes confirmed", () => {
    const frame = parseInboundFrame(
      JSON.stringify({
        channel: "trading",
        confirmed: false,
        id: "trading-pending",
        type: "subscribed",
      })
    );
    expect(frame?.type).toBe("subscribed");
    if (frame?.type === "subscribed") {
      expect(frame.confirmed).toBe(false);
    }
  });

  it("parses a non-fatal warning frame", () => {
    const frame = parseInboundFrame(
      JSON.stringify({
        code: "mempool_unavailable",
        id: "trading-pending",
        message: "node has no pending stream",
        type: "warning",
      })
    );
    expect(frame?.type).toBe("warning");
    if (frame?.type === "warning") {
      expect(frame.code).toBe("mempool_unavailable");
    }
  });
});

describe("mempool payload", () => {
  it("accepts the full envelope with a trade call and un-collapsed orders", () => {
    const result = mempoolPayloadSchema.safeParse(
      pendingTransaction({
        market_ids: [],
        method: "matchOrders",
        notional_usd: null,
        orders: [
          {
            maker: "0xmaker",
            maker_amount: "10",
            side: "sell",
            taker: "0xtaker",
            taker_amount: "20",
            token_id: "7",
          },
        ],
        token_ids: ["7"],
        wallets: ["0xmaker"],
      })
    );
    expect(result.success).toBe(true);
  });

  it("accepts a non-trade call with an empty orders array", () => {
    const result = mempoolPayloadSchema.safeParse(
      pendingTransaction({
        market_ids: ["0xcond"],
        method: "splitPosition",
        notional_usd: null,
        orders: [],
        token_ids: [],
        wallets: ["0xuser"],
      })
    );
    expect(result.success).toBe(true);
  });

  it("accepts a null call and null method_selector for an undecoded tx", () => {
    const result = mempoolPayloadSchema.safeParse({
      call: null,
      contract_kinds: ["unknown"],
      from: "0xfrom",
      input: "0x",
      method_selector: null,
      seen_at_ms: 1_720_000_000_000,
      to: "0xto",
      transaction_hash: "0xhash",
      value: "1000000000000000000",
    });
    expect(result.success).toBe(true);
  });

  it("tolerates an unknown contract_kinds value", () => {
    const result = mempoolPayloadSchema.safeParse({
      call: null,
      contract_kinds: ["some_future_kind"],
      from: "0xfrom",
      input: "0x",
      method_selector: null,
      seen_at_ms: 1,
      to: "0xto",
      transaction_hash: "0xhash",
      value: "0",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an order with an invalid side", () => {
    const result = mempoolPayloadSchema.safeParse(
      pendingTransaction({
        market_ids: [],
        method: "fillOrder",
        notional_usd: 1,
        orders: [
          {
            maker: "0x1",
            maker_amount: "1",
            side: "long",
            taker: null,
            taker_amount: "1",
            token_id: "1",
          },
        ],
        token_ids: ["1"],
        wallets: [],
      })
    );
    expect(result.success).toBe(false);
  });
});
