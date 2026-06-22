import { WebSocket } from "ws";
import type { RawData } from "ws";

import { isChannel } from "./channels.js";
import type { Channel } from "./channels.js";
import { RadionConnectionError, RadionServerError } from "./errors.js";
import { EventDispatcher } from "./event-dispatcher.js";
import type {
  ChannelHandler,
  ClientEvent,
  ClientHandler,
} from "./event-dispatcher.js";
import { Heartbeat } from "./heartbeat.js";
import type { HeartbeatOptions } from "./heartbeat.js";
import { parseInboundFrame, serializeOutboundFrame } from "./protocol.js";
import type { InboundFrame } from "./protocol.js";
import { ReconnectManager } from "./reconnect-manager.js";
import type { ReconnectOptions } from "./reconnect-manager.js";
import { SubscriptionManager } from "./subscription-manager.js";

const DEFAULT_URL = "wss://api.radion.app/ws";

const CLIENT_EVENTS = new Set<string>(["open", "close", "reconnect", "error"]);

const isClientEvent = (value: string): value is ClientEvent =>
  CLIENT_EVENTS.has(value);

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

/**
 * Configuration for a {@link RadionWS} client.
 */
export interface RadionWSOptions {
  /** Radion API key, sent as an `Authorization: Bearer` header. */
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
 * @example
 * const client = new RadionWS({ apiKey: process.env.RADION_API_KEY! });
 * await client.connect();
 * client.subscribe("trades");
 * client.on("trades", (event) => console.log(event.data));
 */
export class RadionWS {
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

  constructor(options: RadionWSOptions) {
    if (!options.apiKey) {
      throw new RadionConnectionError("apiKey is required");
    }
    this.apiKey = options.apiKey;
    this.url = options.url ?? DEFAULT_URL;
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
  subscribe(channel: Channel): void {
    this.assertUsable();
    const isNew = this.subscriptions.add(channel);
    if (isNew && this.connected) {
      this.send({ channel, type: "subscribe" });
    }
  }

  /** Unsubscribe from a channel. */
  unsubscribe(channel: Channel): void {
    this.assertUsable();
    const removed = this.subscriptions.remove(channel);
    if (removed && this.connected) {
      this.send({ channel, type: "unsubscribe" });
    }
  }

  /** Register a handler for events on a channel. */
  on(channel: Channel, handler: ChannelHandler): this;
  /** Register a handler for a connection lifecycle event. */
  on<E extends ClientEvent>(event: E, handler: ClientHandler<E>): this;
  on(event: string, handler: (payload: never) => void): this {
    // Casts are safe by the public overloads: `event` selects the slot whose
    // payload type the caller's `handler` was declared against.
    if (isClientEvent(event)) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      this.dispatcher.onClient(event, handler as ClientHandler<ClientEvent>);
    } else if (isChannel(event)) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      this.dispatcher.onChannel(event, handler as ChannelHandler);
    }
    return this;
  }

  /** Remove a previously registered handler (or all for the channel/event). */
  off(channel: Channel, handler?: ChannelHandler): this;
  off<E extends ClientEvent>(event: E, handler?: ClientHandler<E>): this;
  off(event: string, handler?: (payload: never) => void): this {
    if (isClientEvent(event)) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      this.dispatcher.offClient(event, handler as ClientHandler<ClientEvent>);
    } else if (isChannel(event)) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      this.dispatcher.offChannel(event, handler as ChannelHandler);
    }
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
    for (const channel of this.subscriptions.desired) {
      this.send({ channel, type: "subscribe" });
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
      this.send({ ts: Date.now(), type: "ping" });
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
