# learning-mcp-server

A hands-on project for learning how to build **MCP (Model Context Protocol) servers**, using a
small weather app as the running example.

## What's inside

```text
learning-mcp-server/
├── docs/
│   ├── mcp-server-creation-approaches.md   # 6 ways to create an MCP server
│   ├── wrapper-mcp-explained.md            # deep-dive on the approach used here
│   └── connecting-mcp-to-llm.md            # steps to connect this server to any LLM
└── sdk-mcp-wrapper/                        # the weather app (REST API + MCP wrapper)
```

## The example app

[`sdk-mcp-wrapper/`](./sdk-mcp-wrapper) contains two pieces in TypeScript:

1. A **weather REST API** (Express, 5 endpoints) over the free Open-Meteo API — no API key.
2. A **hand-written MCP server** that wraps that REST API — each MCP tool calls one endpoint.

```text
Claude ──MCP──▶ MCP server ──HTTP──▶ Weather REST API ──HTTP──▶ Open-Meteo
```

See the app [README](./sdk-mcp-wrapper/README.md) to run it.

## Learning path

1. Read [docs/mcp-server-creation-approaches.md](./docs/mcp-server-creation-approaches.md) —
   understand the 6 ways to build an MCP server and their trade-offs.
2. Explore `sdk-mcp-wrapper/src/index.ts` — the plain REST API (the "existing API").
3. Read [docs/wrapper-mcp-explained.md](./docs/wrapper-mcp-explained.md) — how and why we wrap
   that API with MCP (approach #1).
4. Explore `sdk-mcp-wrapper/src/mcp-server.ts` — the MCP tools.
5. Read [docs/connecting-mcp-to-llm.md](./docs/connecting-mcp-to-llm.md) — connect the server to
   Claude Desktop, Claude Code, other MCP apps, or any LLM from your own code.
6. Run both, connect a client, and try it.

## Quick start

```bash
cd sdk-mcp-wrapper
npm install && npm run build
npm start      # terminal 1: REST API on http://localhost:3000
npm run mcp    # terminal 2: MCP server (stdio) wrapping the REST API
```
