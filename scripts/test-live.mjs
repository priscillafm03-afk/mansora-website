// End-to-end check of the live enquiry workflow.
//
//   npm run test:live                    # enquiry flow
//   npm run test:live -- --newsletter    # also test the newsletter sign-up
//
// Sends one "[TEST]" enquiry through the live site, prints what each step did
// (team alert, confirmation, reminder, follow-up, Google Sheet, WhatsApp), then uses the
// Resend API to confirm the emails exist and cancels the two scheduled test emails.
//
// Env: RESEND_API_KEY (needed for the Resend check and the cancel step)
//      SITE_URL   default https://mansora-consulting.com
//      TEST_EMAIL default priscilla@mansora-consulting.com
const SITE = (process.env.SITE_URL || "https://mansora-consulting.com").replace(/\/$/, "");
const TEST_EMAIL = process.env.TEST_EMAIL || "priscilla@mansora-consulting.com";
const KEY = process.env.RESEND_API_KEY || "";
const withNewsletter = process.argv.includes("--newsletter");

const mark = (v) => (v === true ? "✔ ok" : v === "off" ? "– not set up" : v === false ? "✘ FAILED" : String(v));
let failed = false;
const fail = (msg) => { failed = true; console.log(`✘ ${msg}`); };

async function resend(path, init = {}) {
  const res = await fetch(`https://api.resend.com${path}`, { ...init, headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

console.log(`\nMANSORA live test → ${SITE}\n`);

// 1. Submit a test enquiry exactly as the browser form does.
const form = new FormData();
form.set("name", `[TEST] Launch check ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
form.set("email", TEST_EMAIL);
form.set("service", "Financial & Accounting Support");
form.set("package", "gold");
form.set("phone", "");
form.set("message", "Automated end-to-end test from `npm run test:live`. Please ignore.");
form.set("company_website", "");

const res = await fetch(`${SITE}/api/contact`, { method: "POST", body: form });
const data = await res.json().catch(() => ({}));
console.log(`Form submit: HTTP ${res.status}`);
if (!res.ok || !data.ok) {
  fail(`Enquiry was not accepted: ${JSON.stringify(data)}`);
  console.log("  Check Vercel → Logs (search: Resend error / Sheet log failed).");
  process.exit(1);
}
console.log(`Reference:   ${data.reference}\n`);
const steps = data.steps || {};
for (const [label, key] of [["Team alert email", "alert"], ["Client confirmation", "confirm"], ["24h team reminder", "reminder"], ["2-day follow-up", "followUp"], ["Google Sheet row", "sheet"], ["WhatsApp alert", "whatsapp"]]) {
  console.log(`  ${label.padEnd(22)} ${mark(steps[key])}`);
  if (steps[key] === false) failed = true;
}

// 2. Confirm in Resend and cancel the scheduled test emails.
if (!KEY) {
  console.log("\n(Set RESEND_API_KEY to also verify in Resend and cancel the scheduled test emails.)");
} else {
  await new Promise((r) => setTimeout(r, 4000));
  const list = await resend("/emails?limit=50");
  const mine = (list.body.data || []).filter((m) => (m.subject || "").includes(data.reference));
  console.log(`\nResend: ${mine.length} email(s) for ${data.reference}`);
  for (const m of mine) console.log(`  ${String(m.last_event || "-").padEnd(10)} ${m.subject}`);
  if (mine.length < 4) fail(`expected 4 emails in Resend, found ${mine.length}`);
  for (const m of mine.filter((m) => m.last_event === "scheduled")) {
    const c = await resend(`/emails/${m.id}/cancel`, { method: "POST" });
    console.log(`  cancelled scheduled test email: ${c.status === 200 ? "yes" : `no (HTTP ${c.status})`}`);
  }
}

// 3. Optional: newsletter sign-up.
if (withNewsletter) {
  const f = new FormData();
  f.set("email", TEST_EMAIL);
  const r = await fetch(`${SITE}/api/subscribe`, { method: "POST", body: f });
  const d = await r.json().catch(() => ({}));
  console.log(`\nNewsletter sign-up: HTTP ${r.status} ${d.ok ? "✔ ok" : "✘ " + JSON.stringify(d)}`);
  if (!d.ok) failed = true;
}

console.log(failed ? "\nRESULT: ✘ something failed (details above)\n" : "\nRESULT: ✔ all live steps passed\n");
process.exit(failed ? 1 : 0);
