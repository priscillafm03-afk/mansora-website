// Local integration-test server. Never deploy this or use real credentials here.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { startRedis } from './redis-helper.mjs';
const redis = await startRedis();
const app = spawn(process.execPath, ['scripts/dev-server.mjs'], {
  stdio: 'inherit', env: { ...process.env, PORT: '3001', MAIL_MOCK: '1',
    RESEND_API_KEY: '', WAITLIST_REDIS_REST_URL: redis.url, WAITLIST_REDIS_REST_TOKEN: 'local-test-only',
    WAITLIST_HASH_SECRET: 'browser-only-secret-for-local-tests-32-characters', WAITLIST_NAMESPACE: 'browser' },
});
const controls = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/fail') redis.fail(true);
  if (path === '/recover') redis.fail(false);
  if (path === '/reset') { redis.fail(false); await redis.run('FLUSHDB'); }
  if (path === '/restart') await redis.restart();
  const keys = await redis.run('KEYS', '*entry:*');
  const records = await Promise.all(keys.map(async key => JSON.parse(await redis.run('GET', key))));
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ records }));
}).listen(3002, '127.0.0.1');
async function close() { app.kill(); controls.closeAllConnections(); controls.close(); await redis.close(); process.exit(); }
process.on('SIGTERM', close); process.on('SIGINT', close);
