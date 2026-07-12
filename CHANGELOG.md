# Changelog

All notable changes to `@radion-app/sdk` are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project adheres to [Semantic Versioning](https://semver.org/).

## [0.7.0] - 2026-07-12

### Added

- **`seq` and `sent_at_ms` on every event frame.** The server now stamps each `type: "event"` envelope with `sent_at_ms` (server-send time, Unix ms) and a per-connection monotonic `seq` counter. `ChannelEvent` exposes both as required fields: compute server→client latency as `receive time - sent_at_ms`, and detect dropped frames by a jump in `seq` (alongside the existing `lagged` error). Pending events still carry `data.seen_at_ms` for block→client latency.
- **`subscribed` / `unsubscribed` lifecycle events.** Subscription acks are no longer swallowed: `onLifecycle("subscribed", (ack) => …)` fires with the `SubscriptionAck` (`id`, `channel`, `confirmed`) when the server confirms a subscribe, and `"unsubscribed"` mirrors it. Useful for tracking when a subscription is actually live (e.g. multiplexers and proxies).

### Changed

- **Requires a Radion API that emits the new envelope fields.** `parseInboundFrame` validates `seq` and `sent_at_ms` as required, so event frames from older servers are dropped as malformed.

## [0.6.0] - 2026-07-06

### Changed

- **BREAKING: pending (mempool) feed is now selected with a `confirmed` flag, not a channel prefix.** The `mempool.` channel-name prefix is removed entirely — there is no more `"mempool.trading"`. Subscribe to a channel's pending feed by passing `confirmed: false` on the subscription (`{ id, channel: "trading", confirmed: false }`); `confirmed` defaults to `true` (the confirmed feed) and is optional on the wire. The `MempoolChannel` type and `isMempoolChannel` guard are gone, and `SubscribableChannel` is now `Channel | ClobChannel`. CLOB channels have no pending feed — `confirmed` is ignored for them.
- **BREAKING: unified event frame.** Confirmed and pending events now share one envelope: `channel` is always the bare name and a new `confirmed` boolean on the envelope tells the feeds apart. The `confirmed` field that pending frames previously carried inside `data` is gone. `SubscriptionAck` and the `subscribed` ack schema also echo `confirmed`. `ChannelPayloadMap` no longer has `mempool.`-prefixed keys.
- **BREAKING: pending-transaction payload shape.** The `call` object field `usd` is renamed to `notional_usd`, and `call` gains an `orders` array of un-collapsed per-order detail (`maker`, `taker` nullable, `token_id`, `side` `"buy"`/`"sell"`, `maker_amount`, `taker_amount`; decimal `uint256` strings, no `price` yet). `orders` is empty for non-trade calls. The pending payload no longer carries an inner `confirmed`.

### Added

- **`MempoolPayload` / `MempoolCall` / `MempoolOrder` types and schemas** (`mempoolPayloadSchema`, `mempoolCallSchema`, `mempoolOrderSchema`) for the pending feed, exported and added to the event `data` union. `MempoolPayload` is the full pending-transaction envelope (`seen_at_ms`, `transaction_hash`, `from`, `to`, `contract_kinds`, `method_selector`, `call` — nullable, `input`, `value`); `contract_kinds` is a string array (known values in the exported `MEMPOOL_CONTRACT_KINDS`) that tolerates unknown kinds so new server-side kinds never drop a frame.
- **`warning` lifecycle event and `WarningFrame` type.** The server sends a non-fatal `warning` frame (e.g. `code: "mempool_unavailable"`) right after a `confirmed: false` subscribe when the node has no pending stream; it is surfaced through the new `warning` lifecycle event rather than the `error` path.

## [0.5.0] - 2026-07-05

### Added

- **Public JWT auth flow.** Pass `realtime.token` — a string or a `() => string | Promise<string>` provider — alongside a `pk_jwt_` API key. The provider is called on every (re)connect, so tokens never go stale.
- **Browser support.** The realtime client now uses the native `WebSocket` in a browser and sends credentials in the URL query string automatically.
- **`realtime.authInQuery`** to force query-string auth (proxies / gateways).

## [0.4.2] - 2026-07-05

### Fixed

- **Realtime payload schemas now cover every field each channel's events carry.** The channel docs now document all 77 confirmed events exhaustively, and each channel schema is the union of its events' fields. Corrected wrong field names: `feesPayloadSchema` now uses `receiver` / `tokenId` / `amount` (was `id` / `token`); `resolutionPayloadSchema` uses `payoutNumerators` / `result` (was `payouts`); dropped the stray `id` / `operator` from `combosPayloadSchema`. Added the many previously-missing fields (asset ids, UMA question params, neg-risk / combinatorial / bridge fields, `transfers` batch `ids` / `amounts`, `accounts` `id` / `implementation`, etc.). Schemas stay loose and every field optional, so this is non-breaking.

## [0.4.1] - 2026-07-05

### Added

- **CLOB channels are now a first-class subscribable family.** `CLOB_CHANNELS` (`clob.book`, `clob.prices`, `clob.last_trade`, `clob.midpoint`, `clob.tick_size`, `clob.best_bid_ask`) and the `ClobChannel` type join `SubscribableChannel`, with the `isClobChannel` guard and typed payload schemas (`clobBookPayloadSchema`, `clobPricesPayloadSchema`, …). Each CLOB channel requires a `token_ids` filter, has no `type` discriminator, and has no `mempool.` companion. (`clob.prices` is the CLOB price-change feed — unrelated to the removed derived `prices` channel.)

## [0.4.0] - 2026-07-04

### Changed

- **BREAKING: realtime channel taxonomy redesign.** The confirmed channel set is now `trading`, `fees`, `oracle`, `resolution`, `lifecycle`, `positions`, `combos`, `transfers`, `accounts` (nine typed topic channels) plus the cross-cutting `wallets` and `markets` filter channels.
  - Renamed `trades` → `trading`; exchange fees moved out of it into the new `fees` channel. The `tradesPayloadSchema` / `TradesPayload` / `TRADE_EVENT_TYPES` symbols are now `tradingPayloadSchema` / `TradingPayload` / `TRADING_EVENT_TYPES`.
  - Added `fees`, `resolution`, `transfers`, `accounts`, and `positions` channels, each with its own payload schema and `*_EVENT_TYPES` union.
  - `FILTER_REQUIREMENTS` and `ConfirmedChannelPayloadMap` updated to the new channel set; `wallets` and `markets` re-emit `AnyConfirmedPayload`.

### Removed

- **BREAKING:** the `global` firehose channel (unrepresentable — subscribe to the specific channels you need).
- **BREAKING:** the `activity` channel and `activityPayloadSchema` — its events are split across the new `positions` and `combos` channels.
- **BREAKING:** the `large_trades` channel — subscribe to `trading` with a `min_usd` filter instead.
- **BREAKING:** the derived `prices` (last-trade tick) channel and its `pricesPayloadSchema` / `PricesPayload`. (The unrelated CLOB `clob.prices` channel is unaffected.)
- **BREAKING:** the `collateral` channel and `collateralPayloadSchema` — its role is covered by `positions`.
