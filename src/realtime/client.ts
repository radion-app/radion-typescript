import { WebSocket } from "ws";
import type { RawData } from "ws";

import { DEFAULT_WS_URL } from "../config.js";
import {
  RadionConnectionError,
  RadionError,
  RadionServerError,
} from "../errors.js";
import type { Channel } from "./channels.js";
import { EventDispatcher } from "./event-dispatcher.js";
import type {
  ChannelHandler,
  ClientEvent,
  ClientHandler,
} from "./event-dispatcher.js";
import { Heartbeat } from "./heartbeat.js";
import type { HeartbeatOptions } from "./heartbeat.js";
import {
  parseInboundFrame,
  serializeOutboundFrame,
  validateSubscriptionFilters,
} from "./protocol.js";
import type {
  ChannelEventFor,
  InboundFrame,
  OutboundFrame,
  Subscription,
} from "./protocol.js";
import { ReconnectManager } from "./reconnect-manager.js";
import type { ReconnectOptions } from "./reconnect-manager.js";
import { SubscriptionManager } from "./subscription-manager.js";

/**
 * Bridge a per-channel typed handler to the wide {@link ChannelHandler} used
 * for storage. The public typed overloads guarantee each handler matches its
 * channel's payload, and a channel only ever delivers its own payload — so this
 * narrowing is sound. It is the single type assertion the realtime layer cannot
 * express structurally (per-channel `data` typing erased to `ChannelEvent`).
 */
const asChannelHandler = (handler: (event: never) => void): ChannelHandler =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  handler as ChannelHandler;

/** Normalise a `ws` data frame into a UTF-8 string. */
const decodeData = (data: RawData): string => {
  if (typeof data === "string") {
    return data;
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf-8");
  }
  if (Buffer.isBuffer(data)) {
    return data.toString("utf-8");
  }
  return Buffer.from(data).toString("utf-8");
};

/** Build a subscribe frame, omitting `filters` when none are set. */
const subscribeFrame = (subscription: Subscription): OutboundFrame =>
  subscription.filters
    ? {
        action: "subscribe",
        channel: subscription.channel,
        filters: subscription.filters,
        id: subscription.id,
      }
    : {
        action: "subscribe",
        channel: subscription.channel,
        id: subscription.id,
      };

/**
 * Configuration for a {@link RealtimeClient}.
 */
export interface RealtimeOptions {
  /** Radion API key, sent as the `X-API-Key` header. */
  apiKey: string;
  /** Override the WebSocket endpoint. Defaults to `wss://api.radion.app/ws`. */
  url?: string;
  /** Tune reconnect backoff, or pass `false` to disable auto-reconnect. */
  reconnect?: ReconnectOptions | false;
  /** Tune heartbeat timing, or pass `false` to disable heartbeats. */
  heartbeat?: HeartbeatOptions | false;
}

type ConnectionState = "idle" | "connecting" | "open" | "closed";

/**
 * Lightweight WebSocket client for the Radion realtime API.
 *
 * Owns the connection lifecycle, transparently reconnects with exponential
 * backoff after unexpected drops, restores subscriptions on reconnect, and
 * routes inbound channel frames to registered handlers.
 *
 * Usually reached as `radion.realtime`, but can be constructed standalone.
 *
 * @example
 * const client = new RealtimeClient({ apiKey: process.env.RADION_API_KEY! });
 * await client.connect();
 * client.subscribe({ id: "trades", channel: "trades" });
 * client.onChannel("trades", (event) => console.log(event.id, event.data));
 */
export class RealtimeClient {
  private readonly apiKey: string;
  private readonly url: string;
  private readonly dispatcher = new EventDispatcher();
  private readonly subscriptions = new SubscriptionManager();
  private readonly reconnectManager: ReconnectManager | null;
  private readonly heartbeat: Heartbeat | null;

  private socket: WebSocket | null = null;
  private state: ConnectionState = "idle";
  private shuttingDown = false;
  private reconnectTimer?: ReturnType<typeof setTimeout> | undefined;
  private openWaiters: {
    resolve: () => void;
    reject: (e: Error) => void;
  }[] = [];

