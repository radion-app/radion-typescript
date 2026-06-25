import type { Subscription } from "./protocol.js";

/**
 * Tracks the subscriptions the consumer wants to be active, keyed by id.
 *
 * The manager is intentionally transport-agnostic: it records intent and
 * exposes it so the client can (re)send the matching frames. After a
 * reconnect the client replays {@link desired} to restore subscriptions.
 */
export class SubscriptionManager {
  private readonly subscriptions = new Map<string, Subscription>();

  /** Record intent to be subscribed. Returns `true` if the id is new. */
  add(subscription: Subscription): boolean {
    const isNew = !this.subscriptions.has(subscription.id);
    this.subscriptions.set(subscription.id, subscription);
    return isNew;
  }

  /** Drop intent for `id`. Returns `true` if it was present. */
  remove(id: string): boolean {
    return this.subscriptions.delete(id);
  }

  /** Whether a subscription with `id` is in the desired set. */
  has(id: string): boolean {
    return this.subscriptions.has(id);
  }

  /** Snapshot of every subscription that should be active. */
  get desired(): Subscription[] {
    return [...this.subscriptions.values()];
  }
}
