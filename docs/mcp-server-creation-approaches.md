# Ways to Create an MCP Server

There are several ways to build an MCP (Model Context Protocol) server over an existing
system. Each approach trades off control, speed, and coupling differently. Pick based on who
owns the underlying system, how much curation the tools need, and how fast you want a result.

## Quick comparison

| # | Approach | Best for | Main trade-off |
|---|----------|----------|----------------|
| 1 | Hand-written wrapper over your API | Production quality, full control | More upfront work |
| 2 | Auto-generated from OpenAPI/Swagger | Fast prototypes | Too many low-level tools |
| 3 | Embedded in the existing backend | Reusing app auth & logic | Coupled to app release cycle |
| 4 | Separate service / sidecar | Legacy or other-team systems | Extra deployable to run |
| 5 | Gateway or managed platform | Standardized cloud stacks | Vendor lock-in |
| 6 | Direct database access | Quick read-only data access | Bypasses business rules |

---

## 1. Hand-written wrapper over your existing API (most common)

You use an official SDK to write a small service that defines tools, and each tool calls your
existing REST or GraphQL backend. TypeScript and Python are the most mature SDKs. TypeScript
will likely feel natural given frontend work, and **FastMCP** is a popular Python option.

- **Pros:** Full control over naming, descriptions, and outputs. Usually produces the best results.
- **Cons:** Requires the most hands-on development.

## 2. Auto-generated from an OpenAPI/Swagger spec

Several tools can turn an OpenAPI spec into an MCP server almost instantly. Fast and useful for
a prototype.

- **Pros:** Near-instant server from an existing spec.
- **Cons:** Maps every endpoint to one tool, and models handle 80 low-level endpoints poorly.
  A common approach is to generate the server first, then curate and merge the tools by hand.

## 3. Embedded in the existing backend

Instead of running a separate service, you add an `/mcp` route to the existing app (Express,
NestJS, Django, Spring, and so on). It reuses the app's auth, models, and business logic directly.

- **Pros:** Reuses existing auth, models, and business logic.
- **Cons:** The MCP layer is now coupled to the app's release cycle.

## 4. Separate service or sidecar

The MCP server runs as its own deployable and talks to the system over its API. This keeps the
core system untouched.

- **Pros:** Core system stays untouched. Usually the safer choice when the system belongs to
  another team or is legacy code.
- **Cons:** One more service to deploy and operate.

## 5. Gateway or managed platform

Cloud providers and API-gateway products can expose existing APIs as MCP endpoints and handle
hosting and auth for you. For example, **Amazon Bedrock AgentCore** supports deploying MCP
servers on the new stateless spec without managing sessions or persistent connections.

- **Pros:** Hosting and auth handled for you. Good fit if your company already standardizes on
  one of these platforms.
- **Cons:** Ties you to a specific vendor or platform.

## 6. Direct database access

The server queries the database itself instead of going through the app.

- **Pros:** Quick to set up.
- **Cons:** Bypasses your business rules and permissions. Only do this **read-only, against a
  replica**, if you do it at all.

---

## How to choose

- **Want the best results and have time?** → Hand-written wrapper (1).
- **Need a prototype today?** → Generate from OpenAPI (2), then curate.
- **You own the backend and want shared auth?** → Embedded route (3).
- **System is legacy or owned by another team?** → Separate service / sidecar (4).
- **Already on a cloud platform that supports it?** → Gateway / managed (5).
- **Just need quick read access to data?** → Direct DB, read-only on a replica (6).
