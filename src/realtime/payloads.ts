/**
 * Typed event payloads for every Radion realtime channel.
 *
 * Each channel emits a `data` object discriminated by a snake_case `type` field
 * (the `prices` channel is the exception — a flat tick with no `type`). The
 * schemas below enumerate every `data.type` value a channel can carry and type
 * the fields documented for that channel's payload.
 *
 * Provenance: field schemas mirror the published channel docs
 * (`/websockets/channels/*`), which document one representative payload per
 * channel plus the full discriminator set. Fields that are not universal across
 * a channel's events are marked optional, and every schema is `loose` so
 * additional fields the protocol carries are preserved at runtime rather than
 * stripped. Regenerate from the backend protocol schema to tighten per-event
 * field sets.
 */

import { z } from "zod";

/** Hex-encoded string (`0x…`). On-chain amounts stay strings to be bigint-safe. */
const hex = z.string();

// --- trades ----------------------------------------------------------------

export const TRADE_EVENT_TYPES = [
  "order_filled_v1",
  "order_filled_v2",
  "orders_matched_v1",
  "orders_matched_v2",
] as const;

/** Confirmed fill / order-match payload from the exchange contracts. */
export const tradesPayloadSchema = z.looseObject({
  builder: hex.optional(),
  fee: hex.optional(),
  maker: hex.optional(),
  makerAmountFilled: hex.optional(),
  metadata: hex.optional(),
  orderHash: hex.optional(),
  /** `0` = buy, `1` = sell. v2 fills and matches only. */
  side: z.number().optional(),
  taker: hex.optional(),
  takerAmountFilled: hex.optional(),
  tokenId: hex.optional(),
  type: z.enum(TRADE_EVENT_TYPES),
});
export type TradesPayload = z.infer<typeof tradesPayloadSchema>;

// --- oracle ----------------------------------------------------------------

export const ORACLE_EVENT_TYPES = [
  "uma_adapter_question_initialized",
  "uma_adapter_question_resolved",
  "uma_adapter_question_emergency_resolved",
  "uma_adapter_question_flagged",
  "uma_adapter_question_paused",
  "uma_adapter_question_unpaused",
  "uma_adapter_question_reset",
  "uma_adapter_ancillary_data_updated",
  "uma_optimistic_question_initialized",
  "uma_optimistic_question_resolved",
  "uma_optimistic_question_paused",
  "uma_optimistic_question_unpaused",
  "uma_optimistic_question_settled",
  "uma_optimistic_resolution_data_requested",
  "uma_optimistic_question_updated",
  "uma_optimistic_question_flagged_for_admin_resolution",
] as const;

/** UMA oracle lifecycle payload. */
export const oraclePayloadSchema = z.looseObject({
  payouts: z.array(hex).optional(),
  questionID: hex.optional(),
  /** `int256` price as a signed decimal string (e.g. `"-1"`). */
  settledPrice: z.string().optional(),
  type: z.enum(ORACLE_EVENT_TYPES),
});
export type OraclePayload = z.infer<typeof oraclePayloadSchema>;

// --- lifecycle -------------------------------------------------------------

export const LIFECYCLE_EVENT_TYPES = [
  "market_prepared",
  "neg_risk_question_prepared",
  "outcome_reported",
  "event_prepared",
  "condition_resolved",
  "condition_preparation",
  "condition_resolution",
  "token_registered",
] as const;

/** Market / condition lifecycle payload. */
export const lifecyclePayloadSchema = z.looseObject({
  conditionId: hex.optional(),
  oracle: hex.optional(),
  outcomeSlotCount: hex.optional(),
  questionId: hex.optional(),
  type: z.enum(LIFECYCLE_EVENT_TYPES),
});
export type LifecyclePayload = z.infer<typeof lifecyclePayloadSchema>;

// --- activity --------------------------------------------------------------

export const ACTIVITY_EVENT_TYPES = [
  "redemption",
  "binary_redemption",
  "neg_risk_redemption",
  "positions_redeemed",
  "collateral_position_split",
  "collateral_positions_merged",
  "collateral_positions_converted",
  "neg_risk_positions_converted",
  "ctf_position_split",
  "ctf_positions_merge",
  "ctf_payout_redemption",
] as const;

/** Redemption / split / merge / conversion payload. */
export const activityPayloadSchema = z.looseObject({
  amounts: z.array(hex).optional(),
  conditionId: hex.optional(),
  initiator: hex.optional(),
  payout: hex.optional(),
  type: z.enum(ACTIVITY_EVENT_TYPES),
});
export type ActivityPayload = z.infer<typeof activityPayloadSchema>;

