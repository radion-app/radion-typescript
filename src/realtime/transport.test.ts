import { describe, expect, it } from "vitest";

import { createSocket } from "./transport.js";

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
