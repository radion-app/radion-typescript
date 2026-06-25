# @radion-app/sdk

[![npm version](https://img.shields.io/npm/v/@radion-app/sdk.svg)](https://www.npmjs.com/package/@radion-app/sdk)
[![license](https://img.shields.io/npm/l/@radion-app/sdk.svg)](./LICENSE)

Official, fully-typed SDK for the [Radion](https://radion.app) platform.

One client, one API key, every Radion product surface.

```ts
import { Radion } from "@radion-app/sdk";

const radion = new Radion({ apiKey: process.env.RADION_API_KEY });
await radion.realtime.connect();
radion.realtime.subscribe({ id: "trades", channel: "trades" });
radion.realtime.on("trades", (event) => console.log(event.data));
```

## Features

- **Unified client** — `new Radion({ apiKey })` is the single entry point for every product surface
- **Auto-reconnect** — exponential backoff with jitter; stops on graceful shutdown
- **Subscription restore** — active channels are re-subscribed after every reconnect
- **Heartbeats** — ping/pong keep-alive that detects stale connections and reconnects
- **Typed end-to-end** — channel names, inbound/outbound frames, and errors
- **Tiny** — single dependency (`ws`), ESM + CJS, ships its own type definitions

## Requirements

- Node.js >= 18

## Install

```bash
pnpm add @radion-app/sdk
# or: npm install @radion-app/sdk / yarn add @radion-app/sdk
```

## Quick start

```ts
import { Radion } from "@radion-app/sdk";

const radion = new Radion({
  apiKey: process.env.RADION_API_KEY,
});

await radion.realtime.connect();

radion.realtime.subscribe({ id: "trades", channel: "trades" });

radion.realtime.on("trades", (event) => {
  console.log(event.channel, event.data);
});
```

## Usage

### Configuration

```ts
new Radion(options);
```

| Option     | Type              | Default                   | Description                                           |
| ---------- | ----------------- | ------------------------- | ----------------------------------------------------- |
| `apiKey`   | `string`          | —                         | **Required.** Sent as the `X-API-Key` header.         |
| `baseUrl`  | `string`          | `https://api.radion.app`  | Base URL for the Radion API.                          |
| `wsUrl`    | `string`          | `wss://api.radion.app/ws` | Override the realtime endpoint.                       |
| `realtime` | `RealtimeOptions` | enabled                   | Reconnect / heartbeat tuning for the realtime client. |

### Realtime client

`radion.realtime` is a `RealtimeClient`. It can also be imported and
constructed standalone:

```ts
import { RealtimeClient } from "@radion-app/sdk";

const client = new RealtimeClient({ apiKey: process.env.RADION_API_KEY });
```

| Method                       | Description                                                        |
| ---------------------------- | ------------------------------------------------------------------ |
| `connect()`                  | Open the connection. Resolves once established.                    |
| `subscribe(subscription)`    | Subscribe with `{ id, channel, filters? }`. Replayed on reconnect. |
| `unsubscribe(id)`            | Unsubscribe by subscription id.                                    |
| `on("event" \| channel, fn)` | Register a handler for all events / one channel. Chainable.        |
| `on(lifecycleEvent, fn)`     | Register a lifecycle handler (`open`/`close`/`reconnect`/`error`). |
| `off(target, fn?)`           | Remove a handler (or all for that target). Chainable.              |
| `close(code?, reason?)`      | Graceful shutdown. Stops reconnect attempts.                       |
| `connected`                  | Getter — whether the socket is currently open.                     |

### Subscriptions & filters

A subscription is `{ id, channel, filters? }`. The `id` is your own string,
echoed back on every event so you can tell subscriptions apart; `channel` may
carry a `mempool.` prefix. Some channels require a filter:

```ts
radion.realtime.subscribe({
  id: "whales",
  channel: "large_trades",
  filters: { min_usd: 10_000 },
});
radion.realtime.subscribe({
  id: "watch",
  channel: "wallets",
  filters: { wallets: ["0x…"] },
});

// `event` fires for every channel; the event carries id + channel + data.
radion.realtime.on("event", (e) => console.log(e.id, e.channel, e.data));
```

### Channels

```
global · trades · activity · lifecycle · oracle · collateral
combos · prices · wallets · markets · large_trades
```

Available at runtime as `CHANNELS` and at the type level as `Channel`.

```ts
import { CHANNELS, type Channel } from "@radion-app/sdk";

for (const channel of CHANNELS) {
  radion.realtime.subscribe({ id: channel, channel });
}
```

### Lifecycle events

```ts
radion.realtime.on("open", () => console.log("connected"));
radion.realtime.on("close", ({ code, reason }) =>
  console.log("closed", code, reason)
);
radion.realtime.on("reconnect", ({ attempt, delayMs }) =>
  console.log(`reconnect #${attempt} in ${delayMs}ms`)
);
radion.realtime.on("error", (err) => console.error(err));
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
import { RadionConnectionError, RadionServerError } from "@radion-app/sdk";

radion.realtime.on("error", (err) => {
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
