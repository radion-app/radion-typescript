/**
 * The complete set of WebSocket channels exposed by the Radion realtime API.
 */
export const CHANNELS = [
  "trading",
  "fees",
  "oracle",
  "resolution",
  "lifecycle",
  "positions",
  "combos",
  "transfers",
  "accounts",
  "wallets",
  "markets",
] as const;

/**
 * A confirmed channel name that the SDK is able to subscribe to.
 */
export type Channel = (typeof CHANNELS)[number];

/**
 * A `mempool.`-prefixed companion channel emitting speculative pending
 * transactions before block inclusion.
 */
export type MempoolChannel = `mempool.${Channel}`;

/**
 * Any channel name accepted by {@link RealtimeClient.subscribe} — a confirmed
 * channel or its `mempool.` companion.
 */
export type SubscribableChannel = Channel | MempoolChannel;

/**
 * Runtime guard that narrows an arbitrary string to a known {@link Channel}.
 */
export const isChannel = (value: string): value is Channel =>
  (CHANNELS as readonly string[]).includes(value);

/**
 * Runtime guard for a `mempool.`-prefixed channel.
 */
export const isMempoolChannel = (value: string): value is MempoolChannel =>
  value.startsWith("mempool.") && isChannel(value.slice("mempool.".length));

/**
 * Runtime guard for any subscribable channel (confirmed or mempool).
 */
export const isSubscribableChannel = (
  value: string
): value is SubscribableChannel => isChannel(value) || isMempoolChannel(value);

/** A server-side filter key. */
export type FilterKey = "wallets" | "market_ids" | "token_ids" | "min_usd";

/**
 * Per-channel filter requirements. `optional` filters may be present;
 * `requiredAnyOf` means at least one of the listed filters must be present.
 * Channels absent from this map accept no filters. Mempool companions share
 * their confirmed channel's requirements.
 *
 * The market axis (`market_ids` UNION `token_ids`) is a single axis: a market's
 * conditionId and its outcome token_ids both identify it. A filter a channel
 * does not accept is ignored (has no effect), not an error.
 */
export const FILTER_REQUIREMENTS: Partial<
  Record<
    Channel,
    { optional?: readonly FilterKey[]; requiredAnyOf?: readonly FilterKey[] }
  >
> = {
  accounts: { optional: ["wallets"] },
  combos: { optional: ["wallets", "market_ids", "token_ids"] },
  fees: { optional: ["wallets", "token_ids"] },
  lifecycle: { optional: ["market_ids", "token_ids"] },
  markets: { requiredAnyOf: ["market_ids", "token_ids"] },
  oracle: { optional: ["market_ids"] },
  positions: { optional: ["wallets", "market_ids", "token_ids"] },
  resolution: { optional: ["market_ids"] },
  trading: { optional: ["wallets", "market_ids", "token_ids", "min_usd"] },
  transfers: { optional: ["wallets", "token_ids"] },
  wallets: { requiredAnyOf: ["wallets"] },
};
