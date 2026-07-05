import type { RawData, WebSocket as WsWebSocket } from "ws";

import { isBrowser } from "./auth.js";

/** The minimal socket surface the realtime client drives. */
export interface SocketLike {
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  /** Force-close without a handshake. Falls back to `close` where unsupported. */
  terminate: () => void;
}

/** Lifecycle callbacks a transport delivers to the realtime client. */
export interface SocketHandlers {
  onOpen: () => void;
  onMessage: (data: string) => void;
  onClose: (code: number, reason: string) => void;
  onError: (err: Error) => void;
}

/** Normalize a `ws` data frame into a UTF-8 string. */
const decodeWsData = (data: RawData): string => {
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

/** Normalize a native `MessageEvent.data` into a UTF-8 string. */
const decodeBrowserData = async (data: unknown): Promise<string> => {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return await data.text();
  }
  return String(data);
};

const dispatchBrowserMessage = async (
  event: MessageEvent,
  handlers: SocketHandlers
): Promise<void> => {
  handlers.onMessage(await decodeBrowserData(event.data));
};

const createBrowserSocket = (
  url: string,
  handlers: SocketHandlers
): SocketLike => {
  const socket = new WebSocket(url);
  socket.addEventListener("open", () => {
    handlers.onOpen();
  });
  socket.addEventListener("message", (event) => {
    void dispatchBrowserMessage(event, handlers);
  });
  socket.addEventListener("close", (event) => {
    handlers.onClose(event.code, event.reason);
  });
  socket.addEventListener("error", () => {
    handlers.onError(new Error("websocket error"));
  });
  return {
    close: (code, reason) => {
      socket.close(code, reason);
    },
    send: (data) => {
      socket.send(data);
    },
    terminate: () => {
      socket.close();
    },
  };
};

const createNodeSocket = async (
  url: string,
  headers: Record<string, string> | undefined,
  handlers: SocketHandlers
): Promise<SocketLike> => {
  const { WebSocket: NodeWebSocket } = await import("ws");
  const socket: WsWebSocket = new NodeWebSocket(url, { headers });
  socket.on("open", () => {
    handlers.onOpen();
  });
  socket.on("message", (data: RawData) => {
    handlers.onMessage(decodeWsData(data));
  });
  socket.on("error", (error: Error) => {
    handlers.onError(error);
  });
  socket.on("close", (code: number, reasonBuf: Buffer) => {
    handlers.onClose(code, reasonBuf.toString("utf-8"));
  });
  return {
    close: (code, reason) => {
      socket.close(code, reason);
    },
    send: (data) => {
      socket.send(data);
    },
    terminate: () => {
      socket.terminate();
    },
  };
};

/**
 * Open a WebSocket using the right transport for the environment: the native
 * global `WebSocket` in a browser (headers ignored — auth rides in the URL), or
 * the `ws` package under Node (headers supported). The `ws` import is lazy so
 * it never enters a browser bundle.
 */
export const createSocket = async (
  url: string,
  options: {
    headers?: Record<string, string> | undefined;
    handlers: SocketHandlers;
  }
): Promise<SocketLike> => {
  if (isBrowser()) {
    return createBrowserSocket(url, options.handlers);
  }
  return await createNodeSocket(url, options.headers, options.handlers);
};
