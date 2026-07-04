/**
 * Typed event payloads for every Radion realtime channel.
 *
 * Each channel emits a `data` object discriminated by a snake_case `type` field.
 * The schemas below enumerate every `data.type` value a channel can carry and
 * type the fields documented for that channel's payload.
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

// --- trading ---------------------------------------------------------------

export const TRADING_EVENT_TYPES = [
  "order_filled_v1",
  "order_filled_v2",
  "orders_matched_v1",
  "orders_matched_v2",
  "order_cancelled",
  "order_preapproved",
  "order_preapproval_invalidated",
  "trading_paused",
  "trading_unpaused",
] as const;

/** Confirmed fill / order-match / order-lifecycle payload from the exchange. */
export const tradingPayloadSchema = z.looseObject({
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
  type: z.enum(TRADING_EVENT_TYPES),
});
export type TradingPayload = z.infer<typeof tradingPayloadSchema>;

// --- fees ------------------------------------------------------------------

export const FEES_EVENT_TYPES = ["fee_charged_v1", "fee_charged_v2"] as const;

/** Exchange fee charged payload. */
export const feesPayloadSchema = z.looseObject({
  amount: hex.optional(),
  id: hex.optional(),
  receiver: hex.optional(),
  token: hex.optional(),
  type: z.enum(FEES_EVENT_TYPES),
});
export type FeesPayload = z.infer<typeof feesPayloadSchema>;

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

/** UMA question mechanism payload. */
export const oraclePayloadSchema = z.looseObject({
  payouts: z.array(hex).optional(),
  questionID: hex.optional(),
  /** `int256` price as a signed decimal string (e.g. `"-1"`). */
  settledPrice: z.string().optional(),
  type: z.enum(ORACLE_EVENT_TYPES),
});
export type OraclePayload = z.infer<typeof oraclePayloadSchema>;

// --- resolution ------------------------------------------------------------

export const RESOLUTION_EVENT_TYPES = [
  "condition_resolution",
  "condition_resolved",
  "outcome_reported",
  "result_reported",
  "resolution_paused",
  "resolution_unpaused",
  "resolver_paused",
  "resolver_unpaused",
] as const;

/** Settlement outcome payload. */
export const resolutionPayloadSchema = z.looseObject({
  conditionId: hex.optional(),
  payouts: z.array(hex).optional(),
  questionId: hex.optional(),
  type: z.enum(RESOLUTION_EVENT_TYPES),
});
export type ResolutionPayload = z.infer<typeof resolutionPayloadSchema>;

// --- lifecycle -------------------------------------------------------------

export const LIFECYCLE_EVENT_TYPES = [
  "market_prepared",
  "event_prepared",
  "condition_preparation",
  "token_registered",
  "neg_risk_question_prepared",
  "combinatorial_condition_prepared",
  "migration_condition_registered",
] as const;

/** Market creation / preparation payload. */
export const lifecyclePayloadSchema = z.looseObject({
  conditionId: hex.optional(),
  oracle: hex.optional(),
  outcomeSlotCount: hex.optional(),
  questionId: hex.optional(),
  type: z.enum(LIFECYCLE_EVENT_TYPES),
});
export type LifecyclePayload = z.infer<typeof lifecyclePayloadSchema>;

// --- positions -------------------------------------------------------------

export const POSITIONS_EVENT_TYPES = [
  "ctf_position_split",
  "ctf_positions_merge",
  "ctf_payout_redemption",
  "collateral_position_split",
  "collateral_positions_merged",
  "positions_redeemed",
] as const;

/** Plain CTF base-layer split / merge / redemption payload. */
export const positionsPayloadSchema = z.looseObject({
  amounts: z.array(hex).optional(),
  conditionId: hex.optional(),
  initiator: hex.optional(),
  payout: hex.optional(),
  type: z.enum(POSITIONS_EVENT_TYPES),
});
export type PositionsPayload = z.infer<typeof positionsPayloadSchema>;

// --- combos ----------------------------------------------------------------

