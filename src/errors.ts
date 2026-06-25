/* oxlint-disable max-classes-per-file -- the SDK error hierarchy lives together */

/**
 * Base class for every error surfaced by the SDK.
 */
export class RadionError extends Error {
  override name = "RadionError";
}

/**
 * Raised when the SDK is used in a way the connection lifecycle forbids,
 * for example subscribing after {@link RealtimeClient.close}.
 */
export class RadionConnectionError extends RadionError {
  override name = "RadionConnectionError";
}

/**
 * Raised when the server reports an `error` frame.
 */
export class RadionServerError extends RadionError {
  override name = "RadionServerError";
  readonly code?: string | undefined;
  readonly channel?: string | undefined;
  readonly id?: string | undefined;

  constructor(
    message: string,
    options: {
      code?: string | undefined;
      channel?: string | undefined;
      id?: string | undefined;
    } = {}
  ) {
    super(message);
    this.code = options.code;
    this.channel = options.channel;
    this.id = options.id;
  }
}
