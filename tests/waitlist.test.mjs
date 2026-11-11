import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { POST, GET, CONSENT_TEXT } from '../api/waitlist.js';
import { storeConfig } from '../api/_waitlist-store.js';
import { startRedis } from './redis-helper.mjs';

function request(values = {}, options = {}) {
  return new Request('http://localhost:3000/waitlist', {
    method: 'POST', headers: { origin: 'http://localhost:3000', ...options.headers },
    body: options.body ?? new URLSearchParams({ name: 'Test Shop Owner', email: 'owner@example.com', business: 'Test Shop', consent: 'yes', ...values }),
  });
}

test('waiting list: actual Redis persistence, validation, concurrency, abuse and failure semantics', async t => {
  const redis = await startRedis();
  t.after(() => redis.close());
  Object.assign(process.env, {
    WAITLIST_REDIS_REST_URL: redis.url, WAITLIST_REDIS_REST_TOKEN: 'local-test-only',
    WAITLIST_HASH_SECRET: 'local-test-hmac-secret-at-least-32-characters', WAITLIST_NAMESPACE: 'test',
  });
  delete process.env.RESEND_API_KEY;
  await t.test('required consent and invalid fields do not save', async () => {
    const response = await POST(request({ name: 'A', email: 'wrong', consent: '', business: 'x'.repeat(121) }));
    assert.equal(response.status, 400);
    assert.deepEqual(Object.keys((await response.json()).fields).sort(), ['business', 'consent', 'email', 'name']);
    assert.equal(await redis.run('DBSIZE'), 0);
  });
  await t.test('origin, honeypot, malformed content, oversized streamed bodies, method', async () => {
    assert.equal((await POST(request({}, { headers: { origin: 'https://evil.example' } }))).status, 403);
    assert.equal((await POST(request({}, { headers: { origin: 'null' } }))).status, 403);
    assert.equal((await POST(request({ company_website: 'spam' }))).status, 400);
    assert.equal((await POST(request({}, { body: 'x'.repeat(8100), headers: { 'content-type': 'application/x-www-form-urlencoded' } }))).status, 413);
    assert.equal((await POST(request({}, { body: '{}', headers: { 'content-type': 'application/json' } }))).status, 415);
    assert.equal(GET().status, 405);
    assert.equal(await redis.run('DBSIZE'), 0);
  });
  await t.test('success is backed by a stored normalized request and consent; newsletter unaffected', async () => {
    const response = await POST(request({ email: ' OWNER@Example.COM ' }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    const keys = await redis.run('KEYS', '*entry:*');
    assert.equal(keys.length, 1);
    assert.ok(!keys[0].includes('owner'));
    const saved = JSON.parse(await redis.run('GET', keys[0]));
    assert.equal(saved.email, 'owner@example.com');
    assert.equal(saved.consentText, CONSENT_TEXT);
    assert.equal(saved.notification, 'not-configured');
    assert.equal(saved.source, 'sales-stock-page');
    assert.ok(await redis.run('TTL', keys[0]) > 15551900);
    assert.deepEqual(await redis.run('KEYS', '*subscriber*'), []);
    await redis.restart();
    assert.deepEqual(JSON.parse(await redis.run('GET', keys[0])), saved);
  });
  await t.test('duplicates retain original details and match the success response', async () => {
    const response = await POST(request({ name: 'Changed Name' }));
    assert.equal(response.status, 200);
    const keys = await redis.run('KEYS', '*entry:*');
    assert.equal(keys.length, 1);
    assert.equal(JSON.parse(await redis.run('GET', keys[0])).name, 'Test Shop Owner');
  });
  await t.test('concurrent requests create one entry', async () => {
    await redis.run('FLUSHDB');
    const responses = await Promise.all([POST(request()), POST(request()), POST(request())]);
    assert.ok(responses.every(r => r.status === 200));
    assert.equal((await redis.run('KEYS', '*entry:*')).length, 1);
    assert.equal((await POST(request())).status, 429); // 3 per address per hour
  });
  await t.test('IP limit persists across requests with different addresses', async () => {
    await redis.run('FLUSHDB');
    for (let n = 0; n < 5; n++) assert.equal((await POST(request({ email: `person${n}@example.com` }))).status, 200);
    const response = await POST(request({ email: 'another@example.com' }));
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '3600');
    assert.equal((await redis.run('KEYS', '*entry:*')).length, 5);
  });
  await t.test('storage failures never report success; a retry can recover', async () => {
    await redis.run('FLUSHDB');
    redis.fail(true);
    const failed = await POST(request());
    assert.equal(failed.status, 503);
    assert.equal((await failed.json()).ok, false);
    assert.equal((await redis.run('KEYS', '*entry:*')).length, 0);
    redis.fail(false);
    assert.equal((await POST(request())).status, 200);
  });
  await t.test('notification failure cannot lose the already-saved request; duplicates do not send again', async () => {
    await redis.run('FLUSHDB');
    process.env.RESEND_API_KEY = 'test-only';
    process.env.CONTACT_FROM_EMAIL = 'Test <hello@example.com>';
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      if (url === 'https://api.resend.com/emails') {
        calls++;
        assert.equal((await redis.run('KEYS', '*entry:*')).length, 1);
        const body = JSON.parse(init.body);
        assert.ok(!body.to.includes('owner@example.com'));
        assert.match(init.headers['Idempotency-Key'], /^sales-stock-/);
        return new Response('{}', { status: 503 });
      }
      return realFetch(url, init);
    };
    try {
      assert.equal((await POST(request())).status, 200);
      assert.equal((await POST(request())).status, 200);
      assert.equal(calls, 1);
      const [key] = await redis.run('KEYS', '*entry:*');
      assert.equal(JSON.parse(await redis.run('GET', key)).notification, 'pending');
    } finally { globalThis.fetch = realFetch; delete process.env.RESEND_API_KEY; }
  });
  await t.test('a lost write acknowledgement is honest and retry does not duplicate', async () => {
    await redis.run('FLUSHDB');
    const realFetch = globalThis.fetch;
    let dropped = false;
    globalThis.fetch = async (url, init) => {
      const response = await realFetch(url, init);
      if (!dropped && JSON.parse(init.body)[0] === 'EVAL') {
        dropped = true;
        throw new Error('Connection lost after commit');
      }
      return response;
    };
    try { assert.equal((await POST(request())).status, 503); }
    finally { globalThis.fetch = realFetch; }
    assert.equal((await redis.run('KEYS', '*entry:*')).length, 1);
    assert.equal((await POST(request())).status, 200);
    assert.equal((await redis.run('KEYS', '*entry:*')).length, 1);
  });
  await t.test('global cap bounds new rate keys even with rotated identities', async () => {
    await redis.run('FLUSHDB');
    const config = storeConfig();
    await redis.run('SET', `${config.prefix}rate:total`, '100', 'EX', '3600');
    assert.equal((await POST(request())).status, 429);
    assert.equal(await redis.run('DBSIZE'), 1);
  });
  await t.test('unconfigured or wrongly scoped stores fail closed', async () => {
    delete process.env.WAITLIST_REDIS_REST_TOKEN;
    assert.equal((await POST(request())).status, 503);
    process.env.WAITLIST_REDIS_REST_TOKEN = 'local-test-only';
    process.env.VERCEL_ENV = 'preview'; process.env.WAITLIST_NAMESPACE = 'production';
    assert.throws(storeConfig, /ISOLATION/);
    delete process.env.VERCEL_ENV; process.env.WAITLIST_NAMESPACE = 'test';
  });
});

test('page, consent copy and navigation contract', async () => {
  const html = await readFile('public/sales-stock.html', 'utf8');
  const consentLabel = html.match(/<label for="waitlist-consent">([\s\S]*?)<\/label>/)[1].replace(/<[^>]+>/g, '').replaceAll('&amp;', '&');
  assert.equal(consentLabel, CONSENT_TEXT);
  assert.match(html, /name="consent"[^>]*required/);
  assert.ok(!/name="consent"[^>]*checked/.test(html));
  assert.match(html, /href="https:\/\/app.mansora-consulting.com"/);
  for (const page of ['index', 'about', 'services', 'packages', 'contact-us', 'our-approach', 'who-we-serve', 'why-mansora']) {
    const pageHtml = await readFile(`public/${page}.html`, 'utf8');
    assert.match(pageHtml.split('</nav>')[0], /href="\/sales-stock"/);
  }
});
