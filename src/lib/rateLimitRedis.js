import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';
/** Create the rate-limit client, adapting Upstash's Lua header only for local Redis. */
export function createRateLimitRedis({
  url,
  token,
  localCompatibility = false,
}) {
  const redis = new Redis({ url, token });
  if (!localCompatibility) return redis;
  const hashes = new Map();
  const hash = (script) => createHash('sha1').update(script).digest('hex');
  const adapt = (command) => {
    if (!Array.isArray(command)) return command;
    if (Array.isArray(command[0])) return command.map(adapt);
    const [operation, value, ...args] = command;
    if (
      String(operation).toLowerCase() === 'eval' &&
      typeof value === 'string'
    ) {
      // Native Redis executes Lua atomically, but rejects this Upstash-only flag.
      const script = value.replace(/^#!lua flags=allow-key-locking\r?\n/, '');
      hashes.set(hash(value), hash(script));
      return [operation, script, ...args];
    }
    if (String(operation).toLowerCase() === 'evalsha' && hashes.has(value))
      return [operation, hashes.get(value), ...args];
    return command;
  };
  redis.use((request, next) => next({ ...request, body: adapt(request.body) }));
  return redis;
}
