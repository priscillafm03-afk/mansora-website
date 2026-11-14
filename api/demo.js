// POST /api/demo: "Request a Software Demo" (Mansora Sales & Stock).
//
// Software demo requests go to the Mansora platform's Leads, not to the consulting enquiry flow (owner decision
// D01, 14 November 2026). This function does not send email: the platform saves the lead first and then sends
// the branded acknowledgement, the team alert and the follow-ups, so they can be stopped once someone has replied.
//
//   1. Validate and de-spam the submission (same origin check, size and rate limits as the Contact Us form).
//   2. Forward it server to server, signed with DEMO_INTAKE_SECRET, keeping the browser's submission id so a retry
//      never creates a second lead.
//   3. Report success only when the platform has saved the lead; otherwise ask the person to try again.
//
// Vercel environment variables:
//   DEMO_INTAKE_SECRET   required: the same random value as the platform's DEMO_INTAKE_SECRET (Railway)
//   PLATFORM_DEMO_URL    optional: default https://app.mansora-consulting.com/api/v1/public/demo-requests
import { createHash, createHmac } from "node:crypto";
import { clean, env, isEmail, json, readForm } from "./_mail.js";

export const BUSINESS_TYPES = new Set(["retail", "mini_mart", "general_merchandise", "wholesale", "other"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function signRequest(secret, timestamp, clientIp, rawBody) {
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  return createHmac("sha256", secret).update(`${timestamp}\n${clientIp}\n${bodyHash}`).digest("hex");
}

export async function POST(request) {
  const form = await readForm(request);
  if (form instanceof Response) return form;

  // Honeypot: bots fill hidden fields, people don't. Pretend success.
  if (clean(form.get("company_website"), 200)) return json(200, { ok: true, reference: "received" });

  const demo = {
    id: clean(form.get("submission_id"), 40),
    name: clean(form.get("name"), 100),
    business: clean(form.get("business"), 160),
    email: clean(form.get("email"), 200).toLowerCase(),
    phone: clean(form.get("phone"), 40),
    message: clean(form.get("message"), 1500),
    businessType: clean(form.get("business_type"), 40),
    consent: form.get("consent") === "yes",
  };
  const errors = [];
  if (!demo.name) errors.push("your name");
  if (!demo.business) errors.push("your business name");
  if (!isEmail(demo.email)) errors.push("a valid email address");
  if (errors.length) return json(400, { ok: false, error: `Please add ${errors.join(", ")}.` });
  if (!demo.consent) return json(400, { ok: false, error: "Please tick the box so we can contact you about your demo." });
  if (demo.phone && !/^[+()\d\s.-]{6,40}$/.test(demo.phone)) return json(400, { ok: false, error: "Please check your phone number." });
  if (!UUID.test(demo.id)) return json(400, { ok: false, error: "Please reload the page and try again." });
  if (!BUSINESS_TYPES.has(demo.businessType)) demo.businessType = "";

  const secret = env("DEMO_INTAKE_SECRET");
  if (!secret) {
    console.error(JSON.stringify({ event: "demo_request", error: "DEMO_INTAKE_SECRET is not set" }));
    return json(503, { ok: false, error: "Demo requests are not available just now.", fallback: "mailto" });
  }

  const payload = { id: demo.id, name: demo.name, business: demo.business, email: demo.email, phone: demo.phone, message: demo.message, consent: true, ...(demo.businessType ? { businessType: demo.businessType } : {}) };
  const raw = JSON.stringify(payload);
  const clientIp = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "0.0.0.0";
  const timestamp = Math.floor(Date.now() / 1000);
  let response;
  try {
    response = await fetch(env("PLATFORM_DEMO_URL", "https://app.mansora-consulting.com/api/v1/public/demo-requests"), {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "content-type": "application/json",
        "x-mansora-source": "website",
        "x-mansora-timestamp": String(timestamp),
        "x-mansora-client-ip": clientIp,
        "x-mansora-signature": signRequest(secret, timestamp, clientIp, raw),
      },
      body: raw,
    });
  } catch {
    console.error(JSON.stringify({ event: "demo_request", id: demo.id, error: "platform unreachable" }));
    return json(502, { ok: false, error: "We couldn't save your request just now. Please try again in a moment.", retry: true });
  }
  const body = await response.json().catch(() => ({}));
  console.log(JSON.stringify({ event: "demo_request", id: demo.id, status: response.status, duplicate: !!body.duplicate }));
  if (response.status === 202) return json(200, { ok: true, reference: body.reference || "received" });
  if (response.status === 429) return json(429, { ok: false, error: "Too many attempts. Please wait a few minutes or call 024 420 5134." });
  if (response.status === 400) return json(400, { ok: false, error: "Please check your details and try again." });
  // 403 means the website and platform secrets differ: a setup problem, not the visitor's.
  return json(502, { ok: false, error: "We couldn't save your request just now. Please try again in a moment.", retry: response.status >= 500 });
}

export function GET() {
  return json(405, { ok: false, error: "Method not allowed" });
}
