import type { ChannelEvent } from "./protocol.js";

/** Handler invoked with each event delivered on a channel. */
export type ChannelHandler = (event: ChannelEvent) => void;

/** Lifecycle/connection events emitted alongside channel data. */
export interface ClientEventMap {
  open: undefined;
  close: { code: number; reason: string };
  reconnect: { attempt: number; delayMs: number };
  error: Error;
}

export type ClientEvent = keyof ClientEventMap;
export type ClientHandler<E extends ClientEvent> = (
  payload: ClientEventMap[E]
) => void;

type PayloadEvent = "close" | "reconnect" | "error";

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
  private readonly clientHandlers = new Map<
    ClientEvent,
    Set<ClientHandler<ClientEvent>>
  >();

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
    const set = this.clientHandlers.get(event) ?? new Set();
    // Safe: the slot's payload type matches `handler` by the `E` binding.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    set.add(handler as ClientHandler<ClientEvent>);
    this.clientHandlers.set(event, set);
  }

  offClient<E extends ClientEvent>(event: E, handler?: ClientHandler<E>): void {
    if (!handler) {
      this.clientHandlers.delete(event);
      return;
    }
    const set = this.clientHandlers.get(event);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    set?.delete(handler as ClientHandler<ClientEvent>);
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
  emit(event: "open"): void;
  /** Emit a lifecycle event that carries a payload. */
  emit<E extends PayloadEvent>(event: E, payload: ClientEventMap[E]): void;
  emit(event: ClientEvent, payload?: ClientEventMap[ClientEvent]): void {
    const handlers = this.clientHandlers.get(event);
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
