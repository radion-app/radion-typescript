import { z } from "zod";

import type { FilterKey, SubscribableChannel } from "./channels.js";
import {
  CLOB_FILTER_REQUIREMENTS,
  FILTER_REQUIREMENTS,
  isChannel,
  isClobChannel,
} from "./channels.js";
import { channelDataSchema } from "./payloads.js";
import type { AnyChannelPayload, ChannelPayloadMap } from "./payloads.js";

/**
 * Server-side filters narrowing the events delivered on a channel.
 *
 * Each field maps to a filter the Radion realtime API applies before sending.
 * Some channels require a filter (`wallets` needs `wallets`; `markets` needs
 * `market_ids` or `token_ids`), while `trading` accepts all four optionally;
 * see the channel docs.
 */
export interface ChannelFilters {
  /** Wallet addresses to match (required by `wallets`, optional on `trading`). */
  wallets?: string[];
  /** Condition / market ids to match (required by `markets`). */
  market_ids?: string[];
  /** ERC-1155 token ids to match (required by `markets`, optional on `trading`). */
  token_ids?: string[];
  /**
   * Minimum trade notional in USD (optional on `trading`). On the confirmed
   * feed this measures the actual filled USD; on the pending feed
   * (`confirmed: false`) it measures the pending order's intended fill notional
   * (`call.notional_usd`).
   */
  min_usd?: number;
}

/**
 * A single channel subscription.
 *
 * `id` is a client-defined string echoed back on acknowledgements and on every
 * event frame, so multiple subscriptions to the same channel can be told apart.
 * `channel` is the bare channel name; set `confirmed: false` to receive the
 * pending (mempool) feed for a topic channel instead of the confirmed feed.
 */
export interface Subscription {
  /** Client-defined id, echoed back on confirmations and event frames. */
  id: string;
  /** Bare channel name (topic or CLOB). */
  channel: SubscribableChannel;
  /**
   * `true` (default) subscribes to the confirmed feed; `false` subscribes to
   * the pending (mempool) feed. Ignored for CLOB channels.
   */
  confirmed?: boolean;
  /** Optional server-side filters. */
  filters?: ChannelFilters;
}

/**
 * Frames sent from the client to the Radion server.
 */
export type OutboundFrame =
  | {
      action: "subscribe";
      id: string;
      channel: SubscribableChannel;
      confirmed?: boolean;
      filters?: ChannelFilters;
    }
  | { action: "unsubscribe"; id: string }
  | { action: "ping" };

/**
 * A data event delivered on a subscribed channel.
 *
 * `id` identifies the subscription it belongs to; `channel` is the bare channel
 * name for both the confirmed and pending feed. `confirmed` distinguishes the
 * feed: `false` means a pending (mempool) event whose `data` is a
 * `MempoolPayload`. `data` is the typed payload for the channel — use
 * `ChannelEventFor<C>` to narrow it to a specific confirmed channel.
 *
 * `seq` counts event frames on the connection (starting at 0, across all
 * subscriptions) — a jump means frames were dropped. `sent_at_ms` is the
 * server-send time in Unix ms: server→client latency is your receive time
 * minus `sent_at_ms`. Pending events additionally carry `data.seen_at_ms`,
 * the block-detection time, for block→client latency.
 */
export interface ChannelEvent<TData = AnyChannelPayload> {
  type: "event";
  id: string;
  channel: string;
  confirmed?: boolean | undefined;
  seq: number;
  sent_at_ms: number;
  data: TData;
}

/** A {@link ChannelEvent} narrowed to the payload of channel `C`. */
export type ChannelEventFor<C extends keyof ChannelPayloadMap> = ChannelEvent<
  ChannelPayloadMap[C]
>;

/**
 * Server acknowledgement of a subscribe / unsubscribe request. `confirmed`
 * echoes which feed was subscribed (present on `subscribed` acks).
 */
export interface SubscriptionAck {
  type: "subscribed" | "unsubscribed";
  id: string;
  channel?: string | undefined;
  confirmed?: boolean | undefined;
}

