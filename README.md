# @radion/ws

[![npm version](https://img.shields.io/npm/v/@radion/ws.svg)](https://www.npmjs.com/package/@radion/ws)
[![license](https://img.shields.io/npm/l/@radion/ws.svg)](./LICENSE)

Lightweight, fully-typed WebSocket SDK for the [Radion](https://radion.app) realtime API.

```ts
const client = new RadionWS({ apiKey: process.env.RADION_API_KEY });
await client.connect();
client.subscribe("trades");
client.on("trades", (event) => console.log(event.data));
```

## Features

- **Connection lifecycle** — `connect()` / `subscribe()` / `unsubscribe()` / `close()`
- **Auto-reconnect** — exponential backoff with jitter; stops on graceful shutdown
- **Subscription restore** — active channels are re-subscribed after every reconnect
- **Heartbeats** — ping/pong keep-alive that detects stale connections and reconnects
- **Typed end-to-end** — channel names, inbound/outbound frames, and errors
- **Tiny** — single dependency (`ws`), ESM, ships its own type definitions

## Requirements

- Node.js >= 18

## Install

```bash
pnpm add @radion/ws
# or: npm install @radion/ws / yarn add @radion/ws
```

## Quick start

```ts
import { RadionWS } from "@radion/ws";

const client = new RadionWS({
  apiKey: process.env.RADION_API_KEY,
});

await client.connect();

client.subscribe("trades");

client.on("trades", (event) => {
  console.log(event.channel, event.data);
});
```

## Usage

### Configuration

```ts
new RadionWS(options);
```

| Option      | Type                        | Default                   | Description                                           |
| ----------- | --------------------------- | ------------------------- | ----------------------------------------------------- |
| `apiKey`    | `string`                    | —                         | **Required.** Sent as the `X-API-Key` header.         |
| `url`       | `string`                    | `wss://api.radion.app/ws` | Override the endpoint.                                |
| `reconnect` | `ReconnectOptions \| false` | enabled                   | Backoff tuning, or `false` to disable auto-reconnect. |
| `heartbeat` | `HeartbeatOptions \| false` | enabled                   | Heartbeat tuning, or `false` to disable.              |

`ReconnectOptions`: `{ initialDelayMs?, maxDelayMs?, factor?, jitter? }`
`HeartbeatOptions`: `{ intervalMs?, timeoutMs? }`

### Methods

| Method                       | Description                                                  |
| ---------------------------- | ------------------------------------------------------------ |
| `connect()`                  | Open the connection. Resolves once established.              |
| `subscribe(channel)`         | Subscribe to a channel. Replayed automatically on reconnect. |
| `unsubscribe(channel)`       | Unsubscribe from a channel.                                  |
| `on(channel \| event, fn)`   | Register a channel or lifecycle handler. Chainable.          |
| `off(channel \| event, fn?)` | Remove a handler (or all for that name). Chainable.          |
| `close(code?, reason?)`      | Graceful shutdown. Stops reconnect attempts.                 |
| `connected`                  | Getter — whether the socket is currently open.               |

### Channels

```
global · trades · activity · lifecycle · oracle · collateral
combos · prices · wallets · markets · large_trades
```

Available at runtime as `CHANNELS` and at the type level as `Channel`.

```ts
import { CHANNELS, type Channel } from "@radion/ws";

for (const channel of CHANNELS) {
  client.subscribe(channel);
}
```

### Lifecycle events

```ts
client.on("open", () => console.log("connected"));
client.on("close", ({ code, reason }) => console.log("closed", code, reason));
client.on("reconnect", ({ attempt, delayMs }) =>
  console.log(`reconnect #${attempt} in ${delayMs}ms`)
);
client.on("error", (err) => console.error(err));
```

### Reconnect & subscription restore

On an unexpected disconnect the client reconnects with exponential backoff and
re-sends every active subscription once the socket reopens. After `close()` no
further attempts run.

### Heartbeats

A ping is sent every `intervalMs`. Any inbound frame (pong or data) counts as
liveness; if nothing arrives within `timeoutMs` the connection is treated as
stale, terminated, and reconnected.

### Error handling

```ts
import { RadionConnectionError, RadionServerError } from "@radion/ws";

client.on("error", (err) => {
  if (err instanceof RadionServerError) {
    console.error("server error", err.code, err.channel);
  } else if (err instanceof RadionConnectionError) {
    console.error("connection error", err.message);
  }
});
```

A throwing consumer handler is reported via the `error` event and never retried.

## License

MIT
