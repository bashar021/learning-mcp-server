# Connecting This MCP Server to Any LLM

This guide shows how to connect the weather MCP server
([`../sdk-mcp-wrapper`](../sdk-mcp-wrapper)) to different LLM clients — from ready-made apps like
Claude Desktop to a fully custom "any LLM" integration in your own code.

> **How MCP reaches an LLM:** an MCP server never talks to a model directly. An **MCP client**
> (the app, or your own code) connects to the server, lists its tools, and hands those tools to
> the LLM. When the LLM decides to call a tool, the client runs it on the server and feeds the
> result back. So "connect MCP to an LLM" always means "point an MCP client at this server."

```text
LLM  ⇄  MCP client (app or your code)  ⇄  MCP server (this repo)  →  Weather REST API
```

---

## 0. Prerequisites (do this once)

```bash
cd sdk-mcp-wrapper
npm install
npm run build
```

This server is a **wrapper over a REST API**, so the REST API must be running whenever you use
the tools:

```bash
npm start          # starts the weather REST API on http://localhost:3000
```

Keep that running, then start the MCP server from whichever client below. The command the
clients run is:

```text
node /ABSOLUTE/PATH/TO/sdk-mcp-wrapper/dist/mcp-server.js
```

Your absolute path is:
`/Users/basharalam/Desktop/my-apps/learning-mcp-server/sdk-mcp-wrapper/dist/mcp-server.js`

---

## 1. Test it first with the MCP Inspector (no LLM needed)

The fastest way to confirm the server works before wiring an LLM:

```bash
cd sdk-mcp-wrapper
npx @modelcontextprotocol/inspector node dist/mcp-server.js
```

It opens a web UI where you can list the tools and call them by hand.

---

## 2. Claude Desktop

Edit `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "weather": {
      "command": "node",
      "args": [
        "/Users/basharalam/Desktop/my-apps/learning-mcp-server/sdk-mcp-wrapper/dist/mcp-server.js"
      ],
      "env": { "WEATHER_API_BASE": "http://localhost:3000" }
    }
  }
}
```

Save, restart Claude Desktop, and ask: *"What's the weather in Mumbai?"* — the model will call
`get_weather_by_city`.

---

## 3. Claude Code (CLI)

```bash
claude mcp add weather \
  --env WEATHER_API_BASE=http://localhost:3000 \
  -- node /Users/basharalam/Desktop/my-apps/learning-mcp-server/sdk-mcp-wrapper/dist/mcp-server.js
```

Check it with `claude mcp list`, then ask about the weather in a chat.

---

## 4. Other MCP-aware apps (Cursor, VS Code, Windsurf, etc.)

Most MCP-aware editors use the **same JSON shape** as Claude Desktop, usually in a file named
`mcp.json` (or an "MCP Servers" settings panel). Use the exact same `command` / `args` / `env`:

```json
{
  "mcpServers": {
    "weather": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/.../dist/mcp-server.js"],
      "env": { "WEATHER_API_BASE": "http://localhost:3000" }
    }
  }
}
```

The transport here is **stdio**: the client launches the command as a subprocess and talks to it
over stdin/stdout. That is why every client just needs the command to run.

---

## 5. Any LLM, from your own code (the general pattern)

If your LLM is not in an MCP-aware app (e.g. you call the OpenAI, Anthropic, Gemini, or a local
Ollama API yourself), you write a small MCP client and bridge the tools into that LLM's
tool/function-calling format. The loop is always the same:

1. **Connect** to the MCP server and **list its tools**.
2. **Convert** each tool's `inputSchema` into the LLM's tool/function schema.
3. **Send** the user's message + the tool list to the LLM.
4. If the LLM **requests a tool call**, run it on the MCP server.
5. **Return** the tool result to the LLM and repeat until it produces a final answer.

### Minimal MCP client (TypeScript)

Install the SDK in your client project: `npm i @modelcontextprotocol/sdk`

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// 1. Launch + connect to the MCP server over stdio.
const transport = new StdioClientTransport({
  command: "node",
  args: ["/ABSOLUTE/PATH/.../dist/mcp-server.js"],
  env: { WEATHER_API_BASE: "http://localhost:3000" },
});

const mcp = new Client({ name: "my-llm-app", version: "1.0.0" });
await mcp.connect(transport);

// 2. Discover the tools.
const { tools } = await mcp.listTools();
// Each tool has: name, description, inputSchema (JSON Schema).

// 3. Convert to your LLM's tool format. Example for the Anthropic API:
const anthropicTools = tools.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.inputSchema, // already JSON Schema — usually a direct match
}));

// 4. When the LLM asks to call a tool named `name` with `args`, run it:
async function runTool(name: string, args: Record<string, unknown>) {
  const res = await mcp.callTool({ name, arguments: args });
  // res.structuredContent is the typed data; res.content[0].text is the text form.
  return res.structuredContent ?? res.content;
}
```

> The OpenAI, Gemini, and Ollama tool schemas differ only slightly in field names
> (`parameters` vs `input_schema`, etc.). The `inputSchema` is standard JSON Schema, so the
> conversion is mostly renaming the wrapper fields.

### The tool-calling loop (pseudocode, works for any LLM)

```text
messages = [user_question]
loop:
    response = LLM.chat(messages, tools = convertedTools)
    if response wants to call tool(name, args):
        result = runTool(name, args)          # ← calls the MCP server
        messages += [assistant tool_call, tool result]
        continue
    else:
        return response.text                  # final answer
```

That is the entire bridge: **list tools → give them to the LLM → execute requested calls on the
MCP server → feed results back.**

---

## 6. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Tools error with "Could not reach the weather API" | REST API not running | `npm start` in `sdk-mcp-wrapper` |
| Client shows no tools | Wrong path, or not built | `npm run build`; use the absolute path to `dist/mcp-server.js` |
| "command not found: node" in a GUI app | App can't see your `node` | Use an absolute path to `node`, or the one from `which node` |
| Tool call hangs then errors after 10s | REST API or upstream slow | Expected timeout; retry, or raise `WEATHER_API_TIMEOUT_MS` |
| Changes not picked up | Running stale build | Rebuild (`npm run build`) and restart the client |

---

## 7. Summary

- Any MCP-aware **app** → drop the same `command` / `args` / `env` JSON into its config.
- Any **LLM in your own code** → write a small MCP client, list the tools, convert them to that
  LLM's tool format, and run a tool-calling loop.
- Always start the **REST API first** (`npm start`) — this server wraps it.
