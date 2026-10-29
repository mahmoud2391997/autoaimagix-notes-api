Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  JWT_SECRET: 'test-only-secret-with-at-least-32-characters',
  JWT_EXPIRES_IN: '1h',
  OPENWEATHER_API_KEY: 'test-weather-secret',
  CORS_ORIGINS: 'http://localhost:3000',
  UPSTASH_REDIS_REST_URL: '',
  UPSTASH_REDIS_REST_TOKEN: '',
});
