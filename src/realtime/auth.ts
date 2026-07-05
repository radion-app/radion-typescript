/** A function that resolves the current user JWT (sync or async). */
export type TokenProvider = () => string | Promise<string>;

/** A static token string or a provider that returns one. */
export type TokenInput = string | TokenProvider;

/**
 * Normalize a token input into an async provider, or `null` when unset.
 * A plain string becomes a constant provider; a sync callable is awaited too.
 */
export const normalizeToken = (
  token?: TokenInput
): (() => Promise<string>) | null => {
  if (token === undefined) {
    return null;
  }
  const source = token;
  // oxlint-disable-next-line typescript/promise-function-async
  return (): Promise<string> =>
    Promise.resolve(typeof source === "string" ? source : source());
};

/**
 * Append `api-key` (and optional `token`) to a WebSocket URL's query string,
 * preserving any existing query and URL-encoding the values. Used when auth
 * cannot travel in headers (browsers, header-stripping proxies).
 */
export const buildAuthQueryUrl = (
  url: string,
  params: { apiKey: string; token?: string | undefined }
): string => {
  const separator = url.includes("?") ? "&" : "?";
  const parts = [`api-key=${encodeURIComponent(params.apiKey)}`];
  if (params.token !== undefined) {
    parts.push(`token=${encodeURIComponent(params.token)}`);
  }
  return `${url}${separator}${parts.join("&")}`;
};

/** True when running in a browser-like environment (DOM present, no Node). */
export const isBrowser = (): boolean =>
  typeof globalThis !== "undefined" &&
  (globalThis as { window?: unknown }).window !== undefined &&
  (globalThis as { process?: unknown }).process === undefined;