  constructor(options: RealtimeOptions) {
    if (!options.apiKey) {
      throw new RadionConnectionError("apiKey is required");
    }
    this.apiKey = options.apiKey;
    this.url = options.url ?? DEFAULT_WS_URL;
    this.reconnectManager =
      options.reconnect === false
        ? null
        : new ReconnectManager(options.reconnect);
    this.heartbeat =
      options.heartbeat === false
        ? null
        : new Heartbeat(
            {
              onStale: () => {
                this.handleStale();
              },
              sendPing: () => {
                this.sendPing();
              },
            },
            options.heartbeat
          );
  }

  /** Whether the underlying socket is currently open. */
  get connected(): boolean {
    return this.state === "open";
  }

  /**
   * Open the connection. Resolves once the socket is established, rejects if
   * the first connection attempt fails.
   *
   * Returns a deferred promise settled from the socket lifecycle handlers, so
   * it is intentionally neither `async` nor a wrapper around an existing one.
   */
  // oxlint-disable-next-line typescript/promise-function-async
  connect(): Promise<void> {
    if (this.state === "open") {
      return Promise.resolve();
    }
    this.shuttingDown = false;
    // oxlint-disable-next-line promise/avoid-new
    return new Promise((resolve, reject) => {
      this.openWaiters.push({ reject, resolve });
      if (this.state !== "connecting") {
        this.openSocket();
      }
    });
  }

  /** Subscribe to a channel. Resends automatically after a reconnect. */
  subscribe(subscription: Subscription): void {
    this.assertUsable();
    const filterError = validateSubscriptionFilters(subscription);
    if (filterError !== null) {
      throw new RadionError(filterError);
    }
    const isNew = this.subscriptions.add(subscription);
    if (isNew && this.connected) {
      this.send(subscribeFrame(subscription));
    }
  }

  /** Unsubscribe by subscription id. */
  unsubscribe(id: string): void {
    this.assertUsable();
    const removed = this.subscriptions.remove(id);
    if (removed && this.connected) {
      this.send({ action: "unsubscribe", id });
    }
  }

  /** Register a handler for a connection lifecycle event. */
  onLifecycle<E extends ClientEvent>(
    event: E,
    handler: ClientHandler<E>
  ): this {
    this.dispatcher.onClient(event, handler);
    return this;
  }

  /** Remove a lifecycle handler (or all handlers for `event`). */
  offLifecycle<E extends ClientEvent>(
    event: E,
    handler?: ClientHandler<E>
  ): this {
    this.dispatcher.offClient(event, handler);
    return this;
  }

  /** Register a handler for events on a channel, narrowing `event.data`. */
  onChannel<C extends Channel>(
    channel: C,
    handler: (event: ChannelEventFor<C>) => void
  ): this;
  /** Register a handler for any channel by name (e.g. a `mempool.` channel). */
  onChannel(channel: string, handler: ChannelHandler): this;
  onChannel(channel: string, handler: (event: never) => void): this {
    this.dispatcher.onChannel(channel, asChannelHandler(handler));
    return this;
  }

  /** Remove a channel handler (or all handlers for `channel`). */
  offChannel<C extends Channel>(
    channel: C,
    handler?: (event: ChannelEventFor<C>) => void
  ): this;
  offChannel(channel: string, handler?: ChannelHandler): this;
  offChannel(channel: string, handler?: (event: never) => void): this {
    this.dispatcher.offChannel(
      channel,
      handler ? asChannelHandler(handler) : undefined
    );
    return this;
  }

  /** Register a handler for every channel event, regardless of channel. */
  onAnyChannel(handler: ChannelHandler): this {
    this.dispatcher.onAll(handler);
    return this;
  }

  /** Remove a wildcard handler (or all of them). */
  offAnyChannel(handler?: ChannelHandler): this {
    this.dispatcher.offAll(handler);
    return this;
  }

  /**
   * Gracefully close the connection. Stops reconnect attempts and clears the
   * client for shutdown; subscription intent is preserved in memory but no
   * longer acted on.
   */
  close(code = 1000, reason = "client shutdown"): void {
    this.shuttingDown = true;
    this.state = "closed";
    this.clearReconnectTimer();
    this.reconnectManager?.reset();
    this.heartbeat?.stop();
    if (this.socket) {
      this.socket.close(code, reason);
    }
    this.rejectOpenWaiters(
      new RadionConnectionError("connection closed before it opened")
    );
  }