/**
 * Server warning frame — non-fatal. Sent, for example, right after a
 * `confirmed: false` subscribe when the node has no pending stream
 * (`code: "mempool_unavailable"`). Surfaced through the `warning` lifecycle
 * event, not the `error` path.
 */
export interface WarningFrame {
  type: "warning";
  code: string;
  id?: string;
  message: string;
}

/**
 * Heartbeat reply to a client `ping`.
 */
export interface PongFrame {
  type: "pong";
}

/**
 * Server-reported error frame.
 */
export interface ErrorFrame {
  type: "error";
  code?: string;
  message: string;
  id?: string;
  channel?: string;
  /** Number of dropped events, present on a `lagged` error. */
  skipped?: number;
}

/**
 * Validates the structure of a `type: "event"` envelope — the frame delivered
 * on the WebSocket and, identically, as a webhook POST body.
 */
export const eventFrameSchema = z.object({
  channel: z.string(),
  confirmed: z.boolean().optional(),
  data: channelDataSchema,
  id: z.string(),
  sent_at_ms: z.number(),
  seq: z.number(),
  type: z.literal("event"),
});

const ackFrameSchema = z.object({
  channel: z.string().optional(),
  confirmed: z.boolean().optional(),
  id: z.string(),
  type: z.union([z.literal("subscribed"), z.literal("unsubscribed")]),
});

const pongFrameSchema = z.object({ type: z.literal("pong") });

const errorFrameSchema = z.object({
  channel: z.string().optional(),
  code: z.string().optional(),
  id: z.string().optional(),
  message: z.string(),
  skipped: z.number().optional(),
  type: z.literal("error"),
});

const warningFrameSchema = z.object({
  code: z.string(),
  id: z.string().optional(),
  message: z.string(),
  type: z.literal("warning"),
});

/** Validates the structure of any inbound frame envelope. */
export const inboundFrameSchema = z.union([
  eventFrameSchema,
  ackFrameSchema,
  pongFrameSchema,
  errorFrameSchema,
  warningFrameSchema,
]);

/**
 * Any frame the client may receive from the server. Inferred from
 * {@link inboundFrameSchema} so a validated frame is returned fully typed.
 */
export type InboundFrame = z.infer<typeof inboundFrameSchema>;

/**
 * Parse and validate a raw text frame into a typed {@link InboundFrame}.
 *
 * Returns `null` when the payload is not valid JSON or does not match a known
 * frame envelope, so callers can drop malformed frames without throwing. The
 * envelope is validated; `data` is delivered as the channel's typed payload.
 */
export const parseInboundFrame = (raw: string): InboundFrame | null => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  const result = inboundFrameSchema.safeParse(value);
  if (!result.success) {
    return null;
  }
  return result.data;
};

/**
 * Serialise an {@link OutboundFrame} for transmission.
 */
export const serializeOutboundFrame = (frame: OutboundFrame): string =>
  JSON.stringify(frame);

/**
 * Validate that a subscription carries the filters its channel requires.
 *
 * Returns an error message describing the first violation, or `null` when the
 * filters satisfy the channel's requirements. Requirements are the same for the
 * confirmed and pending feed of a topic channel; CLOB channels each require
 * `token_ids`.
 */
export const validateSubscriptionFilters = (
  subscription: Subscription
): string | null => {
  const { channel, filters } = subscription;
  const present = (key: FilterKey): boolean => {
    const value = filters?.[key];
    return Array.isArray(value) ? value.length > 0 : value !== undefined;
  };
  const checkRequired = (
    requiredAnyOf: readonly FilterKey[] | undefined
  ): string | null => {
    if (!requiredAnyOf || requiredAnyOf.some(present)) {
      return null;
    }
    const list = requiredAnyOf.join(" or ");
    return `channel "${channel}" requires a ${list} filter`;
  };

  if (isClobChannel(channel)) {
    return checkRequired(CLOB_FILTER_REQUIREMENTS[channel].requiredAnyOf);
  }

  if (!isChannel(channel)) {
    return `unknown channel "${channel as string}"`;
  }
  return checkRequired(FILTER_REQUIREMENTS[channel]?.requiredAnyOf);
};
