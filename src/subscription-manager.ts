import type { Channel } from "./channels.js";

/**
 * Tracks the set of channels the consumer wants to be subscribed to.
 *
 * The manager is intentionally transport-agnostic: it records intent and
 * exposes it so the client can (re)send the matching frames. After a
 * reconnect the client replays {@link desired} to restore subscriptions.
 */
export class SubscriptionManager {
  private readonly channels = new Set<Channel>();

  /** Record intent to be subscribed to `channel`. Returns `true` if new. */
  add(channel: Channel): boolean {
    if (this.channels.has(channel)) {
      return false;
    }
    this.channels.add(channel);
    return true;
  }

  /** Drop intent to be subscribed to `channel`. Returns `true` if removed. */
  remove(channel: Channel): boolean {
    return this.channels.delete(channel);
  }

  /** Whether `channel` is currently in the desired set. */
  has(channel: Channel): boolean {
    return this.channels.has(channel);
  }

  /** Snapshot of every channel that should be subscribed. */
  get desired(): Channel[] {
    return [...this.channels];
  }
}
