# Hand-Written Wrapper MCP Server — Explained

This is a learning walkthrough of the MCP server built in
[`../sdk-mcp-wrapper`](../sdk-mcp-wrapper). It uses **approach #1** from
[`mcp-server-creation-approaches.md`](./mcp-server-creation-approaches.md):
a hand-written wrapper over an existing API.

## 1. The core idea

We already have a weather **REST API** (the Express server). We do **not** rebuild its logic for
MCP. Instead we write a thin **MCP server** whose job is only to:

- expose a few well-named **tools** a model can understand, and
- translate each tool call into an HTTP call to the REST API.

```text
Model → MCP tool → HTTP → existing REST API → upstream data source
```

The REST API stays the single source of truth. If its logic changes, the MCP server mostly
doesn't need to.

## 2. Why wrap instead of talk to Open-Meteo directly?

| | Direct (MCP → Open-Meteo) | Wrapper (MCP → your REST API) |
| --- | --- | --- |
| Business rules | Duplicated in two places | Live in one place (the API) |
| Formatting / validation | Re-implemented for MCP | Reused from the API |
| Auth, rate limits, caching | Re-added for MCP | Already handled by the API |
| Keeping them in sync | Manual, error-prone | Automatic — one backend |

Wrapping is the common choice precisely because it avoids duplicating everything the API
already does.

## 3. The three building blocks

### a) The MCP server — `src/mcp-server.ts`

Creates a server and registers tools:

```ts
const server = new McpServer({ name: "weather-mcp-server", version: "1.0.0" });

server.tool(
  "get_current_weather",                       // name the model calls
  "Get the current weather at coordinates.",   // description that guides the model
  { latitude, longitude, unit },               // zod input schema (validated for you)
  async ({ latitude, longitude, unit }) => {   // handler
    return ok(await apiGet("/current", { lat: latitude, lon: longitude, unit }));
  },
);
```

Three things every tool defines: a **name**, a **description**, and an **input schema**. These
are what turn a plain HTTP endpoint into something a model can use reliably.

### b) The API client — `src/api-client.ts`

A small `fetch` wrapper that calls the REST API and turns failures into clear messages:

```ts
const API_BASE = process.env.WEATHER_API_BASE ?? "http://localhost:3000";
// apiGet("/current", { lat, lon }) → GET http://localhost:3000/current?lat=..&lon=..
```

This is the only place that knows *where* the REST API lives.

### c) The existing REST API — `src/index.ts`

Unchanged by the MCP work. It owns the real behavior: calling Open-Meteo, shaping the JSON,
validating query params.

## 4. Tool ↔ endpoint mapping

Each MCP tool is a thin face over exactly one endpoint:

| MCP tool | REST endpoint |
| --- | --- |
| `geocode_location` | `GET /geocode` |
| `get_current_weather` | `GET /current` |
| `get_daily_forecast` | `GET /forecast/daily` |
| `get_hourly_forecast` | `GET /forecast/hourly` |
| `get_air_quality` | `GET /air-quality` |

## 5. What makes a *good* wrapper (lessons)

- **Curate, don't mirror.** 5 clear tools beat 80 raw endpoints. Give tools task-level names
  (`get_current_weather`), not HTTP-level ones (`get_v1_forecast`).
- **Write descriptions for the model, not for humans.** The description is how the model decides
  when to call the tool. Say what it returns and when to use it.
- **Validate inputs at the edge.** `zod` schemas reject bad coordinates before any network call.
- **Fail loudly but safely.** Return an MCP error (`isError: true`) instead of crashing; tell the
  caller *how* to fix it (e.g. "start the REST API").
- **Keep one source of truth.** Let the API own the logic; the wrapper only translates.

## 6. Run it yourself

```bash
cd sdk-mcp-wrapper
npm install && npm run build

npm start      # terminal 1: the REST API (http://localhost:3000)
npm run mcp    # terminal 2: the MCP server (stdio), calling the REST API
```

Then connect it to Claude Desktop (see the app
[README](../sdk-mcp-wrapper/README.md#use-with-claude-desktop)) and ask for the weather in a
city — the model will call `geocode_location` first, then a forecast tool.

## 7. Improvements already built in

The server goes beyond a minimal wrapper:

- **`get_weather_by_city`** — a convenience tool that geocodes *and* fetches weather in one call,
  so the model doesn't need two round-trips.
- **Output schemas + `structuredContent`** — every tool declares what it returns, so clients get
  typed data, not just a JSON string to re-parse.
- **Tool annotations** — all tools are marked `readOnlyHint` / `openWorldHint` so clients know
  they only read external data.
- **Request timeouts** — the API client aborts after 10s (`WEATHER_API_TIMEOUT_MS`) so a tool
  call can never hang.

## 8. Where to go next

- Add auth: put an API key on the REST API and pass it from the client.
- Add caching in the REST API — every MCP tool benefits for free.
- Add an MCP **resource** (read-only data) or **prompt** alongside the tools.
- Add a test suite (e.g. `vitest`) that mocks the REST API.
- Deploy the MCP server as its own service (approach #4 in the approaches doc).
