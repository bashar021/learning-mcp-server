/**
 * Thin client over OUR OWN weather REST API (the Express server in index.ts).
 *
 * This is the key idea of the "hand-written wrapper over your existing API"
 * approach: the MCP server does NOT talk to Open-Meteo directly. It calls the
 * REST endpoints we already built, reusing their formatting and validation.
 */

// Where the existing weather REST API is running.
const API_BASE = process.env.WEATHER_API_BASE ?? "http://localhost:3000";

// How long to wait for the REST API before giving up (ms).
const TIMEOUT_MS = Number(process.env.WEATHER_API_TIMEOUT_MS) || 10_000;

/** GET a path (with query params) on the weather REST API and return parsed JSON. */
export async function apiGet(
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<unknown> {
  const url = new URL(path, API_BASE);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  // Abort the request if it takes too long, so a tool call can never hang.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Weather API timed out after ${TIMEOUT_MS} ms (${API_BASE}).`);
    }
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not reach the weather API at ${API_BASE}. Is it running (npm start)? Details: ${reason}`,
    );
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = (data as { error?: string })?.error ?? `${res.status} ${res.statusText}`;
    throw new Error(`Weather API error: ${message}`);
  }

  return data;
}
