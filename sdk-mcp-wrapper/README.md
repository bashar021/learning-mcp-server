# Weather Server + MCP Wrapper

Two pieces in one small TypeScript app:

1. **A weather REST API** (Express) with 5 endpoints, backed by the free
   [Open-Meteo](https://open-meteo.com) API — **no API key required**.
2. **An MCP server** that is a *hand-written wrapper over that REST API* — each MCP tool
   calls one REST endpoint. This is approach #1 from
   [`../docs/mcp-server-creation-approaches.md`](../docs/mcp-server-creation-approaches.md).

## How it fits together

```text
Claude / MCP client
      │  (MCP, stdio)
      ▼
MCP server  (src/mcp-server.ts)   ← 5 tools, input validation, descriptions
      │  (HTTP via src/api-client.ts)
      ▼
Weather REST API  (src/index.ts)  ← 5 endpoints, response formatting
      │  (HTTP)
      ▼
Open-Meteo API (free, no key)
```

The MCP server does **not** talk to Open-Meteo directly — it reuses the REST API you already
built. That is exactly what "wrapper over your existing API" means.

## The 5 REST endpoints

| Method & path | What it does | Query params |
| --- | --- | --- |
| `GET /geocode` | Place name → coordinates | `city` (required), `count?` |
| `GET /current` | Current conditions | `lat`, `lon` (required), `unit?` |
| `GET /forecast/daily` | Up to 16-day forecast | `lat`, `lon` (required), `days?`, `unit?` |
| `GET /forecast/hourly` | Next N hours (max 48) | `lat`, `lon` (required), `hours?`, `unit?` |
| `GET /air-quality` | Current AQI + pollutants | `lat`, `lon` (required) |

## The 6 MCP tools

Five map one-to-one to a REST endpoint; `get_weather_by_city` is a convenience tool that chains
two endpoints so the model needs only one call.

| MCP tool | Calls endpoint(s) |
| --- | --- |
| `geocode_location` | `GET /geocode` |
| `get_weather_by_city` | `GET /geocode` → `GET /current` |
| `get_current_weather` | `GET /current` |
| `get_daily_forecast` | `GET /forecast/daily` |
| `get_hourly_forecast` | `GET /forecast/hourly` |
| `get_air_quality` | `GET /air-quality` |

Every tool is declared with:

- an **input schema** (zod) — validated before any HTTP call,
- an **output schema** — so clients receive typed `structuredContent`, not just text, and
- **annotations** (`readOnlyHint`, `openWorldHint`) — so clients know the tool only reads data.

Requests to the REST API **time out after 10s** (`WEATHER_API_TIMEOUT_MS`) so a tool call can
never hang.

## Setup

```bash
npm install
npm run build
```

## Run

The MCP server needs the REST API running first.

```bash
# Terminal 1 — the existing REST API
npm start            # → http://localhost:3000

# Terminal 2 — the MCP wrapper (talks to the REST API over HTTP)
npm run mcp          # runs the built MCP server over stdio
# or, from source without building:
npm run mcp:dev
```

Point the MCP server at a different API with `WEATHER_API_BASE=http://host:port npm run mcp`.

## Use with Claude Desktop

Build first (`npm run build`), start the REST API (`npm start`), then add to
`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "weather": {
      "command": "node",
      "args": ["/Users/basharalam/Desktop/my-apps/learning-mcp-server/sdk-mcp-wrapper/dist/mcp-server.js"],
      "env": { "WEATHER_API_BASE": "http://localhost:3000" }
    }
  }
}
```

## Try the REST API directly

```bash
curl "http://localhost:3000/geocode?city=Mumbai&count=1"
curl "http://localhost:3000/current?lat=19.07&lon=72.88"
curl "http://localhost:3000/air-quality?lat=19.07&lon=72.88"
```

## Project layout

```text
sdk-mcp-wrapper/
├── src/
│   ├── index.ts        # Weather REST API (Express) — the existing API
│   ├── open-meteo.ts   # Open-Meteo client used by the REST API
│   ├── mcp-server.ts   # MCP server — the hand-written wrapper (5 tools)
│   └── api-client.ts   # Tiny HTTP client the MCP server uses to call the REST API
├── package.json
├── tsconfig.json
└── README.md
```

## Usage logs

Both the REST API and the MCP server log every call. Each event is written twice:

- **live to `stderr`/console** (so it also shows up in Claude Desktop's MCP logs), and
- **appended to `logs/usage.log`** as one JSON object per line (JSON Lines).

A single `get_weather_by_city` call produces a full trace:

```json
{"ts":"…","source":"rest-api","method":"GET","path":"/geocode","status":200,"ms":743}
{"ts":"…","source":"rest-api","method":"GET","path":"/current","status":200,"ms":546}
{"ts":"…","source":"mcp","tool":"get_weather_by_city","ok":true,"ms":1314,"args":{"city":"Paris","unit":"celsius"}}
```

Handy queries:

```bash
tail -f logs/usage.log                                  # watch calls live
grep '"source":"mcp"' logs/usage.log                    # only MCP tool calls
cat logs/usage.log | jq 'select(.source=="mcp") | .tool' # which tools, needs jq
```

The log file is git-ignored.

## Notes

- Transport is **stdio** — MCP server logs go to `stderr`, since `stdout` carries the protocol.
- Tool inputs are validated with [`zod`](https://zod.dev) before any HTTP call.
- If the REST API is down, tools return a clear MCP error telling you to start it, rather than crashing.
