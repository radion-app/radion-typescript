import { deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import type { WebSocket as WsWebSocket } from "ws";

import { createSocket } from "./transport.js";
import type { SocketLike } from "./transport.js";

/** Start a local WS server that runs `onConnection` for every client. */
const startServer = async (
  onConnection: (client: WsWebSocket) => void
): Promise<{ url: string; close: () => void }> => {
  const server = new WebSocketServer({ port: 0 });
  server.on("connection", onConnection);
  // oxlint-disable-next-line promise/avoid-new
  await new Promise<void>((resolve) => {
    server.once("listening", resolve);
  });
  const address = server.address();
  const port =
    address === null || typeof address === "string" ? 0 : address.port;
  return {
    close: () => {
      server.close();
    },
    url: `ws://127.0.0.1:${port}`,
  };
};

/** First frame delivered, or the first error raised, whichever lands first. */
interface FirstFrame {
  message?: string;
  error?: Error;
}

/** Connect with compression on and wait for that first outcome. */
const connectAndWait = async (
  url: string
): Promise<FirstFrame & { socket: SocketLike }> => {
  // Assigned synchronously by the Promise executor below.
  let settle!: (outcome: FirstFrame) => void;
  // oxlint-disable-next-line promise/avoid-new
  const settled = new Promise<FirstFrame>((resolve) => {
    settle = resolve;
  });
  const socket = await createSocket(url, {
    compress: true,
    handlers: {
      onClose: () => {},
      onError: (error) => {
        settle({ error });
      },
      onMessage: (message) => {
        settle({ message });
      },
      onOpen: () => {},
    },
  });
  return { ...(await settled), socket };
};

describe("createSocket (node/ws path)", () => {
  it("returns a SocketLike with the expected shape", async () => {
    const socket = await createSocket("ws://127.0.0.1:59999", {
      handlers: {
        onClose: () => {},
        onError: () => {},
        onMessage: () => {},
        onOpen: () => {},
      },
      headers: { "X-API-Key": "k" },
    });
    expect(typeof socket.send).toBe("function");
    expect(typeof socket.close).toBe("function");
    expect(typeof socket.terminate).toBe("function");
    socket.terminate();
  });
});

describe("createSocket with compression", () => {
  it("inflates a zlib binary frame", async () => {
    const json = '{"type":"pong"}';
    const server = await startServer((client) => {
      client.send(deflateSync(Buffer.from(json, "utf-8")));
    });
    const { message, error, socket } = await connectAndWait(server.url);
    socket.terminate();
    server.close();
    expect(error).toBeUndefined();
    expect(message).toBe(json);
  });

  it("passes an uncompressed text frame through", async () => {
    const json = '{"type":"pong"}';
    const server = await startServer((client) => {
      client.send(json);
    });
    const { message, error, socket } = await connectAndWait(server.url);
    socket.terminate();
    server.close();
    expect(error).toBeUndefined();
    expect(message).toBe(json);
  });

  it("reports an error when a binary frame is not zlib", async () => {
    const server = await startServer((client) => {
      client.send(Buffer.from([1, 2, 3, 4]));
    });
    const { message, error, socket } = await connectAndWait(server.url);
    socket.terminate();
    server.close();
    expect(message).toBeUndefined();
    expect(error?.message).toContain("failed to inflate compressed frame");
  });
});
