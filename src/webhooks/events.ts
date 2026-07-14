import type { ChannelEvent } from "../realtime/protocol.js";
import { eventFrameSchema } from "../realtime/protocol.js";

/**
 * The body of a webhook delivery. Webhooks POST the same event frame the
 * WebSocket sends, so this is an alias of {@link ChannelEvent}: `channel`,
 * `confirmed`, `seq`, `sent_at_ms`, and the channel's typed `data` payload.
 * On a webhook, `id` is the index of the matching subscription in the
 * endpoint's `subscriptions` array (as a string), and `seq` counts deliveries
 * per endpoint — it resets when the endpoint is edited or its secret rotated.
 */
export type WebhookEvent = ChannelEvent;

/**
 * Validates the structure of a webhook delivery body. The envelope is checked
 * strictly; `data` validates against the channel payload schemas.
 */
export const webhookEventSchema = eventFrameSchema;

/**
 * Parse and validate a raw webhook request body into a typed
 * {@link WebhookEvent}.
 *
 * Returns `null` when the body is not valid JSON or does not match the event
 * envelope, so callers can reject malformed requests without throwing. Parsing
 * does not authenticate the request — verify the signature first with
 * {@link verifyWebhookSignature}.
 *
 * @example
 * ```ts
 * const event = parseWebhookEvent(rawBody);
 * if (event?.channel === "trading") {
 *   console.log(event.seq, event.data);
 * }
 * ```
 */
export const parseWebhookEvent = (raw: string): WebhookEvent | null => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  const result = webhookEventSchema.safeParse(value);
  if (!result.success) {
    return null;
  }
  return result.data;
};
