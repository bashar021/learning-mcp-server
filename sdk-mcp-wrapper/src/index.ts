/**
 * Weather Server
 * --------------
 * A small HTTP API with 5 endpoints, backed by the free Open-Meteo API
 * (no API key required).
 *
 * Endpoints:
 *   GET /geocode?city=Mumbai[&count=5]
 *   GET /current?lat=19.07&lon=72.88[&unit=celsius]
 *   GET /forecast/daily?lat=19.07&lon=72.88[&days=7&unit=celsius]
 *   GET /forecast/hourly?lat=19.07&lon=72.88[&hours=12&unit=celsius]
 *   GET /air-quality?lat=19.07&lon=72.88
 */

import express, { Request, Response } from "express";
import {
  geocode,
  currentWeather,
  dailyForecast,
  hourlyForecast,
  airQuality,
  describeWeatherCode,
} from "./open-meteo.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

/** Read a required number query param, or throw a 400-style error. */
function num(value: unknown, name: string): number {
  const n = Number(value);
  if (value === undefined || Number.isNaN(n)) {
    throw { status: 400, message: `Missing or invalid query param: ${name}` };
  }
  return n;
}

/** Wrap an async handler so thrown errors become clean JSON responses. */
function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    fn(req, res).catch((err) => {
      const status = err?.status ?? 500;
      res.status(status).json({ error: err?.message ?? "Internal server error" });
    });
  };
}

// 1. Geocode: place name -> coordinates
app.get(
  "/geocode",
  handle(async (req, res) => {
    const city = String(req.query.city ?? "").trim();
    if (!city) throw { status: 400, message: "Missing query param: city" };
    const count = Math.min(10, Math.max(1, Number(req.query.count) || 5));

    const results = await geocode(city, count);
    res.json({
      query: city,
      matches: results.map((r) => ({
        name: r.name,
        region: r.admin1,
        country: r.country,
        latitude: r.latitude,
        longitude: r.longitude,
        timezone: r.timezone,
      })),
    });
  }),
);

// 2. Current weather
app.get(
  "/current",
  handle(async (req, res) => {
    const lat = num(req.query.lat, "lat");
    const lon = num(req.query.lon, "lon");
    const unit = req.query.unit === "fahrenheit" ? "fahrenheit" : "celsius";

    const data = await currentWeather(lat, lon, unit);
    const c = data.current ?? {};
    res.json({
      location: { latitude: data.latitude, longitude: data.longitude, timezone: data.timezone },
      observedAt: c.time,
      conditions: describeWeatherCode(c.weather_code),
      temperature: `${c.temperature_2m}${data.current_units?.temperature_2m ?? ""}`,
      feelsLike: `${c.apparent_temperature}${data.current_units?.apparent_temperature ?? ""}`,
      humidity: `${c.relative_humidity_2m}%`,
      precipitation: `${c.precipitation} mm`,
      wind: `${c.wind_speed_10m} km/h @ ${c.wind_direction_10m}°`,
    });
  }),
);

// 3. Daily forecast
app.get(
  "/forecast/daily",
  handle(async (req, res) => {
    const lat = num(req.query.lat, "lat");
    const lon = num(req.query.lon, "lon");
    const days = Math.min(16, Math.max(1, Number(req.query.days) || 7));
    const unit = req.query.unit === "fahrenheit" ? "fahrenheit" : "celsius";

    const data = await dailyForecast(lat, lon, days, unit);
    const d = data.daily ?? {};
    res.json({
      location: { latitude: data.latitude, longitude: data.longitude, timezone: data.timezone },
      unit: data.daily_units?.temperature_2m_max,
      forecast: (d.time ?? []).map((date: string, i: number) => ({
        date,
        conditions: describeWeatherCode(d.weather_code?.[i]),
        high: d.temperature_2m_max?.[i],
        low: d.temperature_2m_min?.[i],
        precipitation: `${d.precipitation_sum?.[i] ?? 0} mm`,
        precipitationChance: `${d.precipitation_probability_max?.[i] ?? 0}%`,
        maxWind: `${d.wind_speed_10m_max?.[i] ?? 0} km/h`,
      })),
    });
  }),
);

// 4. Hourly forecast
app.get(
  "/forecast/hourly",
  handle(async (req, res) => {
    const lat = num(req.query.lat, "lat");
    const lon = num(req.query.lon, "lon");
    const hours = Math.min(48, Math.max(1, Number(req.query.hours) || 12));
    const unit = req.query.unit === "fahrenheit" ? "fahrenheit" : "celsius";

    const data = await hourlyForecast(lat, lon, hours, unit);
    const h = data.hourly ?? {};
    const times: string[] = h.time ?? [];

    const now = Date.now();
    const upcoming = times
      .map((time, i) => ({ time, i }))
      .filter(({ time }) => new Date(time).getTime() >= now)
      .slice(0, hours);

    res.json({
      location: { latitude: data.latitude, longitude: data.longitude, timezone: data.timezone },
      unit: data.hourly_units?.temperature_2m,
      forecast: upcoming.map(({ time, i }) => ({
        time,
        temperature: h.temperature_2m?.[i],
        conditions: describeWeatherCode(h.weather_code?.[i]),
        precipitationChance: `${h.precipitation_probability?.[i] ?? 0}%`,
        wind: `${h.wind_speed_10m?.[i] ?? 0} km/h`,
      })),
    });
  }),
);

// 5. Air quality
app.get(
  "/air-quality",
  handle(async (req, res) => {
    const lat = num(req.query.lat, "lat");
    const lon = num(req.query.lon, "lon");

    const data = await airQuality(lat, lon);
    const c = data.current ?? {};
    res.json({
      location: { latitude: data.latitude, longitude: data.longitude, timezone: data.timezone },
      observedAt: c.time,
      europeanAqi: c.european_aqi,
      usAqi: c.us_aqi,
      pollutants: {
        pm2_5: `${c.pm2_5} µg/m³`,
        pm10: `${c.pm10} µg/m³`,
        ozone: `${c.ozone} µg/m³`,
        nitrogenDioxide: `${c.nitrogen_dioxide} µg/m³`,
      },
    });
  }),
);

app.listen(PORT, () => {
  console.log(`Weather server listening on http://localhost:${PORT}`);
});
