/**
 * Server-side filters narrowing the events delivered on a channel.
 *
 * Each field maps to a filter the Radion realtime API applies before sending.
 * Some channels require a filter (for example `wallets` needs `wallets`,
 * `large_trades` needs `min_usd`); see the channel docs.
 */
export interface ChannelFilters {
  /** Wallet addresses to match (required by `wallets`, optional on `trades`). */
  wallets?: string[];
  /** Condition / market ids to match (required by `markets`). */
  market_ids?: string[];
  /** ERC-1155 token ids to match (required by `prices`, optional on `markets`). */
  token_ids?: string[];
  /** Minimum trade notional in USD (required by `large_trades`). */
  min_usd?: number;
}

/**
 * A single channel subscription.
 *
 * `id` is a client-defined string echoed back on acknowledgements and on every
 * event frame, so multiple subscriptions to the same channel can be told apart.
 * `channel` may carry a `mempool.` prefix (for example `mempool.trades`).
 */
export interface Subscription {
  /** Client-defined id, echoed back on confirmations and event frames. */
  id: string;
  /** Channel name, optionally `mempool.`-prefixed. */
  channel: string;
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
      channel: string;
      filters?: ChannelFilters;
    }
  | { action: "unsubscribe"; id: string }
  | { action: "ping" };

/**
 * A data event delivered on a subscribed channel.
 *
 * `id` identifies the subscription it belongs to; `channel` is the resolved
 * channel name. `data` is left as `unknown` so the SDK stays payload-agnostic;
 * consumers narrow it as needed.
 */
export interface ChannelEvent<TData = unknown> {
  type: "event";
  id: string;
  channel: string;
  data: TData;
}

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
}

/**
 * Any frame the client may receive from the server.
 */
export type InboundFrame =
  | ChannelEvent
  | SubscriptionAck
  | PongFrame
  | ErrorFrame;

/**
 * Parse a raw text frame into a typed {@link InboundFrame}.
 *
 * Returns `null` when the payload is not valid JSON or does not carry a
 * recognisable `type` discriminator, so callers can drop malformed frames
 * without throwing.
 */
export const parseInboundFrame = (raw: string): InboundFrame | null => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof value !== "object" || value === null || !("type" in value)) {
    return null;
  }

  if (typeof value.type !== "string") {
    return null;
  }

  // Validated above: an object carrying a string `type` discriminator.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as InboundFrame;
};

/**
 * Serialise an {@link OutboundFrame} for transmission.
 */
export const serializeOutboundFrame = (frame: OutboundFrame): string =>
  JSON.stringify(frame);
