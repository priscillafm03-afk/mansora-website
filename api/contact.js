// POST /contact (rewritten to /api/contact in vercel.json). Receives the Contact Us form.
import { clean, escapeHtml, isEmail, json, readForm, sendMail } from "./_mail.js";

const SERVICES = new Set([
  "Business Advisory",
  "Financial & Accounting Support",
  "Strategic Consulting",
  "Business Growth",
  "Other Enquiry",
]);

export async function POST(request) {
  const form = await readForm(request);
  if (form instanceof Response) return form;

  // Honeypot: bots fill hidden fields, people don't.
  if (clean(form.get("company_website"), 200)) return json(200, { ok: true });

  const name = clean(form.get("name"), 120);
  const email = clean(form.get("email"), 254);
  const service = clean(form.get("service"), 80);
  const phone = clean(form.get("phone"), 40);
  const message = clean(form.get("message"), 5000);

  if (!name || !isEmail(email) || !SERVICES.has(service) || !message) {
    return json(400, { ok: false, error: "Please fill in your name, a valid email, a service and a message" });
  }
  if (phone && !/^[+()\d\s.-]{6,40}$/.test(phone)) {
    return json(400, { ok: false, error: "Please enter a valid phone number" });
  }

  const row = (k, v) => `<tr><td style="padding:4px 12px 4px 0;color:#667085">${k}</td><td>${escapeHtml(v || "-")}</td></tr>`;
  return sendMail({
    subject: `New enquiry: ${service} (${name})`.replace(/[\r\n]/g, " "),
    replyTo: email,
    html: `<h2>New website enquiry</h2><table>${row("Name", name)}${row("Email", email)}${row("Phone", phone)}${row("Service", service)}</table>
<p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
  });
}

export function GET() {
  return json(405, { ok: false, error: "Method not allowed" });
}
