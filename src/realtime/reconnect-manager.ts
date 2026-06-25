/**
 * Options controlling exponential-backoff reconnect behaviour.
 */
export interface ReconnectOptions {
  /** Delay before the first retry, in milliseconds. */
  initialDelayMs?: number;
  /** Upper bound on any single delay, in milliseconds. */
  maxDelayMs?: number;
  /** Multiplier applied to the delay after each attempt. */
  factor?: number;
  /** Fraction of jitter (0–1) applied to each delay. */
  jitter?: number;
}

const DEFAULTS: Required<ReconnectOptions> = {
  factor: 2,
  initialDelayMs: 500,
  jitter: 0.2,
  maxDelayMs: 30_000,
};

/**
 * Computes exponential-backoff delays for reconnect attempts.
 *
 * The manager only owns the timing policy. The client decides *when* to start
 * reconnecting and stops it (via {@link reset}) on graceful shutdown so no
 * further attempts are scheduled.
 */
export class ReconnectManager {
  private readonly options: Required<ReconnectOptions>;
  private attempt = 0;

  constructor(options: ReconnectOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  /** Number of retries since the last successful connection. */
  get attempts(): number {
    return this.attempt;
  }

  /**
   * Advance the attempt counter and return the delay to wait before the next
   * connection attempt, in milliseconds.
   */
  nextDelay(): number {
    const { initialDelayMs, maxDelayMs, factor, jitter } = this.options;
    const base = Math.min(initialDelayMs * factor ** this.attempt, maxDelayMs);
    this.attempt += 1;
    // Deterministic jitter keeps the math testable while still spreading load.
    const spread = base * jitter;
    return Math.round(base - spread / 2 + spread * this.pseudoJitter());
  }

  /** Clear the backoff state after a successful connection or shutdown. */
  reset(): void {
    this.attempt = 0;
  }

  private pseudoJitter(): number {
    // Cheap, dependency-free spread derived from the attempt count.
    const x = Math.sin(this.attempt * 12.9898) * 43_758.5453;
    return x - Math.floor(x);
  }
}
