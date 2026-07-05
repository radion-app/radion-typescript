# Changelog

All notable changes to `@radion-app/sdk` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project adheres to
[Semantic Versioning](https://semver.org/).

## [0.4.2] - 2026-07-05

### Fixed

- **Realtime payload schemas now cover every field each channel's events carry.**
  The channel docs now document all 77 confirmed events exhaustively, and each
  channel schema is the union of its events' fields. Corrected wrong field names:
  `feesPayloadSchema` now uses `receiver` / `tokenId` / `amount` (was `id` /
  `token`); `resolutionPayloadSchema` uses `payoutNumerators` / `result` (was
  `payouts`); dropped the stray `id` / `operator` from `combosPayloadSchema`.
  Added the many previously-missing fields (asset ids, UMA question params,
  neg-risk / combinatorial / bridge fields, `transfers` batch `ids` / `amounts`,
  `accounts` `id` / `implementation`, etc.). Schemas stay loose and every field
  optional, so this is non-breaking.

## [0.4.1] - 2026-07-05

### Added

- **CLOB channels are now a first-class subscribable family.** `CLOB_CHANNELS`
  (`clob.book`, `clob.prices`, `clob.last_trade`, `clob.midpoint`,
  `clob.tick_size`, `clob.best_bid_ask`) and the `ClobChannel` type join
  `SubscribableChannel`, with the `isClobChannel` guard and typed payload schemas
  (`clobBookPayloadSchema`, `clobPricesPayloadSchema`, …). Each CLOB channel
  requires a `token_ids` filter, has no `type` discriminator, and has no
  `mempool.` companion. (`clob.prices` is the CLOB price-change feed — unrelated
  to the removed derived `prices` channel.)

## [0.4.0] - 2026-07-04

### Changed

- **BREAKING: realtime channel taxonomy redesign.** The confirmed channel set is
  now `trading`, `fees`, `oracle`, `resolution`, `lifecycle`, `positions`,
  `combos`, `transfers`, `accounts` (nine typed topic channels) plus the
  cross-cutting `wallets` and `markets` filter channels.
  - Renamed `trades` → `trading`; exchange fees moved out of it into the new
    `fees` channel. The `tradesPayloadSchema` / `TradesPayload` /
    `TRADE_EVENT_TYPES` symbols are now `tradingPayloadSchema` / `TradingPayload`
    / `TRADING_EVENT_TYPES`.
  - Added `fees`, `resolution`, `transfers`, `accounts`, and `positions`
    channels, each with its own payload schema and `*_EVENT_TYPES` union.
  - `FILTER_REQUIREMENTS` and `ConfirmedChannelPayloadMap` updated to the new
    channel set; `wallets` and `markets` re-emit `AnyConfirmedPayload`.

### Removed

- **BREAKING:** the `global` firehose channel (unrepresentable — subscribe to the
  specific channels you need).
- **BREAKING:** the `activity` channel and `activityPayloadSchema` — its events
  are split across the new `positions` and `combos` channels.
- **BREAKING:** the `large_trades` channel — subscribe to `trading` with a
  `min_usd` filter instead.
- **BREAKING:** the derived `prices` (last-trade tick) channel and its
  `pricesPayloadSchema` / `PricesPayload`. (The unrelated CLOB `clob.prices`
  channel is unaffected.)
- **BREAKING:** the `collateral` channel and `collateralPayloadSchema` — its role
  is covered by `positions`.
