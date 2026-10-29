import { z } from 'zod';
import { AppError } from '../../utils/AppError.js';
const locationsSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        country_code: z.string(),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      }),
    )
    .optional(),
});
const forecastSchema = z.object({
  current: z.object({
    temperature_2m: z.number(),
    apparent_temperature: z.number(),
    relative_humidity_2m: z.number().min(0).max(100),
    weather_code: z.number().int(),
    wind_speed_10m: z.number().nonnegative(),
  }),
});
const descriptions = new Map([
  [0, 'clear'],
  [1, 'mainly clear'],
  [2, 'partly cloudy'],
  [3, 'overcast'],
  [45, 'fog'],
  [48, 'depositing rime fog'],
  [51, 'light drizzle'],
  [53, 'moderate drizzle'],
  [55, 'dense drizzle'],
  [56, 'light freezing drizzle'],
  [57, 'dense freezing drizzle'],
  [61, 'slight rain'],
  [63, 'moderate rain'],
  [65, 'heavy rain'],
  [66, 'light freezing rain'],
  [67, 'heavy freezing rain'],
  [71, 'slight snow'],
  [73, 'moderate snow'],
  [75, 'heavy snow'],
  [77, 'snow grains'],
  [80, 'slight rain showers'],
  [81, 'moderate rain showers'],
  [82, 'violent rain showers'],
  [85, 'slight snow showers'],
  [86, 'heavy snow showers'],
  [95, 'thunderstorm'],
  [96, 'thunderstorm with slight hail'],
  [99, 'thunderstorm with heavy hail'],
]);
async function getJson(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Upstream failure');
  return response.json();
}
/** Resolve a city and return sanitized Open-Meteo current conditions within 5s total. */
export async function weather(city) {
  try {
    const signal = AbortSignal.timeout(5000);
    const locations = locationsSchema.parse(
      await getJson(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,
        signal,
      ),
    );
    const place = locations.results?.[0];
    if (!place) throw new AppError(404, 'NOT_FOUND', 'City not found');
    const data = forecastSchema.parse(
      await getJson(
        `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&temperature_unit=celsius&wind_speed_unit=ms`,
        signal,
      ),
    );
    return {
      city: place.name,
      country: place.country_code,
      temp: data.current.temperature_2m,
      feels_like: data.current.apparent_temperature,
      description: descriptions.get(data.current.weather_code) ?? 'unknown',
      humidity: data.current.relative_humidity_2m,
      wind: data.current.wind_speed_10m,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(502, 'UPSTREAM_ERROR', 'Weather service unavailable');
  }
}
