#!/usr/bin/env node
/**
 * Weather MCP Server  (hand-written wrapper over our existing REST API)
 * ---------------------------------------------------------------------
 * Each MCP tool calls one endpoint of the weather REST API (see index.ts)
 * through the small client in api-client.ts. The MCP layer adds the tool
 * names, descriptions, input/output schemas, and annotations that an AI
 * model (and its client) need; the REST API keeps doing the actual work.
 *
 * Transport: stdio (works with Claude Desktop, etc.)
 * Prerequisite: the REST API must be running first ->  npm start
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { apiGet } from "./api-client.js";
import { logEvent } from "./logger.js";

const server = new McpServer({ name: "weather-mcp-server", version: "1.0.0" });

// ---- Shared input pieces ---------------------------------------------------
const latitude = z.number().min(-90).max(90).describe("Latitude in decimal degrees");
const longitude = z.number().min(-180).max(180).describe("Longitude in decimal degrees");
const unit = z
  .enum(["celsius", "fahrenheit"])
  .default("celsius")
  .describe("Temperature unit for the response");

// ---- Shared output pieces --------------------------------------------------
const locationShape = z.object({
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string().optional(),
});
const placeShape = z.object({
  name: z.string(),
  region: z.string().optional(),
  country: z.string().optional(),
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string().optional(),
});

// Every weather tool is read-only and reaches an external data source.
const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;

/** Build a tool result carrying BOTH human-readable text and structured data. */
function result(data: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

/** Build an error result (no structuredContent required on the error path). */
function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { isError: true, content: [{ type: "text" as const, text: `Error: ${message}` }] };
}

/**
 * Register a tool AND log every call to it (name, args, ok/error, duration).
 * Same signature as server.registerTool — it just wraps the handler.
 */
function registerWeatherTool(
  name: string,
  config: any,
  handler: (args: any) => Promise<any>,
) {
  server.registerTool(name, config as any, async (args: any) => {
    const start = Date.now();
    try {
      const res = await handler(args);
      logEvent({ source: "mcp", tool: name, ok: res?.isError !== true, ms: Date.now() - start, args });
      return res;
    } catch (err) {
      logEvent({ source: "mcp", tool: name, ok: false, ms: Date.now() - start, args, error: String(err) });
      return fail(err);
    }
  });
}

// ---------------------------------------------------------------------------
// 1. geocode_location  ->  GET /geocode
// ---------------------------------------------------------------------------
registerWeatherTool(
  "geocode_location",
  {
    title: "Geocode a place name",
    description:
      "Find the latitude/longitude of a place by name. Use this when you only have a city name and need coordinates for the other tools.",
    inputSchema: {
      city: z.string().min(1).describe("City or place name, e.g. 'Berlin' or 'Mumbai'"),
      count: z.number().int().min(1).max(10).default(5).describe("Max number of matches"),
    },
    outputSchema: { query: z.string(), matches: z.array(placeShape) },
    annotations: READ_ONLY,
  },
  async ({ city, count }) => {
    try {
      const data = (await apiGet("/geocode", { city, count })) as Record<string, unknown>;
      return result(data);
    } catch (err) {
      return fail(err);
    }
  },
);

// ---------------------------------------------------------------------------
// 2. get_weather_by_city  ->  GET /geocode + GET /current  (convenience)
// ---------------------------------------------------------------------------
registerWeatherTool(
  "get_weather_by_city",
  {
    title: "Current weather by city name",
    description:
      "Get the current weather for a city in ONE call. Geocodes the name internally, then returns the weather. Prefer this over calling geocode_location + get_current_weather separately.",
    inputSchema: {
      city: z.string().min(1).describe("City or place name, e.g. 'Tokyo'"),
      unit,
    },
    outputSchema: {
      resolvedLocation: placeShape,
      observedAt: z.string().optional(),
      conditions: z.string(),
      temperature: z.string(),
      feelsLike: z.string(),
      humidity: z.string(),
      precipitation: z.string(),
      wind: z.string(),
    },
    annotations: READ_ONLY,
  },
  async ({ city, unit }) => {
    try {
      const geo = (await apiGet("/geocode", { city, count: 1 })) as {
        matches?: Array<z.infer<typeof placeShape>>;
      };
      const place = geo.matches?.[0];
      if (!place) {
        return fail(new Error(`No location found for "${city}".`));
      }
      const w = (await apiGet("/current", {
        lat: place.latitude,
        lon: place.longitude,
        unit,
      })) as Record<string, any>;

      return result({
        resolvedLocation: place,
        observedAt: w.observedAt,
        conditions: w.conditions,
        temperature: w.temperature,
        feelsLike: w.feelsLike,
        humidity: w.humidity,
        precipitation: w.precipitation,
        wind: w.wind,
      });
    } catch (err) {
      return fail(err);
    }
  },
);

