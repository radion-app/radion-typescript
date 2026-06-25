import { z } from "zod";

import type { FilterKey, SubscribableChannel } from "./channels.js";
import {
  FILTER_REQUIREMENTS,
  isChannel,
  isMempoolChannel,
} from "./channels.js";
import type { AnyChannelPayload, ChannelPayloadMap } from "./payloads.js";

/**
 * Server-side filters narrowing the events delivered on a channel.
 *
 * Each field maps to a filter the Radion realtime API applies before sending.
 * Some channels require a filter (for example `wallets` needs `wallets`,
 * `large_trades` accepts `min_usd`); see the channel docs.
 */
export interface ChannelFilters {
  /** Wallet addresses to match (required by `wallets`, optional on `trades`). */
  wallets?: string[];
  /** Condition / market ids to match (required by `markets`). */
  market_ids?: string[];
  /** ERC-1155 token ids to match (required by `markets`, optional on `prices`). */
  token_ids?: string[];
  /** Minimum trade notional in USD (optional on `large_trades`). */
  min_usd?: number;
}

/**
 * A single channel subscription.
 *
 * `id` is a client-defined string echoed back on acknowledgements and on every
 * event frame, so multiple subscriptions to the same channel can be told apart.
 * `channel` is a confirmed channel or its `mempool.` companion.
 */
export interface Subscription {
  /** Client-defined id, echoed back on confirmations and event frames. */
  id: string;
  /** Channel name, confirmed or `mempool.`-prefixed. */
  channel: SubscribableChannel;
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
      filters?: ChannelFilters;
    }
  | { action: "unsubscribe"; id: string }
  | { action: "ping" };

/**
 * A data event delivered on a subscribed channel.
 *
 * `id` identifies the subscription it belongs to; `channel` is the resolved
 * channel name. `data` is the typed payload for the channel — use
 * `ChannelEventFor<C>` to narrow it to a specific channel.
 */
export interface ChannelEvent<TData = AnyChannelPayload> {
  type: "event";
  id: string;
  channel: string;
  data: TData;
}

/** A {@link ChannelEvent} narrowed to the payload of channel `C`. */
export type ChannelEventFor<C extends keyof ChannelPayloadMap> = ChannelEvent<
  ChannelPayloadMap[C]
>;

/**
 * Server acknowledgement of a subscribe / unsubscribe request.
 */
export interface SubscriptionAck {
  type: "subscribed" | "unsubscribed";
  id: string;
  channel?: string;
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
 * Any frame the client may receive from the server.
 */
export type InboundFrame =
  | ChannelEvent
  | SubscriptionAck
  | PongFrame
  | ErrorFrame;

const eventFrameSchema = z.object({
  channel: z.string(),
  data: z.unknown(),
  id: z.string(),
  type: z.literal("event"),
});

const ackFrameSchema = z.object({
  channel: z.string().optional(),
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

/** Validates the structure of any inbound frame envelope. */
export const inboundFrameSchema = z.union([
  eventFrameSchema,
  ackFrameSchema,
  pongFrameSchema,
  errorFrameSchema,
]);

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

  // Envelope validated above; `data` typing is the channel's contract.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return result.data as InboundFrame;
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
 * filters satisfy the channel's requirements. Mempool companions share their
 * confirmed channel's requirements.
 */
export const validateSubscriptionFilters = (
  subscription: Subscription
): string | null => {
  const { channel, filters } = subscription;
  const confirmed = isMempoolChannel(channel)
    ? channel.slice("mempool.".length)
    : channel;
  if (!isChannel(confirmed)) {
    return `unknown channel "${channel}"`;
  }
  const requirement = FILTER_REQUIREMENTS[confirmed];
  if (!requirement?.requiredAnyOf) {
    return null;
  }
  const present = (key: FilterKey): boolean => {
    const value = filters?.[key];
    return Array.isArray(value) ? value.length > 0 : value !== undefined;
  };
  if (!requirement.requiredAnyOf.some(present)) {
    const list = requirement.requiredAnyOf.join(" or ");
    return `channel "${channel}" requires a ${list} filter`;
  }
  return null;
};
