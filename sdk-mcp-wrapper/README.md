# Weather Server

A small weather HTTP server in TypeScript (Express) with **5 API endpoints**, backed by the free
[Open-Meteo](https://open-meteo.com) API — **no API key required**.

## Endpoints (5)

| Method & path | What it does | Query params |
|---------------|--------------|--------------|
| `GET /geocode` | Place name → coordinates | `city` (required), `count?` (1–10, default 5) |
| `GET /current` | Current conditions | `lat`, `lon` (required), `unit?` (celsius/fahrenheit) |
| `GET /forecast/daily` | Up to 16-day forecast | `lat`, `lon` (required), `days?` (1–16), `unit?` |
| `GET /forecast/hourly` | Next N hours (max 48) | `lat`, `lon` (required), `hours?` (1–48), `unit?` |
| `GET /air-quality` | Current AQI + pollutants | `lat`, `lon` (required) |

> Typical flow: call `/geocode` with a city name, then pass the returned `latitude`/`longitude`
> into the other endpoints.

## Setup

```bash
npm install
npm run build
```

## Run

```bash
npm start     # run the compiled server (dist/index.js)
npm run dev   # run from TypeScript source with auto-reload (tsx watch)
```

Server listens on `http://localhost:3000` (override with `PORT=4000 npm start`).

## Examples

```bash
curl "http://localhost:3000/geocode?city=Mumbai&count=1"
curl "http://localhost:3000/current?lat=19.07&lon=72.88"
curl "http://localhost:3000/forecast/daily?lat=19.07&lon=72.88&days=5"
curl "http://localhost:3000/forecast/hourly?lat=19.07&lon=72.88&hours=6"
curl "http://localhost:3000/air-quality?lat=19.07&lon=72.88"
```

## Project layout

```text
sdk-mcp-wrapper/
├── src/
│   ├── index.ts        # Express server + the 5 endpoints
│   └── open-meteo.ts   # Open-Meteo API client + weather-code descriptions
├── package.json
├── tsconfig.json
└── README.md
```

## Notes

- Missing/invalid query params return a `400` with a JSON `{ "error": ... }` body.
- Upstream API failures return a `500` with a JSON error message instead of crashing the server.
