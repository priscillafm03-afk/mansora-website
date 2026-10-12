// Shared helpers for the form endpoints. Files starting with "_" are not exposed as routes.
//
// Required Vercel environment variables:
//   RESEND_API_KEY      API key from https://resend.com (free tier is enough)
//   CONTACT_TO_EMAIL    inbox that receives enquiries, e.g. Mansora@ghana.com
//   CONTACT_FROM_EMAIL  verified sender, e.g. "MANSORA Website <website@mansora-consulting.com>"

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]{1,253}\.[a-z]{2,}$/i;
const MAX_BODY_BYTES = 20_000;

// Best-effort per-instance rate limit (5 requests / 10 min per IP).
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5;
}

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function isEmail(s) {
  return typeof s === "string" && s.length <= 254 && EMAIL_RE.test(s);
}

export function clean(value, max) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

// Validates origin, size and rate; returns the parsed FormData or a Response to send back.
export async function readForm(request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return json(403, { ok: false, error: "Forbidden" });
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: "Message too large" });
  }
  const ip = (request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  if (rateLimited(ip)) {
    return json(429, { ok: false, error: "Too many requests, please try again later" });
  }
  try {
    return await request.formData();
  } catch {
    return json(400, { ok: false, error: "Invalid form data" });
  }
}

export async function sendMail({ subject, html, replyTo }) {
  const { RESEND_API_KEY, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL } = process.env;
  if (!RESEND_API_KEY || !CONTACT_TO_EMAIL || !CONTACT_FROM_EMAIL) {
    return json(503, { ok: false, error: "Email is not configured", fallback: "mailto" });
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: CONTACT_FROM_EMAIL,
      to: CONTACT_TO_EMAIL.split(",").map((s) => s.trim()),
      reply_to: replyTo,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    console.error("Resend error", res.status, await res.text());
    return json(502, { ok: false, error: "Could not send message", fallback: "mailto" });
  }
  return json(200, { ok: true });
}
