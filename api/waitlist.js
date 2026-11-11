import { randomUUID } from 'node:crypto';
import { isEmail, escapeHtml, TEAM_EMAILS } from './_mail.js';
import { storeConfig, saveRequest, command } from './_waitlist-store.js';

export const CONSENT_VERSION = 'sales-stock-early-access-2026-11-11';
export const CONSENT_TEXT = 'I agree that Mansora may store my details and email me about my Sales & Stock early-access request. This does not subscribe me to the newsletter. I can withdraw by emailing priscilla@mansora-consulting.com.';
const SUCCESS = 'Your early-access request is saved. Mansora will contact you when a suitable pilot place is available. If you have requested access before, your existing request is kept. This is not an account or an invitation.';
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: {
  'content-type': 'application/json', 'cache-control': 'no-store', 'x-robots-tag': 'noindex',
  ...(status === 429 ? { 'retry-after': '3600' } : {}),
} });

async function readInput(request) {
  // Use configured origins, never a client-supplied forwarded host.
  const origins = new Set(['https://mansora-consulting.com', 'https://www.mansora-consulting.com']);
  if (process.env.VERCEL_URL) origins.add(`https://${process.env.VERCEL_URL}`);
  if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
    const url = new URL(request.url);
    if (['localhost', '127.0.0.1'].includes(url.hostname)) origins.add(url.origin);
  }
  if (!origins.has(request.headers.get('origin'))) return reply(403, { ok: false, error: 'Please submit this form from the Mansora website.' });
  const type = request.headers.get('content-type') || '';
  if (!/^(application\/x-www-form-urlencoded|multipart\/form-data)(;|$)/i.test(type)) return reply(415, { ok: false, error: 'Please use the waiting-list form.' });
  if (Number(request.headers.get('content-length')) > 8000) return reply(413, { ok: false, error: 'Your request is too long. Please shorten the fields.' });
  const reader = request.body?.getReader();
  const chunks = [];
  let size = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8000) { await reader.cancel(); return reply(413, { ok: false, error: 'Your request is too long. Please shorten the fields.' }); }
      chunks.push(value);
    }
  }
  try {
    const form = await new Response(Buffer.concat(chunks), { headers: { 'content-type': type } }).formData();
    for (const key of form.keys()) if (form.getAll(key).length !== 1 || typeof form.get(key) !== 'string') throw new Error('invalid');
    return form;
  } catch { return reply(400, { ok: false, error: 'The form could not be read. Please try again.' }); }
}

// Team-only transactional notification. No newsletter contact, broadcast, invitation,
// or automatic email to an unverified address is created by this endpoint.
async function notify(record) {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') return 'preview-disabled';
  if (!process.env.RESEND_API_KEY || !process.env.CONTACT_FROM_EMAIL) return 'not-configured';
  try {
    const text = `Sales & Stock early-access request ${record.id}\nName: ${record.name}\nEmail: ${record.email}\nBusiness: ${record.business || 'Not supplied'}\nConsent: ${record.consentVersion}\nSaved: ${record.createdAt}\n\nThis request is saved in the separate waiting list. It is not a tester invitation or newsletter subscription.`;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `sales-stock-${record.id}` },
      body: JSON.stringify({ from: process.env.CONTACT_FROM_EMAIL, to: TEAM_EMAILS(),
        subject: 'Mansora Sales & Stock — saved early-access request', text,
        html: `<html lang="en"><body><h1>Saved early-access request</h1><p style="white-space:pre-wrap">${escapeHtml(text)}</p></body></html>`,
        tags: [{ name: 'flow', value: 'sales_stock_waitlist' }],
      }),
    });
    const body = await response.json().catch(() => ({}));
    return response.ok && typeof body.id === 'string' ? 'accepted' : 'pending';
  } catch { return 'pending'; }
}

export async function POST(request) {
  try {
    const form = await readInput(request);
    if (form instanceof Response) return form;
    if (form.get('company_website')) return reply(400, { ok: false, error: 'We could not accept this request. Please leave the website field empty.' });
    const name = (form.get('name') || '').trim();
    const email = (form.get('email') || '').trim().toLowerCase();
    const business = (form.get('business') || '').trim();
    const fields = {};
    if (name.length < 2 || name.length > 100 || /[\x00-\x1f\x7f]/.test(name)) fields.name = 'Enter your name (2–100 characters).';
    if (!isEmail(email)) fields.email = 'Enter a valid email address.';
    if (business.length > 120 || /[\x00-\x1f\x7f]/.test(business)) fields.business = 'Use no more than 120 characters for your business name.';
    if (form.get('consent') !== 'yes') fields.consent = 'Please agree to contact about your early-access request.';
    if (Object.keys(fields).length) return reply(400, { ok: false, error: 'Please check the highlighted fields.', fields });
    const config = storeConfig();
    const record = { id: randomUUID(), name, email, business, createdAt: new Date().toISOString(),
      source: 'sales-stock-page', consentVersion: CONSENT_VERSION, consentText: CONSENT_TEXT,
      status: 'requested', notification: 'pending' };
    // Vercel overwrites this header with the real client address. Do not trust arbitrary XFF.
    const ip = process.env.VERCEL ? (request.headers.get('x-vercel-forwarded-for') || 'unknown') : 'local-preview';
    const { result, key } = await saveRequest(config, record, ip);
    if (result === 'limited') return reply(429, { ok: false, error: 'Too many attempts. Please wait an hour before trying again, or email priscilla@mansora-consulting.com.' });
    if (result === 'saved') {
      record.notification = await notify(record);
      // Preserve remaining retention TTL; no failure here can undo the saved request.
      try { await command(config, ['SET', key, JSON.stringify(record), 'XX', 'KEEPTTL']); }
      catch { console.warn(JSON.stringify({ event: 'waitlist_notification_status_pending' })); }
    }
    return reply(200, { ok: true, message: SUCCESS });
  } catch {
    console.warn(JSON.stringify({ event: 'waitlist_unavailable' }));
    return reply(503, { ok: false, error: 'We could not confirm that your request was saved. Please try again later. Repeating the form will not create a duplicate. You can also email priscilla@mansora-consulting.com.' });
  }
}

export function GET() { return reply(405, { ok: false, error: 'Method not allowed' }); }
