import { DEFAULT_BASE_URL, DEFAULT_WS_URL } from "./config.js";
import type { RadionConfig } from "./config.js";
import { RadionConnectionError } from "./errors.js";
import { RealtimeClient } from "./realtime/client.js";
import type { RealtimeOptions } from "./realtime/client.js";
import { createClient, createConfig } from "./rest/client/index.js";
import type { Client } from "./rest/client/index.js";
import {
  Authentication,
  Events,
  Health,
  Markets,
  OrderBook,
  Search,
  Traders,
} from "./rest/sdk.gen.js";

/**
 * Options for the top-level {@link Radion} client.
 *
 * Extends {@link RadionConfig} with per-surface tuning.
 */
export interface RadionOptions extends RadionConfig {
  /** Tune the realtime client (reconnect / heartbeat). */
  realtime?: Omit<RealtimeOptions, "apiKey" | "url">;
}

/**
 * Wrap a generated REST resource so every call uses the shared client without
 * the caller passing it. Method signatures are preserved.
 */
const bindClient = <T extends object>(resource: T, client: Client): T =>
  new Proxy(resource, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        return (options?: Record<string, unknown>): unknown =>
          Reflect.apply(value, target, [{ ...options, client }]);
      }
      return value;
    },
  });

/**
 * Unified entry point for the Radion platform SDK.
 *
 * Holds shared configuration and exposes each product surface as a namespace:
 * {@link realtime} for the WebSocket stream, and the REST resource namespaces
 * ({@link markets}, {@link traders}, {@link events}, {@link search},
 * {@link orderBook}, {@link health}, {@link auth}) generated from the public
 * OpenAPI schema. Every REST call uses the shared API key and base URL.
 *
 * @example
 * const radion = new Radion({ apiKey: process.env.RADION_API_KEY! });
 *
 * // REST
 * const { data } = await radion.markets.listMarkets({ query: { limit: 10 } });
 *
 * // Realtime
 * await radion.realtime.connect();
 * radion.realtime.subscribe("trades");
 * radion.realtime.onChannel("trades", (event) => console.log(event.data));
 */
export class Radion {
  /** Realtime (WebSocket) product surface. */
  readonly realtime: RealtimeClient;
  /** Markets REST namespace. */
  readonly markets: typeof Markets;
  /** Traders REST namespace. */
  readonly traders: typeof Traders;
  /** Events REST namespace. */
  readonly events: typeof Events;
  /** Search REST namespace. */
  readonly search: typeof Search;
  /** Order book REST namespace. */
  readonly orderBook: typeof OrderBook;
  /** Health REST namespace. */
  readonly health: typeof Health;
  /** Authentication REST namespace. */
  readonly auth: typeof Authentication;

  constructor(options: RadionOptions) {
    if (!options.apiKey) {
      throw new RadionConnectionError("apiKey is required");
    }
    this.realtime = new RealtimeClient({
      apiKey: options.apiKey,
      url: options.wsUrl ?? DEFAULT_WS_URL,
      ...options.realtime,
    });

    const rest = createClient(
      createConfig({
        baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
        headers: { "X-API-Key": options.apiKey },
      })
    );

    this.markets = bindClient(Markets, rest);
    this.traders = bindClient(Traders, rest);
    this.events = bindClient(Events, rest);
    this.search = bindClient(Search, rest);
    this.orderBook = bindClient(OrderBook, rest);
    this.health = bindClient(Health, rest);
    this.auth = bindClient(Authentication, rest);
  }
}
