import { DEFAULT_WS_URL } from "./config.js";
import type { RadionConfig } from "./config.js";
import { RadionConnectionError } from "./errors.js";
import { RealtimeClient } from "./realtime/client.js";
import type { RealtimeOptions } from "./realtime/client.js";

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
 * Unified entry point for the Radion platform SDK.
 *
 * Holds shared configuration and exposes each product surface as a namespace.
 * Today that is {@link realtime}; further surfaces attach here as they ship —
 * the constructor shape stays stable so adding them is purely additive.
 *
 * @example
 * const radion = new Radion({ apiKey: process.env.RADION_API_KEY! });
 * await radion.realtime.connect();
 * radion.realtime.subscribe("trades");
 * radion.realtime.onChannel("trades", (event) => console.log(event.data));
 */
export class Radion {
  /** Realtime (WebSocket) product surface. */
  readonly realtime: RealtimeClient;

  constructor(options: RadionOptions) {
    if (!options.apiKey) {
      throw new RadionConnectionError("apiKey is required");
    }
    this.realtime = new RealtimeClient({
      apiKey: options.apiKey,
      url: options.wsUrl ?? DEFAULT_WS_URL,
      ...options.realtime,
    });
  }
}
