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
 * The CLOB WebSocket channel family, proxied by the Radion server. A SEPARATE
 * family from the topic {@link CHANNELS}: each is `clob.`-prefixed, requires a
 * `token_ids` filter, and has NO `mempool.` companion. Kept out of `CHANNELS`
 * so the `mempool.${Channel}` derivation never produces `mempool.clob.*`.
 */
export const CLOB_CHANNELS = [
  "clob.book",
  "clob.prices",
  "clob.last_trade",
  "clob.midpoint",
  "clob.tick_size",
  "clob.best_bid_ask",
] as const;

/**
 * A CLOB channel name the SDK is able to subscribe to.
 */
export type ClobChannel = (typeof CLOB_CHANNELS)[number];

/**
 * Any channel name accepted by {@link RealtimeClient.subscribe} — a confirmed
 * channel, its `mempool.` companion, or a CLOB channel.
 */
export type SubscribableChannel = Channel | MempoolChannel | ClobChannel;

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
 * Runtime guard that narrows an arbitrary string to a known {@link ClobChannel}.
 */
export const isClobChannel = (value: string): value is ClobChannel =>
  (CLOB_CHANNELS as readonly string[]).includes(value);

/**
 * Runtime guard for any subscribable channel (confirmed, mempool, or CLOB).
 */
export const isSubscribableChannel = (
  value: string
): value is SubscribableChannel =>
  isChannel(value) || isMempoolChannel(value) || isClobChannel(value);

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

/**
 * Per-channel filter requirements for the CLOB family. Each CLOB channel only
 * accepts — and REQUIRES — a `token_ids` filter (no `wallets` / `market_ids` /
 * `min_usd`). Kept separate from {@link FILTER_REQUIREMENTS} because CLOB
 * channels are not topic {@link Channel}s.
 */
export const CLOB_FILTER_REQUIREMENTS: Record<
  ClobChannel,
  { optional?: readonly FilterKey[]; requiredAnyOf?: readonly FilterKey[] }
> = {
  "clob.best_bid_ask": { requiredAnyOf: ["token_ids"] },
  "clob.book": { requiredAnyOf: ["token_ids"] },
  "clob.last_trade": { requiredAnyOf: ["token_ids"] },
  "clob.midpoint": { requiredAnyOf: ["token_ids"] },
  "clob.prices": { requiredAnyOf: ["token_ids"] },
  "clob.tick_size": { requiredAnyOf: ["token_ids"] },
};
