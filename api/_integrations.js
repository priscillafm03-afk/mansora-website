// Optional integrations for the form workflows. Each one is off until its env vars are set,
// never throws, and returns { ok, skipped?, error? } so a failure never loses an enquiry.
//
//   SHEETS_WEBHOOK_URL     Google Apps Script web-app URL that appends rows to the lead sheet
//   SHEETS_WEBHOOK_SECRET  optional shared secret, checked if the Apps Script has a SECRET property
//   WHATSAPP_PHONE         number that receives enquiry alerts, international format, e.g. 233244205134
//   CALLMEBOT_API_KEY      key CallMeBot sends to that phone when it is activated
import { env } from "./_mail.js";

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms); });
  try { return await Promise.race([promise, timeout]); } finally { clearTimeout(timer); }
}

// Appends one row to the Google Sheet ("Enquiries" or "Subscribers" tab).
export async function logToSheet(type, row) {
  const url = env("SHEETS_WEBHOOK_URL");
  if (!url) return { ok: true, skipped: true };
  if (env("MAIL_MOCK") === "1") { console.log(`[MAIL_MOCK] sheet ${type}`, JSON.stringify(row)); return { ok: true }; }
  try {
    const res = await withTimeout(fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // Apps Script reads the raw body
      body: JSON.stringify({ secret: env("SHEETS_WEBHOOK_SECRET"), type, row }),
      redirect: "follow",
    }), 8000, "Sheet log");
    const text = await res.text();
    let body = {};
    try { body = JSON.parse(text); } catch { /* Apps Script returned HTML, e.g. an error page */ }
    if (!res.ok || body.ok !== true) {
      console.error("Sheet log failed", res.status, text.slice(0, 300));
      return { ok: false, error: body.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("Sheet log request failed", String(err));
    return { ok: false, error: String(err) };
  }
}

// Sends a short WhatsApp message to the business phone via CallMeBot.
export async function whatsappAlert(text) {
  const phone = env("WHATSAPP_PHONE").replace(/\D/g, "");
  const key = env("CALLMEBOT_API_KEY");
  if (!phone || !key) return { ok: true, skipped: true };
  if (env("MAIL_MOCK") === "1") { console.log(`[MAIL_MOCK] whatsapp to ${phone}: ${text}`); return { ok: true }; }
  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(key)}`;
    const res = await withTimeout(fetch(url), 8000, "WhatsApp alert");
    const body = await res.text();
    if (!res.ok || !/queued|sent/i.test(body)) { // CallMeBot answers "Message queued" on success
      console.error("WhatsApp alert failed", res.status, body.replace(/<[^>]+>/g, " ").slice(0, 200));
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("WhatsApp alert request failed", String(err));
    return { ok: false, error: String(err) };
  }
}
