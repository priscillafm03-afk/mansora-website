import { createHmac } from 'node:crypto';

// One atomic script across function instances. All keys share a Redis cluster slot.
export const SAVE = `
local total = redis.call('INCR', KEYS[3])
if total == 1 then redis.call('EXPIRE', KEYS[3], 3600) end
if total > 100 then return 'limited' end
local ip = redis.call('INCR', KEYS[1])
if ip == 1 then redis.call('EXPIRE', KEYS[1], 600) end
if ip > 5 then return 'limited' end
local email = redis.call('INCR', KEYS[2])
if email == 1 then redis.call('EXPIRE', KEYS[2], 3600) end
if email > 3 then return 'limited' end
if redis.call('EXISTS', KEYS[4]) == 1 then return 'duplicate' end
redis.call('SET', KEYS[4], ARGV[1], 'EX', 15552000)
return 'saved'
`;

export function storeConfig() {
  const url = process.env.WAITLIST_REDIS_REST_URL || '';
  const token = process.env.WAITLIST_REDIS_REST_TOKEN || '';
  const secret = process.env.WAITLIST_HASH_SECRET || '';
  const namespace = process.env.WAITLIST_NAMESPACE || '';
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('WAITLIST_NOT_CONFIGURED'); }
  const local = process.env.NODE_ENV !== 'production' && !process.env.VERCEL && ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if ((!local && parsed.protocol !== 'https:') || parsed.username || parsed.password || !token || secret.length < 32 || !/^[a-z0-9-]{1,40}$/.test(namespace)) {
    throw new Error('WAITLIST_NOT_CONFIGURED');
  }
  if (process.env.VERCEL_ENV === 'preview' && namespace === 'production') throw new Error('WAITLIST_PREVIEW_ISOLATION');
  return { url, token, secret, prefix: `mansora:{waitlist-${namespace}}:` };
}

export async function command(config, args) {
  const response = await fetch(config.url, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error('WAITLIST_STORAGE_UNAVAILABLE');
  const body = await response.json();
  if (body.error || !Object.hasOwn(body, 'result')) throw new Error('WAITLIST_STORAGE_UNAVAILABLE');
  return body.result;
}

export function digest(config, value) {
  return createHmac('sha256', config.secret).update(value).digest('hex');
}

export async function saveRequest(config, record, ip) {
  const key = `${config.prefix}entry:${digest(config, record.email)}`;
  const result = await command(config, ['EVAL', SAVE, '4',
    `${config.prefix}rate:ip:${digest(config, ip)}`,
    `${config.prefix}rate:email:${digest(config, record.email)}`,
    `${config.prefix}rate:total`, key, JSON.stringify(record)]);
  if (!['saved', 'duplicate', 'limited'].includes(result)) throw new Error('WAITLIST_STORAGE_UNAVAILABLE');
  return { result, key };
}
