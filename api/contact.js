// POST /api/contact: the enquiry workflow behind the Contact Us form.
//
//   1. Validate and de-spam the submission.
//   2. Instantly alert the team (reply / call / WhatsApp buttons).        <- must succeed
//   3. Instantly send the enquirer a branded confirmation with their reference.
//   4. Schedule a team follow-up reminder (TEAM_REMINDER_HOURS, default 24h).
//   5. Schedule a gentle client follow-up (FOLLOW_UP_DAYS, default 2 days).
//   6. Log the enquiry to the Google Sheet (also when email fails) and send a WhatsApp alert.
import { clean, env, hoursFromNow, isEmail, json, mailConfigured, readForm, reference, sendEmail, TEAM_EMAILS } from "./_mail.js";
import { logToSheet, whatsappAlert } from "./_integrations.js";
import { PACKAGE_NAMES } from "./_templates.js";
import { clientConfirmation, clientFollowUp, teamAlert, teamReminder } from "./_templates.js";

// Options in the Contact Us form's "What can we help with?" list.
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

  // Honeypot: bots fill hidden fields, people don't. Pretend success.
  if (clean(form.get("company_website"), 200)) return json(200, { ok: true, reference: "received" });

  const lead = {
    ref: reference(),
    name: clean(form.get("name"), 120),
    email: clean(form.get("email"), 254).toLowerCase(),
    phone: clean(form.get("phone"), 40),
    service: clean(form.get("service"), 80),
    package: clean(form.get("package"), 20).toLowerCase(),
    message: clean(form.get("message"), 5000),
    receivedAt: new Date().toLocaleString("en-GB", { timeZone: "Africa/Accra", dateStyle: "medium", timeStyle: "short" }) + " (Accra time)",
  };

  const errors = [];
  if (!lead.name) errors.push("your name");
  if (!isEmail(lead.email)) errors.push("a valid email address");
  if (!SERVICES.has(lead.service)) errors.push("the area you need help with");
  if (!lead.message) errors.push("a short message");
  if (errors.length) return json(400, { ok: false, error: `Please add ${errors.join(", ")}.` });
  if (lead.phone && !/^[+()\d\s.-]{6,40}$/.test(lead.phone)) return json(400, { ok: false, error: "Please check your phone number." });
  if (!PACKAGE_NAMES[lead.package]) lead.package = "";
  // "[TEST]" names come from `npm run test:live`; they are marked as tests in the sheet.
  lead.test = /^\[test\]/i.test(lead.name);

  // Logged to the sheet no matter what happens with email, so no lead is ever lost.
  const sheet = logToSheet("enquiry", {
    reference: lead.ref, received: lead.receivedAt, name: lead.name, email: lead.email, phone: lead.phone,
    service: lead.service, package: PACKAGE_NAMES[lead.package] || "", message: lead.message,
    status: lead.test ? "Test" : "New",
  });

  if (!mailConfigured()) {
    await sheet;
    console.error("Enquiry received but email is not configured", lead.ref);
    return json(503, { ok: false, error: "Email is not configured", fallback: "mailto" });
  }

  const team = TEAM_EMAILS();
  const key = (step) => `${lead.ref}-${step}`;

  // 2. Team alert first: this is the one that must not be lost.
  const alert = teamAlert(lead);
  const alertResult = await sendEmail({ to: team, replyTo: lead.email, idempotencyKey: key("alert"), tags: [{ name: "flow", value: "enquiry_alert" }], ...alert });
  if (!alertResult.ok) {
    await sheet;
    return json(502, { ok: false, error: "We couldn't send your message just now.", fallback: "mailto" });
  }

  // 3–6 run together; a failure here is logged but doesn't fail the enquiry.
  const reminderHours = Number(env("TEAM_REMINDER_HOURS", "24"));
  const followDays = Number(env("FOLLOW_UP_DAYS", "2"));
  const tasks = [
    sendEmail({ to: lead.email, replyTo: team, idempotencyKey: key("confirm"), tags: [{ name: "flow", value: "enquiry_confirm" }], ...clientConfirmation(lead) }),
    reminderHours > 0
      ? sendEmail({ to: team, replyTo: lead.email, scheduledAt: hoursFromNow(reminderHours), idempotencyKey: key("reminder"), tags: [{ name: "flow", value: "enquiry_reminder" }], ...teamReminder(lead) })
      : Promise.resolve({ ok: true, skipped: true }),
    followDays > 0
      ? sendEmail({ to: lead.email, replyTo: team, scheduledAt: hoursFromNow(followDays * 24), idempotencyKey: key("followup"), tags: [{ name: "flow", value: "enquiry_followup" }], ...clientFollowUp(lead) })
      : Promise.resolve({ ok: true, skipped: true }),
    sheet,
    whatsappAlert(`${lead.test ? "[TEST] " : ""}New MANSORA enquiry ${lead.ref}
${lead.name} (${lead.email}${lead.phone ? ", " + lead.phone : ""})
${lead.service}${lead.package ? " / " + PACKAGE_NAMES[lead.package] : ""}

${lead.message.slice(0, 300)}`),
  ];
  const [confirm, reminder, followUp, sheetResult, whatsapp] = await Promise.all(tasks);
  const steps = { alert: alertResult.ok, confirm: confirm.ok, reminder: reminder.ok, followUp: followUp.ok, sheet: sheetResult.skipped ? "off" : sheetResult.ok, whatsapp: whatsapp.skipped ? "off" : whatsapp.ok };
  console.log(JSON.stringify({ event: "enquiry", ref: lead.ref, service: lead.service, package: lead.package || null, test: lead.test, ...steps }));

  return json(200, { ok: true, reference: lead.ref, confirmationSent: confirm.ok, ...(lead.test ? { steps } : {}) });
}

export function GET() {
  return json(405, { ok: false, error: "Method not allowed" });
}
