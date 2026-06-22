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
 * A channel name that the SDK is able to subscribe to.
 */
export type Channel = (typeof CHANNELS)[number];

/**
 * Runtime guard that narrows an arbitrary string to a known {@link Channel}.
 */
export const isChannel = (value: string): value is Channel =>
  (CHANNELS as readonly string[]).includes(value);
