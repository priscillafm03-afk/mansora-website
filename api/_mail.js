// Shared helpers for the form endpoints. Files starting with "_" are not exposed as routes.
//
// Vercel environment variables:
//   RESEND_API_KEY        required: API key from https://resend.com
//   CONTACT_FROM_EMAIL    required: sender on a domain verified in Resend,
//                         e.g. "MANSORA Consulting <hello@mansora-consulting.com>"
//   CONTACT_TO_EMAIL      team inbox(es), comma-separated (default priscilla@mansora-consulting.com)
//   RESEND_AUDIENCE_ID    optional: Resend audience that newsletter sign-ups are added to
//   TEAM_REMINDER_HOURS   optional: hours until the team follow-up reminder (default 24, 0 = off)
//   FOLLOW_UP_DAYS        optional: days until the client follow-up email (default 2, 0 = off)
//   SITE_URL              optional: public site URL used in emails (default https://mansora-consulting.com)
//   MAIL_MOCK=1           local testing only: log emails instead of sending them

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]{1,253}\.[a-z]{2,}$/i;
const MAX_BODY_BYTES = 20_000;

export const env = (key, fallback = "") => (process.env[key] ?? "").trim() || fallback;
export const SITE_URL = () => env("SITE_URL", "https://mansora-consulting.com").replace(/\/$/, "");
export const TEAM_EMAILS = () => env("CONTACT_TO_EMAIL", "priscilla@mansora-consulting.com").split(",").map((s) => s.trim()).filter(Boolean);

// Best-effort per-instance rate limit (5 requests / 10 min per IP).
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 5;
}

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function isEmail(s) {
  return typeof s === "string" && s.length <= 254 && EMAIL_RE.test(s);
}

export function clean(value, max) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

export const oneLine = (s) => String(s).replace(/[\r\n]+/g, " ").trim();

// Short human-friendly reference, e.g. MCB-261012-K7Q4
export function reference() {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => alphabet[b % alphabet.length]).join("");
  return `MCB-${ymd}-${rand}`;
}

// Ghana numbers: "024 420 5134" / "+233 24 420 5134" -> "233244205134" for wa.me links.
export function whatsappNumber(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (/^0\d{9}$/.test(digits)) return "233" + digits.slice(1);
  if (/^233\d{9}$/.test(digits)) return digits;
  if (/^\d{10,15}$/.test(digits)) return digits;
  return "";
}

// Validates origin, size and rate; returns the parsed FormData or a Response to send back.
export async function readForm(request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (origin && host) {
    let originHost = "";
    try { originHost = new URL(origin).host; } catch { /* malformed */ }
    if (originHost !== host) return json(403, { ok: false, error: "Forbidden" });
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: "Your message is too long. Please shorten it and try again." });
  }
  const ip = (request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  if (rateLimited(ip)) {
    return json(429, { ok: false, error: "Too many attempts. Please wait a few minutes or call 024 420 5134." });
  }
  try {
    return await request.formData();
  } catch {
    return json(400, { ok: false, error: "Invalid form data" });
  }
}

export function mailConfigured() {
  return env("MAIL_MOCK") === "1" || Boolean(env("RESEND_API_KEY") && env("CONTACT_FROM_EMAIL"));
}

// Sends one email through Resend. `idempotencyKey` stops duplicates if a request is retried.
// Returns { ok, id?, error? } and never throws.
export async function sendEmail({ to, subject, html, text, replyTo, scheduledAt, idempotencyKey, tags }) {
  const payload = {
    from: env("CONTACT_FROM_EMAIL", "MANSORA Website <onboarding@resend.dev>"),
    to: Array.isArray(to) ? to : [to],
    subject: oneLine(subject),
    html,
    text,
    ...(replyTo ? { reply_to: replyTo } : {}),
    ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
    ...(tags ? { tags } : {}),
  };
  if (env("MAIL_MOCK") === "1") {
    console.log(`[MAIL_MOCK] ${scheduledAt ? `scheduled ${scheduledAt} ` : ""}to=${payload.to.join(",")} subject="${payload.subject}"`);
    globalThis.__mockOutbox = [...(globalThis.__mockOutbox || []), payload].slice(-20);
    return { ok: true, id: "mock_" + Math.random().toString(36).slice(2) };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("Resend error", res.status, subject, JSON.stringify(body));
      return { ok: false, error: body.message || `HTTP ${res.status}` };
    }
    return { ok: true, id: body.id };
  } catch (err) {
    console.error("Resend request failed", subject, err);
    return { ok: false, error: String(err) };
  }
}

// Adds a contact to the Resend audience if RESEND_AUDIENCE_ID is set. Never throws.
export async function addToAudience(email, firstName) {
  const audience = env("RESEND_AUDIENCE_ID");
  if (!audience) return { ok: true, skipped: true };
  if (env("MAIL_MOCK") === "1") { console.log(`[MAIL_MOCK] audience add ${email}`); return { ok: true }; }
  try {
    const res = await fetch(`https://api.resend.com/audiences/${encodeURIComponent(audience)}/contacts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email, first_name: firstName || undefined, unsubscribed: false }),
    });
    if (!res.ok && res.status !== 409) {
      console.error("Resend audience error", res.status, await res.text());
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error("Resend audience request failed", err);
    return { ok: false };
  }
}

export function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}
