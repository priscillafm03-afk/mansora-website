// A real Redis process behind the same JSON REST protocol used in production.
// No in-memory database substitute; AOF/fsync is enabled for restart tests.
import { spawn, execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
const execFile = promisify(execFileCallback);
export async function startRedis() {
  const directory = await mkdtemp(join(tmpdir(), 'mansora-waitlist-'));
  const socket = join(directory, 'redis.sock');
  const cli = process.env.REDIS_CLI || 'redis-cli';
  const executable = process.env.REDIS_SERVER || 'redis-server';
  const run = async (...args) => {
    const { stdout } = await execFile(cli, ['-s', socket, '--json', ...args.map(String)]);
    return stdout.trim() ? JSON.parse(stdout) : null;
  };
  let redis;
  async function boot() {
    redis = spawn(executable, ['--port', '0', '--unixsocket', socket, '--dir', directory, '--appendonly', 'yes', '--appendfsync', 'always', '--save', ''], { stdio: 'ignore' });
    let startError;
    redis.on('error', error => { startError = error; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (startError) throw startError;
      try { if (await run('PING') === 'PONG') return; } catch { /* wait for socket */ }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('Redis failed to start');
  }
  await boot();
  let offline = false;
  const bridge = createServer(async (req, res) => {
    if (offline) { res.writeHead(503); return res.end('{}'); }
    if (req.headers.authorization !== 'Bearer local-test-only') { res.writeHead(401); return res.end('{}'); }
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const args = JSON.parse(Buffer.concat(chunks).toString());
      const result = await run(...args);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ result }));
    } catch { res.writeHead(500); res.end(JSON.stringify({ error: 'Redis command failed' })); }
  });
  await new Promise(resolve => bridge.listen(0, '127.0.0.1', resolve));
  return {
    run, url: `http://127.0.0.1:${bridge.address().port}`,
    fail(value) { offline = value; },
    async restart() {
      const exited = new Promise(resolve => redis.once('exit', resolve));
      await run('SHUTDOWN');
      await exited;
      await boot();
    },
    async close() {
      bridge.closeAllConnections();
      await new Promise(resolve => bridge.close(resolve));
      const exited = new Promise(resolve => redis.once('exit', resolve));
      redis.kill('SIGTERM');
      await exited;
      await rm(directory, { recursive: true, force: true });
    },
  };
}
