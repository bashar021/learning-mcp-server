/**
 * Thin client over the free Open-Meteo API (no API key required).
 * Docs: https://open-meteo.com/en/docs
 */

const FORECAST_BASE = "https://api.open-meteo.com/v1/forecast";
const GEOCODE_BASE = "https://geocoding-api.open-meteo.com/v1/search";
const AIR_QUALITY_BASE = "https://air-quality-api.open-meteo.com/v1/air-quality";

/** WMO weather interpretation codes -> human-readable text. */
const WEATHER_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snowfall",
  73: "Moderate snowfall",
  75: "Heavy snowfall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

export function describeWeatherCode(code: number): string {
  return WEATHER_CODES[code] ?? `Unknown (code ${code})`;
}

/** GET a URL built from a base + query params, returning parsed JSON. */
async function getJson<T>(base: string, params: Record<string, string | number>): Promise<T> {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const res = await fetch(url, {
    headers: { "User-Agent": "weather-mcp-server/1.0 (learning project)" },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Open-Meteo request failed: ${res.status} ${res.statusText} ${body}`.trim());
  }

  return (await res.json()) as T;
}

export interface GeocodeResult {
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  population?: number;
}

export async function geocode(name: string, count: number): Promise<GeocodeResult[]> {
  const data = await getJson<{ results?: GeocodeResult[] }>(GEOCODE_BASE, {
    name,
    count,
    language: "en",
    format: "json",
  });
  return data.results ?? [];
}

export async function currentWeather(
  latitude: number,
  longitude: number,
  temperatureUnit: string,
): Promise<any> {
  return getJson(FORECAST_BASE, {
    latitude,
    longitude,
    temperature_unit: temperatureUnit,
    wind_speed_unit: "kmh",
    current:
      "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m",
    timezone: "auto",
  });
}

export async function dailyForecast(
  latitude: number,
  longitude: number,
  days: number,
  temperatureUnit: string,
): Promise<any> {
  return getJson(FORECAST_BASE, {
    latitude,
    longitude,
    forecast_days: days,
    temperature_unit: temperatureUnit,
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max",
    timezone: "auto",
  });
}

export async function hourlyForecast(
  latitude: number,
  longitude: number,
  hours: number,
  temperatureUnit: string,
): Promise<any> {
  // Open-Meteo returns full days; request enough days to cover the hours, then slice.
  const forecastDays = Math.min(16, Math.ceil(hours / 24) + 1);
  return getJson(FORECAST_BASE, {
    latitude,
    longitude,
    forecast_days: forecastDays,
    temperature_unit: temperatureUnit,
    hourly: "temperature_2m,precipitation_probability,weather_code,wind_speed_10m",
    timezone: "auto",
  });
}

export async function airQuality(latitude: number, longitude: number): Promise<any> {
  return getJson(AIR_QUALITY_BASE, {
    latitude,
    longitude,
    current: "european_aqi,us_aqi,pm10,pm2_5,ozone,nitrogen_dioxide",
    timezone: "auto",
  });
}
