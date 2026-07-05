# @radion-app/sdk

[![npm version](https://img.shields.io/npm/v/@radion-app/sdk.svg)](https://www.npmjs.com/package/@radion-app/sdk)
[![license](https://img.shields.io/npm/l/@radion-app/sdk.svg)](./LICENSE)

Official, fully-typed SDK for the [Radion](https://radion.app) platform.

One client, one API key, every Radion product surface.

```ts
import { Radion } from "@radion-app/sdk";

const radion = new Radion({ apiKey: process.env.RADION_API_KEY });
await radion.realtime.connect();
radion.realtime.subscribe({ id: "trading", channel: "trading" });
radion.realtime.onChannel("trading", (event) => console.log(event.data));
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

radion.realtime.subscribe({ id: "trading", channel: "trading" });

radion.realtime.onChannel("trading", (event) => {
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

### REST client

The REST surface is generated from the public OpenAPI schema and grouped by
resource: `markets`, `traders`, `events`, `search`, `orderBook`, `health`, and
`auth`. Every call uses the shared API key and base URL.

```ts
const radion = new Radion({ apiKey: process.env.RADION_API_KEY });

const { data } = await radion.markets.listMarkets({ query: { limit: 10 } });

const pnl = await radion.traders.getTraderPnl({
  path: { trader_id: "0x..." },
});
```

Each call returns `{ data, error, response }`. The payload is wrapped in a
`data` field.

### Realtime client

`radion.realtime` is a `RealtimeClient`. It can also be imported and
constructed standalone:

```ts
import { RealtimeClient } from "@radion-app/sdk";

const client = new RealtimeClient({ apiKey: process.env.RADION_API_KEY });
```

| Method                     | Description                                                        |
| -------------------------- | ------------------------------------------------------------------ |
| `connect()`                | Open the connection. Resolves once established.                    |
| `subscribe(subscription)`  | Subscribe with `{ id, channel, filters? }`. Replayed on reconnect. |
| `unsubscribe(id)`          | Unsubscribe by subscription id.                                    |
| `onChannel(channel, fn)`   | Handle events on one channel; `event.data` is narrowed. Chainable. |
| `onAnyChannel(fn)`         | Handle every channel event (id + channel + data). Chainable.       |
| `onLifecycle(event, fn)`   | Handle a lifecycle event (`open`/`close`/`reconnect`/`error`).     |
| `offChannel(channel, fn?)` | Remove a channel handler (or all for the channel). Chainable.      |
| `offAnyChannel(fn?)`       | Remove an all-channel handler (or all). Chainable.                 |
| `offLifecycle(event, fn?)` | Remove a lifecycle handler (or all for the event). Chainable.      |
| `close(code?, reason?)`    | Graceful shutdown. Stops reconnect attempts.                       |
| `connected`                | Getter — whether the socket is currently open.                     |

### Subscriptions & filters

A subscription is `{ id, channel, filters? }`. The `id` is your own string,
echoed back on every event so you can tell subscriptions apart; `channel` may
carry a `mempool.` prefix. Some channels require a filter (`wallets` needs
`wallets`; `markets` needs `market_ids` or `token_ids`), while `trading`
accepts `wallets`, `market_ids`, `token_ids`, and `min_usd` optionally:

```ts
radion.realtime.subscribe({
  id: "whales",
  channel: "trading",
  filters: { min_usd: 10_000 },
});
radion.realtime.subscribe({
  id: "watch",
  channel: "wallets",
  filters: { wallets: ["0x…"] },
});

// onAnyChannel fires for every channel; the event carries id + channel + data.
radion.realtime.onAnyChannel((e) => console.log(e.id, e.channel, e.data));
```

### Channels

Nine topic channels — every decoded event routes to exactly one:

```
trading · fees · oracle · resolution · lifecycle
positions · combos · transfers · accounts
```

Plus two cross-cutting filter channels that apply across all topics and
require a filter:

```
wallets · markets
```

Every channel also has a `mempool.`-prefixed companion (for example
`mempool.trading`) emitting speculative pending transactions before block
inclusion. Available at runtime as `CHANNELS` and at the type level as
`Channel`.

```ts
import { CHANNELS, type Channel } from "@radion-app/sdk";

for (const channel of CHANNELS) {
  radion.realtime.subscribe({ id: channel, channel });
}
```

### CLOB channels

A separate CLOB channel family is also subscribable:

```
clob.book · clob.prices · clob.last_trade
clob.midpoint · clob.tick_size · clob.best_bid_ask
```

Each CLOB channel **requires** a `token_ids` filter and has **no** `mempool.`
companion. Unlike topic channels, a CLOB `event.data` is a single fixed shape
with no `type` discriminator. Available at runtime as `CLOB_CHANNELS` and at the
type level as `ClobChannel`.

```ts
radion.realtime.subscribe({
  id: "book",
  channel: "clob.prices",
  filters: { token_ids: ["123…"] },
});
radion.realtime.onChannel("clob.prices", (event) => {
  // event.data narrows to the clob.prices payload
  console.log(event.data.market, event.data.changes);
});
```

### Lifecycle events

```ts
radion.realtime.onLifecycle("open", () => console.log("connected"));
radion.realtime.onLifecycle("close", ({ code, reason }) =>
  console.log("closed", code, reason)
);
radion.realtime.onLifecycle("reconnect", ({ attempt, delayMs }) =>
  console.log(`reconnect #${attempt} in ${delayMs}ms`)
);
radion.realtime.onLifecycle("error", (err) => console.error(err));
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

radion.realtime.onLifecycle("error", (err) => {
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
