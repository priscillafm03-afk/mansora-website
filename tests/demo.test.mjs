// node --test tests/  (no dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import { POST, signRequest } from "../api/demo.js";

const ID = "3f2b8c1e-4a5d-4e6f-8a7b-9c0d1e2f3a4b";
let visitor = 0;
function request(fields, headers = {}) {
  visitor++;
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return new Request("https://mansora-consulting.com/demo", { method: "POST", body, headers: { origin: "https://mansora-consulting.com", host: "mansora-consulting.com", "x-forwarded-for": `203.0.113.${visitor}`, ...headers } });
}
const good = { submission_id: ID, name: "Ama Mensah", business: "Ama's Mini Mart", email: "Ama@Example.com", phone: "024 111 2222", business_type: "mini_mart", message: "Stock counts", consent: "yes" };
function withPlatform(status, body, fn) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); if (status === "down") throw new Error("down"); return new Response(JSON.stringify(body), { status }); };
  process.env.DEMO_INTAKE_SECRET = "s".repeat(64);
  return fn(calls).finally(() => { globalThis.fetch = original; delete process.env.DEMO_INTAKE_SECRET; });
}

test("forwards a valid request, signed, with the submission id, and reports the platform's reference", () => withPlatform(202, { ok: true, reference: "MSD-261114-AB2C" }, async (calls) => {
  const res = await POST(request(good));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, reference: "MSD-261114-AB2C" });
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, "https://app.mansora-consulting.com/api/v1/public/demo-requests");
  const sent = JSON.parse(init.body);
  assert.deepEqual(sent, { id: ID, name: "Ama Mensah", business: "Ama's Mini Mart", email: "ama@example.com", phone: "024 111 2222", message: "Stock counts", consent: true, businessType: "mini_mart" });
  const h = init.headers;
  assert.match(h["x-mansora-client-ip"], /^203\.0\.113\.\d+$/);
  assert.equal(h["x-mansora-signature"], signRequest("s".repeat(64), Number(h["x-mansora-timestamp"]), h["x-mansora-client-ip"], init.body));
}));

test("never reports success when the platform did not save the request", () => withPlatform("down", {}, async () => {
  const res = await POST(request(good));
  assert.equal(res.status, 502);
  assert.equal((await res.json()).retry, true);
}));

test("passes on rate limits and explains a missing setting without losing the visitor", async () => {
  await withPlatform(429, { code: "RATE_LIMITED" }, async () => assert.equal((await POST(request(good))).status, 429));
  const res = await POST(request(good));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).fallback, "mailto");
});

test("checks the fields, the consent and the submission id before forwarding anything", () => withPlatform(202, { ok: true }, async (calls) => {
  assert.equal((await POST(request({ ...good, email: "not-an-email" }))).status, 400);
  assert.equal((await POST(request({ ...good, consent: "" }))).status, 400);
  assert.equal((await POST(request({ ...good, submission_id: "123" }))).status, 400);
  assert.equal((await POST(request({ ...good, business: "" }))).status, 400);
  const bot = await POST(request({ ...good, company_website: "spam.example" }));
  assert.equal(bot.status, 200);
  assert.equal((await POST(request(good, { origin: "https://evil.example" }))).status, 403);
  assert.equal(calls.length, 0);
}));