// ---------------------------------------------------------------------------
// 3. get_current_weather  ->  GET /current
// ---------------------------------------------------------------------------
registerWeatherTool(
  "get_current_weather",
  {
    title: "Current weather at coordinates",
    description: "Get the current weather conditions at the given coordinates.",
    inputSchema: { latitude, longitude, unit },
    outputSchema: {
      location: locationShape,
      observedAt: z.string().optional(),
      conditions: z.string(),
      temperature: z.string(),
      feelsLike: z.string(),
      humidity: z.string(),
      precipitation: z.string(),
      wind: z.string(),
    },
    annotations: READ_ONLY,
  },
  async ({ latitude, longitude, unit }) => {
    try {
      const data = (await apiGet("/current", {
        lat: latitude,
        lon: longitude,
        unit,
      })) as Record<string, unknown>;
      return result(data);
    } catch (err) {
      return fail(err);
    }
  },
);

// ---------------------------------------------------------------------------
// 4. get_daily_forecast  ->  GET /forecast/daily
// ---------------------------------------------------------------------------
registerWeatherTool(
  "get_daily_forecast",
  {
    title: "Daily forecast",
    description: "Get a daily weather forecast (up to 16 days) at the given coordinates.",
    inputSchema: {
      latitude,
      longitude,
      days: z.number().int().min(1).max(16).default(7).describe("Number of forecast days"),
      unit,
    },
    outputSchema: {
      location: locationShape,
      unit: z.string().optional(),
      forecast: z.array(
        z.object({
          date: z.string(),
          conditions: z.string(),
          high: z.number().nullable().optional(),
          low: z.number().nullable().optional(),
          precipitation: z.string(),
          precipitationChance: z.string(),
          maxWind: z.string(),
        }),
      ),
    },
    annotations: READ_ONLY,
  },
  async ({ latitude, longitude, days, unit }) => {
    try {
      const data = (await apiGet("/forecast/daily", {
        lat: latitude,
        lon: longitude,
        days,
        unit,
      })) as Record<string, unknown>;
      return result(data);
    } catch (err) {
      return fail(err);
    }
  },
);

// ---------------------------------------------------------------------------
// 5. get_hourly_forecast  ->  GET /forecast/hourly
// ---------------------------------------------------------------------------
registerWeatherTool(
  "get_hourly_forecast",
  {
    title: "Hourly forecast",
    description: "Get an hour-by-hour forecast for the next N hours at the given coordinates.",
    inputSchema: {
      latitude,
      longitude,
      hours: z.number().int().min(1).max(48).default(12).describe("Number of hours ahead"),
      unit,
    },
    outputSchema: {
      location: locationShape,
      unit: z.string().optional(),
      forecast: z.array(
        z.object({
          time: z.string(),
          temperature: z.number().nullable().optional(),
          conditions: z.string(),
          precipitationChance: z.string(),
          wind: z.string(),
        }),
      ),
    },
    annotations: READ_ONLY,
  },
  async ({ latitude, longitude, hours, unit }) => {
    try {
      const data = (await apiGet("/forecast/hourly", {
        lat: latitude,
        lon: longitude,
        hours,
        unit,
      })) as Record<string, unknown>;
      return result(data);
    } catch (err) {
      return fail(err);
    }
  },
);

// ---------------------------------------------------------------------------
// 6. get_air_quality  ->  GET /air-quality
// ---------------------------------------------------------------------------
registerWeatherTool(
  "get_air_quality",
  {
    title: "Air quality",
    description:
      "Get the current air quality (European & US AQI plus key pollutants) at the given coordinates.",
    inputSchema: { latitude, longitude },
    outputSchema: {
      location: locationShape,
      observedAt: z.string().optional(),
      europeanAqi: z.number().nullable().optional(),
      usAqi: z.number().nullable().optional(),
      pollutants: z.object({
        pm2_5: z.string(),
        pm10: z.string(),
        ozone: z.string(),
        nitrogenDioxide: z.string(),
      }),
    },
    annotations: READ_ONLY,
  },
  async ({ latitude, longitude }) => {
    try {
      const data = (await apiGet("/air-quality", {
        lat: latitude,
        lon: longitude,
      })) as Record<string, unknown>;
      return result(data);
    } catch (err) {
      return fail(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Boot the server over stdio.
// ---------------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("weather-mcp-server running on stdio (wrapping the REST API)");
}

main().catch((err) => {
  console.error("Fatal error starting weather-mcp-server:", err);
  process.exit(1);
});
