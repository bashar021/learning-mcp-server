/**
 * Tiny usage logger shared by the REST API and the MCP server.
 *
 * Every event is written twice:
 *   1. to stderr  (so it shows live, and Claude Desktop captures it in its MCP logs), and
 *   2. appended to  <project>/logs/usage.log  as one JSON object per line (JSON Lines),
 *      so you have a persistent, greppable history.
 *
 * stderr is used (not stdout) because the MCP server reserves stdout for the protocol.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// <project>/logs/usage.log  —  this file compiles to dist/, so go up one level.
const LOG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "logs");
const LOG_FILE = resolve(LOG_DIR, "usage.log");

let dirReady = false;
function ensureDir() {
  if (dirReady) return;
  try {
    mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    /* ignore — we still log to stderr below */
  }
  dirReady = true;
}

/** Record one usage event (a tool call, an HTTP request, etc.). */
export function logEvent(event: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...event });

  // 1. Live, on stderr.
  console.error(line);

  // 2. Persisted, in the log file.
  try {
    ensureDir();
    appendFileSync(LOG_FILE, line + "\n");
  } catch {
    /* if the file can't be written, the stderr line above is still there */
  }
}

export const USAGE_LOG_PATH = LOG_FILE;
