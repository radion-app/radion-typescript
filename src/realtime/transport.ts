import type { RawData, WebSocket as WsWebSocket } from "ws";

import { isBrowser } from "./auth.js";
import { inflateFrame } from "./compression.js";

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

/** Collect a `ws` data frame into a single buffer. */
const toWsBuffer = (data: RawData): Buffer => {
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  if (Buffer.isBuffer(data)) {
    return data;
  }
  return Buffer.from(data);
};

/** Normalize a `ws` data frame into a UTF-8 string. */
const decodeWsData = (data: RawData): string =>
  typeof data === "string" ? data : toWsBuffer(data).toString("utf-8");

/** Collect a native binary frame into a single byte array. */
const toBrowserBytes = async (data: unknown): Promise<Uint8Array> => {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }
  throw new Error("unexpected binary frame type");
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

/**
 * Decode a native frame. A text frame is already JSON; a binary frame is
 * zlib-compressed when compression is on, and plain UTF-8 otherwise.
 */
const decodeBrowserFrame = async (
  data: unknown,
  compress: boolean
): Promise<string> => {
  if (typeof data === "string") {
    return data;
  }
  if (compress) {
    return await inflateFrame(await toBrowserBytes(data));
  }
  return await decodeBrowserData(data);
};

/**
 * Deliver a frame whose decoding may fail, routing a failure to `onError`
 * rather than dropping it or leaving an unhandled rejection.
 */
const deliverFrame = async (
  decode: () => Promise<string>,
  handlers: SocketHandlers
): Promise<void> => {
  let text: string;
  try {
    text = await decode();
  } catch (error) {
    handlers.onError(error instanceof Error ? error : new Error(String(error)));
    return;
  }
  handlers.onMessage(text);
};

const createBrowserSocket = (
  url: string,
  compress: boolean,
  handlers: SocketHandlers
): SocketLike => {
  const socket = new WebSocket(url);
  if (compress) {
    socket.binaryType = "arraybuffer";
  }
  socket.addEventListener("open", () => {
    handlers.onOpen();
  });
  socket.addEventListener("message", (event) => {
    void deliverFrame(
      async () => await decodeBrowserFrame(event.data, compress),
      handlers
    );
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
  compress: boolean,
  handlers: SocketHandlers
): Promise<SocketLike> => {
  const { WebSocket: NodeWebSocket } = await import("ws");
  const socket: WsWebSocket = new NodeWebSocket(url, { headers });
  socket.on("open", () => {
    handlers.onOpen();
  });
  socket.on("message", (data: RawData, isBinary: boolean) => {
    if (compress && isBinary) {
      void deliverFrame(
        async () => await inflateFrame(toWsBuffer(data)),
        handlers
      );
      return;
    }
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
 *
 * With `compress` on, binary frames are inflated as zlib before delivery; text
 * frames still pass through untouched.
 */
export const createSocket = async (
  url: string,
  options: {
    compress?: boolean | undefined;
    headers?: Record<string, string> | undefined;
    handlers: SocketHandlers;
  }
): Promise<SocketLike> => {
  const compress = options.compress ?? false;
  if (isBrowser()) {
    return createBrowserSocket(url, compress, options.handlers);
  }
  return await createNodeSocket(
    url,
    options.headers,
    compress,
    options.handlers
  );
};
