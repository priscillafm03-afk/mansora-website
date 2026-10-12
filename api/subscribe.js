// POST /subscribe (rewritten to /api/subscribe in vercel.json). Newsletter sign-up.
// Sends the new subscriber to the MANSORA inbox; swap for a mailing-list API later if needed.
import { clean, escapeHtml, isEmail, json, readForm, sendMail } from "./_mail.js";

export async function POST(request) {
  const form = await readForm(request);
  if (form instanceof Response) return form;

  const email = clean(form.get("email"), 254);
  if (!isEmail(email)) {
    return json(400, { ok: false, error: "Please enter a valid email address" });
  }

  return sendMail({
    subject: "New newsletter subscriber",
    replyTo: email,
    html: `<p>New MANSORA Insights subscriber: <strong>${escapeHtml(email)}</strong></p>`,
  });
}

export function GET() {
  return json(405, { ok: false, error: "Method not allowed" });
}
