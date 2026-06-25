/**
 * The complete set of WebSocket channels exposed by the Radion realtime API.
 */
export const CHANNELS = [
  "global",
  "trades",
  "activity",
  "lifecycle",
  "oracle",
  "collateral",
  "combos",
  "prices",
  "wallets",
  "markets",
  "large_trades",
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
 */
export const FILTER_REQUIREMENTS: Partial<
  Record<
    Channel,
    { optional?: readonly FilterKey[]; requiredAnyOf?: readonly FilterKey[] }
  >
> = {
  large_trades: { optional: ["min_usd"] },
  markets: { requiredAnyOf: ["market_ids", "token_ids"] },
  prices: { optional: ["token_ids"] },
  trades: { optional: ["wallets"] },
  wallets: { requiredAnyOf: ["wallets"] },
};
