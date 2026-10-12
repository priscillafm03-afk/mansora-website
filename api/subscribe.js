// POST /api/subscribe: MANSORA Insights newsletter sign-up.
//   1. Add to the Resend audience (if RESEND_AUDIENCE_ID is set).
//   2. Send the subscriber a welcome email.
//   3. Let the team know.
import { addToAudience, clean, isEmail, json, mailConfigured, readForm, sendEmail, TEAM_EMAILS } from "./_mail.js";
import { newsletterTeamNotice, newsletterWelcome } from "./_templates.js";

export async function POST(request) {
  const form = await readForm(request);
  if (form instanceof Response) return form;
  if (clean(form.get("company_website"), 200)) return json(200, { ok: true });

  const email = clean(form.get("email"), 254).toLowerCase();
  if (!isEmail(email)) return json(400, { ok: false, error: "Please enter a valid email address." });
  if (!mailConfigured()) return json(503, { ok: false, error: "Subscriptions are temporarily unavailable. Please try again later." });

  const day = new Date().toISOString().slice(0, 10);
  const [audience, welcome, notice] = await Promise.all([
    addToAudience(email),
    sendEmail({ to: email, replyTo: TEAM_EMAILS(), idempotencyKey: `sub-${day}-${email}-welcome`, tags: [{ name: "flow", value: "newsletter_welcome" }], ...newsletterWelcome(email) }),
    sendEmail({ to: TEAM_EMAILS(), idempotencyKey: `sub-${day}-${email}-notice`, tags: [{ name: "flow", value: "newsletter_notice" }], ...newsletterTeamNotice(email) }),
  ]);
  console.log(JSON.stringify({ event: "subscribe", audience: audience.ok, welcome: welcome.ok, notice: notice.ok }));

  if (!welcome.ok && !notice.ok && !audience.ok) {
    return json(502, { ok: false, error: "We couldn't subscribe you just now. Please try again later." });
  }
  return json(200, { ok: true });
}

export function GET() {
  return json(405, { ok: false, error: "Method not allowed" });
}
