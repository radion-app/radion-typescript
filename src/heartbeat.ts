/**
 * Options controlling heartbeat / stale-connection detection.
 */
export interface HeartbeatOptions {
  /** Interval between client pings, in milliseconds. */
  intervalMs?: number;
  /**
   * How long to wait for any inbound traffic (pong or data) after a ping
   * before declaring the connection stale, in milliseconds.
   */
  timeoutMs?: number;
}

const DEFAULTS: Required<HeartbeatOptions> = {
  intervalMs: 15_000,
  timeoutMs: 10_000,
};

/**
 * Drives the heartbeat loop: periodically asks the client to send a ping and,
 * if no inbound traffic arrives within the timeout window, invokes the stale
 * callback so the client can tear down and reconnect.
 *
 * Any inbound frame counts as liveness, so a busy connection never trips the
 * timeout even if explicit pongs are dropped.
 */
export class Heartbeat {
  private readonly options: Required<HeartbeatOptions>;
  private readonly sendPing: () => void;
  private readonly onStale: () => void;

  private pingTimer?: ReturnType<typeof setInterval> | undefined;
  private staleTimer?: ReturnType<typeof setTimeout> | undefined;

  constructor(
    handlers: { sendPing: () => void; onStale: () => void },
    options: HeartbeatOptions = {}
  ) {
    this.options = { ...DEFAULTS, ...options };
    this.sendPing = handlers.sendPing;
    this.onStale = handlers.onStale;
  }

  /** Begin the heartbeat loop. Idempotent: a running loop is restarted. */
  start(): void {
    this.stop();
    this.pingTimer = setInterval(() => {
      this.beat();
    }, this.options.intervalMs);
    // `setInterval` keeps the event loop alive; unref so a Node process can exit.
    this.pingTimer.unref?.();
  }

  /** Record that inbound traffic was seen, cancelling any pending stale timer. */
  markAlive(): void {
    if (this.staleTimer) {
      clearTimeout(this.staleTimer);
      this.staleTimer = undefined;
    }
  }

  /** Stop the heartbeat loop and clear all timers. */
  stop(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
    this.markAlive();
  }

  private beat(): void {
    this.sendPing();
    if (this.staleTimer) {
      return;
    }
    this.staleTimer = setTimeout(() => {
      this.staleTimer = undefined;
      this.onStale();
    }, this.options.timeoutMs);
    this.staleTimer.unref?.();
  }
}