export const COMBOS_EVENT_TYPES = [
  "redemption",
  "binary_redemption",
  "neg_risk_redemption",
  "collateral_positions_converted",
  "neg_risk_positions_converted",
  "position_converted",
  "position_redeemed",
  "module_positions_merged",
  "module_positions_split",
  "horizontal_merge",
  "horizontal_split",
  "split_on_condition",
  "merged_on_condition",
  "converted_to_yes_basket",
  "merged_from_yes_basket",
  "extracted",
  "injected",
  "compressed",
  "combinatorial_wrapped",
  "combinatorial_unwrapped",
  "position_migrated",
  "migration_resolved",
  "bridge_position_minted",
  "bridge_positions_burned",
  "legacy_collateral_settled",
] as const;

/** Module / redeemer / neg-risk / combinatorial system payload. */
export const combosPayloadSchema = z.looseObject({
  amount: hex.optional(),
  from: hex.optional(),
  id: hex.optional(),
  operator: hex.optional(),
  to: hex.optional(),
  type: z.enum(COMBOS_EVENT_TYPES),
});
export type CombosPayload = z.infer<typeof combosPayloadSchema>;

// --- transfers -------------------------------------------------------------

export const TRANSFERS_EVENT_TYPES = [
  "transfer_single",
  "transfer_batch",
] as const;

/** ERC-1155 outcome-token move payload. */
export const transfersPayloadSchema = z.looseObject({
  amount: hex.optional(),
  from: hex.optional(),
  id: hex.optional(),
  operator: hex.optional(),
  to: hex.optional(),
  type: z.enum(TRANSFERS_EVENT_TYPES),
});
export type TransfersPayload = z.infer<typeof transfersPayloadSchema>;

// --- accounts --------------------------------------------------------------

export const ACCOUNTS_EVENT_TYPES = [
  "wallet_deployed",
  "proxy_creation",
] as const;

/** Proxy wallet creation payload. */
export const accountsPayloadSchema = z.looseObject({
  owner: hex.optional(),
  proxy: hex.optional(),
  type: z.enum(ACCOUNTS_EVENT_TYPES),
  wallet: hex.optional(),
});
export type AccountsPayload = z.infer<typeof accountsPayloadSchema>;

// --- aggregates ------------------------------------------------------------

/** Any typed topic-channel payload. Re-emitted by the cross-cutting filters. */
export const anyConfirmedPayloadSchema = z.union([
  tradingPayloadSchema,
  feesPayloadSchema,
  oraclePayloadSchema,
  resolutionPayloadSchema,
  lifecyclePayloadSchema,
  positionsPayloadSchema,
  combosPayloadSchema,
  transfersPayloadSchema,
  accountsPayloadSchema,
]);
export type AnyConfirmedPayload = z.infer<typeof anyConfirmedPayloadSchema>;

/**
 * Schema for the `data` of any event frame: a typed channel payload or — for
 * forward compatibility with event types added server-side before the SDK
 * enumerates them — any other JSON object. The final member means validation
 * never drops a structurally valid event, while letting `parseInboundFrame`
 * return fully-typed frames without an assertion.
 */
export const channelDataSchema = z.union([
  tradingPayloadSchema,
  feesPayloadSchema,
  oraclePayloadSchema,
  resolutionPayloadSchema,
  lifecyclePayloadSchema,
  positionsPayloadSchema,
  combosPayloadSchema,
  transfersPayloadSchema,
  accountsPayloadSchema,
  z.record(z.string(), z.unknown()),
]);

/** Any payload deliverable on an event frame. */
export type AnyChannelPayload = z.infer<typeof channelDataSchema>;

/**
 * Maps each confirmed channel to the payload its event frames carry. The
 * cross-cutting filter channels (`wallets`, `markets`) re-emit the typed topic
 * channels' payloads.
 */
export interface ConfirmedChannelPayloadMap {
  trading: TradingPayload;
  fees: FeesPayload;
  oracle: OraclePayload;
  resolution: ResolutionPayload;
  lifecycle: LifecyclePayload;
  positions: PositionsPayload;
  combos: CombosPayload;
  transfers: TransfersPayload;
  accounts: AccountsPayload;
  wallets: AnyConfirmedPayload;
  markets: AnyConfirmedPayload;
}

/**
 * Maps every subscribable channel to its payload. Each `mempool.`-prefixed
 * companion carries the same payload shape as its confirmed channel, so the
 * mempool keys are derived from {@link ConfirmedChannelPayloadMap}.
 */
export type ChannelPayloadMap = ConfirmedChannelPayloadMap & {
  [C in keyof ConfirmedChannelPayloadMap as `mempool.${C & string}`]: ConfirmedChannelPayloadMap[C];
};
