/** Default base URL for the Radion API. */
export const DEFAULT_BASE_URL = "https://api.radion.app";

/** Default endpoint for the Radion realtime (WebSocket) API. */
export const DEFAULT_WS_URL = "wss://api.radion.app/ws";

/**
 * Shared configuration for every Radion product surface.
 *
 * `baseUrl` is reserved for forthcoming product surfaces; the realtime client
 * uses `wsUrl`.
 */
export interface RadionConfig {
  /** Radion API key, sent as the `X-API-Key` header on every request. */
  apiKey: string;
  /** Override the base URL. Defaults to `https://api.radion.app`. */
  baseUrl?: string;
  /** Override the realtime endpoint. Defaults to `wss://api.radion.app/ws`. */
  wsUrl?: string;
}