  private openSocket(): void {
    this.state = "connecting";
    const socket = new WebSocket(this.url, {
      headers: { "X-API-Key": this.apiKey },
    });
    this.socket = socket;

    socket.on("open", () => {
      this.handleOpen();
    });
    socket.on("message", (data) => {
      this.handleMessage(decodeData(data));
    });
    socket.on("error", (err) => {
      this.dispatcher.emit("error", err);
    });
    socket.on("close", (code, reasonBuf) => {
      this.handleClose(code, reasonBuf.toString("utf-8"));
    });
  }

  private handleOpen(): void {
    this.state = "open";
    this.reconnectManager?.reset();
    // Restore every desired subscription after a (re)connect.
    for (const subscription of this.subscriptions.desired) {
      this.send(subscribeFrame(subscription));
    }
    this.heartbeat?.start();
    this.dispatcher.emit("open");
    this.resolveOpenWaiters();
  }

  private handleMessage(raw: string): void {
    this.heartbeat?.markAlive();
    const frame = parseInboundFrame(raw);
    if (!frame) {
      return;
    }
    this.routeFrame(frame);
  }

  private routeFrame(frame: InboundFrame): void {
    switch (frame.type) {
      case "event": {
        this.dispatcher.dispatch(frame);
        break;
      }
      case "error": {
        this.dispatcher.emit(
          "error",
          new RadionServerError(frame.message, {
            channel: frame.channel,
            code: frame.code,
            id: frame.id,
          })
        );
        break;
      }
      // pong / subscribed / unsubscribed are liveness + acks; markAlive handled it.
      case "pong":
      case "subscribed":
      case "unsubscribed": {
        break;
      }
      default: {
        break;
      }
    }
  }

  private handleClose(code: number, reason: string): void {
    this.heartbeat?.stop();
    const wasOpen = this.state === "open";
    this.socket = null;
    this.dispatcher.emit("close", { code, reason });

    if (this.shuttingDown || this.state === "closed") {
      this.rejectOpenWaiters(
        new RadionConnectionError("connection closed before it opened")
      );
      return;
    }

    if (this.reconnectManager) {
      this.scheduleReconnect();
    } else {
      this.state = "closed";
      if (!wasOpen) {
        this.rejectOpenWaiters(
          new RadionConnectionError(`connection closed (${code})`)
        );
      }
    }
  }

  private handleStale(): void {
    // Treat a stale connection as an unexpected drop: terminate and reconnect.
    this.dispatcher.emit(
      "error",
      new RadionConnectionError("stale connection")
    );
    this.socket?.terminate();
  }

  private scheduleReconnect(): void {
    if (!this.reconnectManager || this.shuttingDown) {
      return;
    }
    this.state = "connecting";
    const delayMs = this.reconnectManager.nextDelay();
    this.dispatcher.emit("reconnect", {
      attempt: this.reconnectManager.attempts,
      delayMs,
    });
    this.reconnectTimer = setTimeout(() => {
      if (!this.shuttingDown) {
        this.openSocket();
      }
    }, delayMs);
    this.reconnectTimer.unref?.();
  }

  private sendPing(): void {
    if (this.connected) {
      this.send({ action: "ping" });
    }
  }

  private send(frame: Parameters<typeof serializeOutboundFrame>[0]): void {
    if (this.socket && this.state === "open") {
      this.socket.send(serializeOutboundFrame(frame));
    }
  }

  private assertUsable(): void {
    if (this.shuttingDown || this.state === "closed") {
      throw new RadionConnectionError("client has been closed");
    }
  }

  private resolveOpenWaiters(): void {
    const waiters = this.openWaiters;
    this.openWaiters = [];
    for (const waiter of waiters) {
      waiter.resolve();
    }
  }

  private rejectOpenWaiters(error: Error): void {
    const waiters = this.openWaiters;
    this.openWaiters = [];
    for (const waiter of waiters) {
      waiter.reject(error);
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }
}
