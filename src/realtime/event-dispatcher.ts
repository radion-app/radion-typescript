import type { ChannelEvent } from "./protocol.js";

/** Handler invoked with each event delivered on a channel. */
export type ChannelHandler = (event: ChannelEvent) => void;

/** Lifecycle/connection events emitted alongside channel data. */
export interface ClientEventMap {
  open: undefined;
  close: { code: number; reason: string };
  reconnect: { attempt: number; delayMs: number };
  error: Error;
  /** Non-fatal server warning, e.g. `mempool_unavailable`. */
  warning: { code: string; id?: string; message: string };
}

export type ClientEvent = keyof ClientEventMap;
export type ClientHandler<E extends ClientEvent> = (
  payload: ClientEventMap[E]
) => void;

type PayloadEvent = "close" | "reconnect" | "error" | "warning";

/**
 * Routes inbound channel frames to channel handlers and connection lifecycle
 * events to lifecycle handlers.
 *
 * Channel events are delivered to handlers registered for their `channel`
 * name and to any registered for all events (the `"event"` wildcard).
 *
 * Handler exceptions are isolated: a throwing consumer handler is reported
 * through the `error` lifecycle event and never retried, and it never breaks
 * delivery to other handlers.
 */
export class EventDispatcher {
  private readonly channelHandlers = new Map<string, Set<ChannelHandler>>();
  private readonly allHandlers = new Set<ChannelHandler>();
  private readonly clientHandlers: {
    [E in ClientEvent]?: Set<ClientHandler<E>>;
  } = {};

  onChannel(channel: string, handler: ChannelHandler): void {
    const set = this.channelHandlers.get(channel) ?? new Set();
    set.add(handler);
    this.channelHandlers.set(channel, set);
  }

  offChannel(channel: string, handler?: ChannelHandler): void {
    if (!handler) {
      this.channelHandlers.delete(channel);
      return;
    }
    this.channelHandlers.get(channel)?.delete(handler);
  }

  /** Register a handler for every channel event, regardless of channel. */
  onAll(handler: ChannelHandler): void {
    this.allHandlers.add(handler);
  }

  offAll(handler?: ChannelHandler): void {
    if (!handler) {
      this.allHandlers.clear();
      return;
    }
    this.allHandlers.delete(handler);
  }

  onClient<E extends ClientEvent>(event: E, handler: ClientHandler<E>): void {
    const existing: Set<ClientHandler<E>> | undefined =
      this.clientHandlers[event];
    const set = existing ?? new Set<ClientHandler<E>>();
    set.add(handler);
    // Per-event slot write; `Object.assign` avoids the generic-key write
    // limitation without a type assertion.
    Object.assign(this.clientHandlers, { [event]: set });
  }

  offClient<E extends ClientEvent>(event: E, handler?: ClientHandler<E>): void {
    if (!handler) {
      this.clientHandlers[event]?.clear();
      return;
    }
    this.clientHandlers[event]?.delete(handler);
  }

  /** Deliver a channel event to its channel handlers and the `"event"` wildcard. */
  dispatch(event: ChannelEvent): void {
    const handlers = this.channelHandlers.get(event.channel);
    if (handlers) {
      for (const handler of handlers) {
        this.safely(() => {
          handler(event);
        });
      }
    }
    for (const handler of this.allHandlers) {
      this.safely(() => {
        handler(event);
      });
    }
  }

  /** Emit the parameterless `open` lifecycle event. */
  emit(event: "open", payload?: undefined): void;
  /** Emit a lifecycle event that carries a payload. */
  emit<E extends PayloadEvent>(event: E, payload: ClientEventMap[E]): void;
  emit<E extends ClientEvent>(event: E, payload: ClientEventMap[E]): void {
    const handlers = this.clientHandlers[event];
    if (!handlers) {
      return;
    }
    for (const handler of handlers) {
      // `error` handlers must not recurse into the error path themselves.
      if (event === "error") {
        handler(payload);
        continue;
      }
      this.safely(() => {
        handler(payload);
      });
    }
  }

  private safely(fn: () => void): void {
    try {
      fn();
    } catch (error) {
      const normalized =
        error instanceof Error ? error : new Error(String(error));
      this.emit("error", normalized);
    }
  }
}
