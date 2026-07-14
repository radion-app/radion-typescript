import { RadionError } from "../errors.js";

const SIGNATURE_PREFIX = "v1=";
const HEX_DIGEST_PATTERN = /^(?:[0-9a-f]{2})+$/iu;
const HMAC_ALGORITHM = { hash: "SHA-256", name: "HMAC" } as const;

/**
 * Default replay tolerance for {@link verifyWebhookSignature}: five minutes.
 */
export const DEFAULT_WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * A webhook delivery to authenticate: the raw request plus the signing
 * secret(s) it should verify against.
 */
export interface VerifyWebhookSignatureOptions {
  /**
   * The raw request body exactly as received, before any JSON parsing. Pass
   * the original bytes when your framework exposes them; a string is UTF-8
   * encoded. Re-serializing a parsed body can change the bytes and break the
   * signature.
   */
  payload: string | Uint8Array;
  /** The `X-Radion-Signature` header value (`v1=` + hex HMAC-SHA256 digest). */
  signature: string;
  /** The `X-Radion-Timestamp` header value (Unix time in milliseconds). */
  timestamp: number | string;
  /**
   * The endpoint's signing secret (`whsec_…`). Pass several to accept more
   * than one — e.g. the old and new secret during a rotation window.
   */
  secret: string | readonly string[];
  /**
   * Maximum accepted age of the delivery in milliseconds, measured as the
   * absolute difference between now and `timestamp`. Blocks replays of old
   * captured requests. Defaults to {@link DEFAULT_WEBHOOK_TOLERANCE_MS}.
   */
  toleranceMs?: number;
}

const textEncoder = new TextEncoder();

const requireSubtle = (): SubtleCrypto => {
  if (globalThis.crypto === undefined) {
    throw new RadionError(
      "webhook signature verification needs the WebCrypto API (globalThis.crypto); use Node.js 20+, a browser, Deno, Bun, or an edge runtime"
    );
  }
  return globalThis.crypto.subtle;
};

/** Decode a `v1=<hex>` signature into digest bytes, or `null` if malformed. */
const decodeSignature = (signature: string): Uint8Array<ArrayBuffer> | null => {
  if (!signature.startsWith(SIGNATURE_PREFIX)) {
    return null;
  }
  const hexDigest = signature.slice(SIGNATURE_PREFIX.length);
  if (!HEX_DIGEST_PATTERN.test(hexDigest)) {
    return null;
  }
  const bytes = new Uint8Array(hexDigest.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(
      hexDigest.slice(index * 2, index * 2 + 2),
      16
    );
  }
  return bytes;
};

/** Build the signed message: the timestamp, a dot, and the raw body bytes. */
const encodeSignedMessage = (
  timestamp: number | string,
  payload: string | Uint8Array
): Uint8Array<ArrayBuffer> => {
  if (typeof payload === "string") {
    return textEncoder.encode(`${timestamp}.${payload}`);
  }
  const prefix = textEncoder.encode(`${timestamp}.`);
  const message = new Uint8Array(prefix.length + payload.length);
  message.set(prefix);
  message.set(payload, prefix.length);
  return message;
};

const matchesSecret = async (
  secret: string,
  digest: Uint8Array<ArrayBuffer>,
  message: Uint8Array<ArrayBuffer>
): Promise<boolean> => {
  const subtle = requireSubtle();
  const key = await subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    HMAC_ALGORITHM,
    false,
    ["verify"]
  );
  return await subtle.verify(HMAC_ALGORITHM.name, key, digest, message);
};

/**
 * Verify the HMAC-SHA256 signature on a Radion webhook delivery.
 *
 * Checks that the delivery is fresh (`timestamp` within `toleranceMs` of now)
 * and that `signature` matches `HMAC-SHA256(secret, "{timestamp}.{body}")` for
 * at least one of the given secrets. The comparison runs through WebCrypto's
 * constant-time `verify`, so it is safe against timing attacks and works in
 * any runtime with `globalThis.crypto` — Node.js 20+, browsers, Deno, Bun,
 * and edge runtimes. Verify before trusting the body, then parse it with
 * {@link parseWebhookEvent}.
 *
 * @example
 * ```ts
 * const authentic = await verifyWebhookSignature({
 *   payload: rawBody,
 *   secret: process.env.RADION_WEBHOOK_SECRET,
 *   signature: request.headers.get("x-radion-signature") ?? "",
 *   timestamp: request.headers.get("x-radion-timestamp") ?? "",
 * });
 * ```
 *
 * @returns `true` only for a fresh, correctly signed delivery.
 */
export const verifyWebhookSignature = async (
  options: VerifyWebhookSignatureOptions
): Promise<boolean> => {
  const timestampMs = Number(options.timestamp);
  if (!Number.isFinite(timestampMs)) {
    return false;
  }
  const toleranceMs = options.toleranceMs ?? DEFAULT_WEBHOOK_TOLERANCE_MS;
  if (Math.abs(Date.now() - timestampMs) > toleranceMs) {
    return false;
  }

  const digest = decodeSignature(options.signature);
  if (!digest) {
    return false;
  }

  const message = encodeSignedMessage(options.timestamp, options.payload);
  const secrets =
    typeof options.secret === "string" ? [options.secret] : options.secret;
  const matches = await Promise.all(
    secrets.map(async (secret) => await matchesSecret(secret, digest, message))
  );
  return matches.includes(true);
};
