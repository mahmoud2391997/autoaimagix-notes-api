import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
const upstreamSchema = z.object({
  name: z.string(),
  sys: z.object({ country: z.string() }),
  main: z.object({
    temp: z.number(),
    feels_like: z.number(),
    humidity: z.number(),
  }),
  weather: z.array(z.object({ description: z.string() })).min(1),
  wind: z.object({ speed: z.number() }),
});
/** Fetch and trim weather data; discard all upstream failure details. */
export async function weather(city) {
  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${encodeURIComponent(env.OPENWEATHER_API_KEY)}&units=metric`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (response.status === 404)
      throw new AppError(404, 'NOT_FOUND', 'City not found');
    if (!response.ok) throw new Error('Upstream failure');
    const data = upstreamSchema.parse(await response.json());
    return {
      city: data.name,
      country: data.sys.country,
      temp: data.main.temp,
      feels_like: data.main.feels_like,
      description: data.weather[0].description,
      humidity: data.main.humidity,
      wind: data.wind.speed,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(502, 'UPSTREAM_ERROR', 'Weather service unavailable');
  }
}