// --- collateral ------------------------------------------------------------

export const COLLATERAL_EVENT_TYPES = [
  "transfer",
  "approval",
  "wrapped",
  "unwrapped",
] as const;

/** ERC-20 collateral payload. */
export const collateralPayloadSchema = z.looseObject({
  amount: hex.optional(),
  from: hex.optional(),
  to: hex.optional(),
  type: z.enum(COLLATERAL_EVENT_TYPES),
});
export type CollateralPayload = z.infer<typeof collateralPayloadSchema>;

// --- combos ----------------------------------------------------------------

export const COMBOS_EVENT_TYPES = [
  "event_prepared",
  "result_reported",
  "position_redeemed",
  "module_positions_merged",
  "module_positions_split",
  "horizontal_merge",
  "horizontal_split",
  "position_converted",
  "condition_resolved",
  "resolution_paused",
  "resolution_unpaused",
  "resolver_paused",
  "resolver_unpaused",
  "bridge_position_minted",
  "bridge_positions_burned",
  "legacy_collateral_settled",
  "migration_condition_registered",
  "migration_resolved",
  "position_migrated",
  "combinatorial_condition_prepared",
  "compressed",
  "converted_to_yes_basket",
  "extracted",
  "injected",
  "merged_from_yes_basket",
  "merged_on_condition",
  "split_on_condition",
  "combinatorial_wrapped",
  "combinatorial_unwrapped",
  "transfer_single",
  "transfer_batch",
] as const;

/** Module / bridge / combinatorial / ERC-1155 payload. */
export const combosPayloadSchema = z.looseObject({
  amount: hex.optional(),
  from: hex.optional(),
  id: hex.optional(),
  operator: hex.optional(),
  to: hex.optional(),
  type: z.enum(COMBOS_EVENT_TYPES),
});
export type CombosPayload = z.infer<typeof combosPayloadSchema>;

// --- prices ----------------------------------------------------------------

/** Last-traded price tick. Flat shape — no `type` discriminator. */
export const pricesPayloadSchema = z.looseObject({
  /** Last-traded price, USDC per share. */
  price: z.number(),
  /** When the tick was produced (Unix ms). */
  timestamp_ms: z.number(),
  token_id: hex,
});
export type PricesPayload = z.infer<typeof pricesPayloadSchema>;

// --- aggregates ------------------------------------------------------------

/** Any typed channel payload. Emitted by the `global` firehose. */
export const anyConfirmedPayloadSchema = z.union([
  tradesPayloadSchema,
  oraclePayloadSchema,
  lifecyclePayloadSchema,
  activityPayloadSchema,
  collateralPayloadSchema,
  combosPayloadSchema,
]);
export type AnyConfirmedPayload = z.infer<typeof anyConfirmedPayloadSchema>;

/**
 * Schema for the `data` of any event frame: a typed channel payload, a price
 * tick, or — for forward compatibility with event types added server-side
 * before the SDK enumerates them — any other JSON object. The final member
 * means validation never drops a structurally valid event, while letting
 * `parseInboundFrame` return fully-typed frames without an assertion.
 */
export const channelDataSchema = z.union([
  tradesPayloadSchema,
  oraclePayloadSchema,
  lifecyclePayloadSchema,
  activityPayloadSchema,
  collateralPayloadSchema,
  combosPayloadSchema,
  pricesPayloadSchema,
  z.record(z.string(), z.unknown()),
]);

/** Any payload deliverable on an event frame. */
export type AnyChannelPayload = z.infer<typeof channelDataSchema>;

/**
 * Maps each confirmed channel to the payload its event frames carry. Filtered
 * views (`wallets`, `markets`, `large_trades`) and the `global` firehose
 * re-emit the typed channels' payloads.
 */
export interface ConfirmedChannelPayloadMap {
  global: AnyConfirmedPayload;
  trades: TradesPayload;
  oracle: OraclePayload;
  lifecycle: LifecyclePayload;
  activity: ActivityPayload;
  collateral: CollateralPayload;
  combos: CombosPayload;
  prices: PricesPayload;
  wallets: AnyConfirmedPayload;
  markets: AnyConfirmedPayload;
  large_trades: TradesPayload;
}

/**
 * Maps every subscribable channel to its payload. Each `mempool.`-prefixed
 * companion carries the same payload shape as its confirmed channel, so the
 * mempool keys are derived from {@link ConfirmedChannelPayloadMap}.
 */
export type ChannelPayloadMap = ConfirmedChannelPayloadMap & {
  [C in keyof ConfirmedChannelPayloadMap as `mempool.${C & string}`]: ConfirmedChannelPayloadMap[C];
};
