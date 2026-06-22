import type { Channel } from "./channels.js";

/**
 * Frames sent from the client to the Radion server.
 */
export type OutboundFrame =
  | { type: "subscribe"; channel: Channel }
  | { type: "unsubscribe"; channel: Channel }
  | { type: "ping"; ts: number };

/**
 * A data event delivered on a subscribed channel.
 *
 * `event` is an optional server-defined sub-type (for example `"open"` or
 * `"settle"` on the `lifecycle` channel). `data` is left as `unknown` so the
 * MVP stays payload-agnostic; consumers narrow it as needed.
 */
export interface ChannelEvent {
  type: "event";
  channel: Channel;
  event?: string;
  data: unknown;
}

/**
 * Server acknowledgement of a subscribe / unsubscribe request.
 */
export interface SubscriptionAck {
  type: "subscribed" | "unsubscribed";
  channel: Channel;
}

/**
 * Heartbeat reply to a client `ping`.
 */
export interface PongFrame {
  type: "pong";
  ts?: number;
}

/**
 * Server-reported error frame.
 */
export interface ErrorFrame {
  type: "error";
  code?: string;
  message: string;
  channel?: Channel;
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
