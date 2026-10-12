// Branded email templates for the enquiry and newsletter workflows.
// Table layout + inline styles so they render in Gmail, Outlook and phone mail apps.
import { escapeHtml as e, SITE_URL, whatsappNumber } from "./_mail.js";

const C = { plum: "#38145c", plumDark: "#221634", plumMid: "#5c2d85", lav: "#f5eefd", line: "#e1d7e8", gold: "#c48b17", goldText: "#9a6a0b", goldSoft: "#e6b74c", cream: "#fffaf1", muted: "#5e5269" };
const SANS = "Aptos,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

export const PHONES = ["024 420 5134", "024 421 2404", "025 737 3765"];
const TEL = (p) => "+233" + p.replace(/\s/g, "").slice(1);



const p = (html, extra = "") => `<p style="margin:0 0 16px;font:400 17px/1.6 ${SANS};color:${C.plumDark};${extra}">${html}</p>`;
const h = (text, size = 26) => `<h1 style="margin:0 0 16px;font:700 ${size}px/1.25 ${SERIF};color:${C.plum};">${text}</h1>`;
const h2 = (text) => `<h2 style="margin:28px 0 12px;font:700 19px/1.3 ${SANS};color:${C.plum};">${text}</h2>`;
const btn = (href, label, bg = C.plum, color = "#ffffff") =>
  `<a href="${e(href)}" style="display:inline-block;margin:0 8px 10px 0;padding:13px 22px;border-radius:12px;background:${bg};color:${color};font:700 16px/1 ${SANS};text-decoration:none;">${label}</a>`;
const list = (items) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">${items.map((i) => `<tr><td style="vertical-align:top;padding:4px 10px 4px 0;font:700 17px/1.5 ${SANS};color:${C.gold};">✓</td><td style="padding:4px 0;font:400 17px/1.5 ${SANS};color:${C.plumDark};">${e(i)}</td></tr>`).join("")}</table>`;
const box = (inner, bg = C.lav) => `<div style="margin:20px 0;padding:20px 22px;border-radius:16px;background:${bg};border:1px solid ${C.line};">${inner}</div>`;
const rows = (pairs) => `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">${pairs.filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:9px 14px 9px 0;border-bottom:1px solid ${C.line};font:600 16px/1.4 ${SANS};color:${C.muted};white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:9px 0;border-bottom:1px solid ${C.line};font:400 17px/1.4 ${SANS};color:${C.plumDark};">${v}</td></tr>`).join("")}</table>`;

function shell({ preheader, body, footerNote = "" }) {
  const site = SITE_URL();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>MANSORA</title></head>
<body style="margin:0;padding:0;background:${C.cream};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${e(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream};"><tr><td align="center" style="padding:28px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;">
  <tr><td style="padding:0 0 18px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:14px;"><img src="${site}/static/images/logo-192.png" width="64" height="64" alt="MC&amp;BS" style="display:block;border-radius:12px;"></td>
      <td><div style="font:700 22px/1.1 ${SERIF};color:${C.plum};letter-spacing:.02em;">MANSORA</div><div style="font:400 16px/1.3 ${SANS};color:${C.muted};">Consulting &amp; Business Solutions</div></td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#ffffff;border:1px solid ${C.line};border-radius:24px;padding:32px 30px;">${body}</td></tr>
  <tr><td style="padding:22px 8px 0;font:400 16px/1.6 ${SANS};color:${C.muted};">
    <div style="font:700 17px/1.4 ${SERIF};color:${C.goldText};margin-bottom:6px;">We Make Your Business Better.</div>
    ${PHONES.map((ph) => `<a href="tel:${TEL(ph)}" style="color:${C.plum};text-decoration:none;font-weight:700;">${ph}</a>`).join(" &nbsp;•&nbsp; ")}<br>
    <a href="mailto:ataakonadu50@gmail.com" style="color:${C.plum};">ataakonadu50@gmail.com</a> &nbsp;•&nbsp; <a href="${site}" style="color:${C.plum};">${site.replace(/^https?:\/\//, "")}</a><br>
    Haatso Bohye, Accra, Ghana • Open 8 AM to 10 PM, every day
    ${footerNote ? `<div style="margin-top:12px;">${footerNote}</div>` : ""}
  </td></tr>
</table></td></tr></table></body></html>`;
}

const firstName = (name) => String(name).trim().split(/\s+/)[0] || "there";

/* ---------------- 1. Team alert (instant) ---------------- */
export function teamAlert(lead) {
  const wa = whatsappNumber(lead.phone);
  const replySubject = encodeURIComponent(`Re: your MANSORA enquiry (${lead.ref})`);
  const replyBody = encodeURIComponent(`Dear ${firstName(lead.name)},\n\nThank you for contacting MANSORA Consulting & Business Solutions.\n\n`);
  const waText = encodeURIComponent(`Hello ${firstName(lead.name)}, this is MANSORA Consulting & Business Solutions following up on your enquiry (${lead.ref}).`);
  const body = `
    ${h(`New enquiry from ${e(lead.name)}`)}
    ${p(`<strong>${e(lead.service)}</strong>${lead.phone ? ` • ${e(lead.phone)}` : ""}`, `color:${C.muted};`)}
    <div style="margin:4px 0 20px;">
      ${btn(`mailto:${lead.email}?subject=${replySubject}&body=${replyBody}`, "Reply by email")}
      ${lead.phone ? btn(`tel:${lead.phone.replace(/[^\d+]/g, "")}`, "Call", C.goldSoft, C.plumDark) : ""}
      ${wa ? btn(`https://wa.me/${wa}?text=${waText}`, "WhatsApp", "#1f7a4d") : ""}
    </div>
    ${rows([
      ["Reference", `<strong>${e(lead.ref)}</strong>`],
      ["Name", e(lead.name)],
      ["Email", `<a href="mailto:${e(lead.email)}" style="color:${C.plum};">${e(lead.email)}</a>`],
      ["Phone", lead.phone ? e(lead.phone) : "Not given"],
      ["Service", e(lead.service)],
      ["Received", e(lead.receivedAt)],
    ])}
    ${h2("Their message")}
    ${box(`<div style="font:400 17px/1.6 ${SANS};color:${C.plumDark};white-space:pre-wrap;">${e(lead.message)}</div>`)}
    ${h2("Suggested next steps")}
    ${list([
      `Contact ${firstName(lead.name)} as soon as possible${lead.phone ? " by phone or email" : " by email"}`,
      "Book a short discovery and scoping discussion",
      "Agree the scope of support, onboarding requirements and the engagement fee",
    ])}
    ${p(`${e(firstName(lead.name))} has already received an automatic confirmation email. Replying to this email goes straight to them.`, `color:${C.muted};font-size:16px;margin-top:18px;`)}`;
  return {
    subject: `New enquiry: ${lead.name} • ${lead.service} [${lead.ref}]`,
    html: shell({ preheader: `${lead.name} needs help with ${lead.service}. Reference ${lead.ref}.`, body }),
    text: `New enquiry ${lead.ref}\n\nName: ${lead.name}\nEmail: ${lead.email}\nPhone: ${lead.phone || "-"}\nService: ${lead.service}\n\n${lead.message}`,
  };
}

/* ---------------- 2. Client confirmation (instant) ---------------- */
export function clientConfirmation(lead) {
  const site = SITE_URL();
  const body = `
    ${h(`Thank you, ${e(firstName(lead.name))}. We've received your enquiry.`)}
    ${p(`Thank you for contacting <strong>MANSORA Consulting &amp; Business Solutions</strong>. A member of our team will be in touch shortly.`)}
    ${p(`Your reference is <strong style="color:${C.plum};">${e(lead.ref)}</strong>.`)}
    ${box(`
      <div style="font:700 16px/1.3 ${SANS};color:${C.goldText};margin-bottom:8px;">You asked about</div>
      <div style="font:700 22px/1.25 ${SERIF};color:${C.plum};">${e(lead.service)}</div>
    `)}
    ${h2("What happens next")}
    ${list([
      "A short discovery and scoping conversation to understand your business and goals",
      "We agree the support you need, onboarding requirements and your engagement fee",
      "We get to work, with clear deliverables and regular reporting",
    ])}
    <div style="margin:22px 0 8px;">
      ${btn(`${site}/services`, "Explore our services")}
      ${btn(`tel:${TEL(PHONES[0])}`, `Call ${PHONES[0]}`, C.goldSoft, C.plumDark)}
    </div>
    ${p(`Need to add something? Just reply to this email.`, `color:${C.muted};margin-top:14px;`)}
    ${h2("Your message")}
    ${box(`<div style="font:400 16px/1.6 ${SANS};color:${C.muted};white-space:pre-wrap;">${e(lead.message)}</div>`, C.cream)}`;
  return {
    subject: `We've received your enquiry, ${firstName(lead.name)} [${lead.ref}]`,
    html: shell({ preheader: `Thank you for contacting MANSORA. Your reference is ${lead.ref}.`, body }),
    text: `Thank you, ${firstName(lead.name)}. We've received your enquiry (${lead.ref}).\n\nYou asked about: ${lead.service}.\n\nWhat happens next:\n1. A short discovery and scoping conversation\n2. We agree the support you need, onboarding and your fee\n3. We get to work\n\nCall us: ${PHONES.join(", ")}\nReply to this email to add anything.\n\nMANSORA Consulting & Business Solutions: We Make Your Business Better.`,
  };
}

/* ---------------- 3. Team reminder (scheduled) ---------------- */
export function teamReminder(lead) {
  const body = `
    ${h(`Follow-up check: ${e(lead.name)}`, 24)}
    ${p(`This enquiry came in on ${e(lead.receivedAt)}. If you've already been in touch, you can ignore this reminder.`)}
    ${rows([["Reference", `<strong>${e(lead.ref)}</strong>`], ["Service", e(lead.service)], ["Email", e(lead.email)], ["Phone", lead.phone ? e(lead.phone) : "Not given"]])}
    <div style="margin:22px 0 0;">${btn(`mailto:${lead.email}?subject=${encodeURIComponent(`Re: your MANSORA enquiry (${lead.ref})`)}`, "Reply by email")}</div>`;
  return {
    subject: `Reminder: follow up with ${lead.name} [${lead.ref}]`,
    html: shell({ preheader: `Has ${lead.name} been contacted yet?`, body }),
    text: `Reminder: follow up with ${lead.name} (${lead.ref}). ${lead.email} ${lead.phone || ""}. If you've already been in touch, ignore this.`,
  };
}

/* ---------------- 4. Client follow-up (scheduled) ---------------- */
export function clientFollowUp(lead) {
  const site = SITE_URL();
  const body = `
    ${h(`Checking in on your enquiry, ${e(firstName(lead.name))}`, 24)}
    ${p(`A couple of days ago you contacted MANSORA about <strong>${e(lead.service)}</strong> (reference ${e(lead.ref)}). If we've already spoken, thank you, and please ignore this note.`)}
    ${p(`If you haven't heard from us yet, or you'd like to talk sooner, call or WhatsApp us on <strong>${PHONES[0]}</strong> or simply reply to this email.`)}
    ${box(`
      ${p(`<strong>How we work with new clients</strong>`, "margin-bottom:8px;")}
      ${list(["A short discovery and scoping conversation", "A clear recommendation on the support your business needs", "A fee agreed before any work begins"])}
    `)}
    <div style="margin:18px 0 0;">
      ${btn(`tel:${TEL(PHONES[0])}`, `Call ${PHONES[0]}`)}
      ${btn(`${site}/services`, "See our services", C.goldSoft, C.plumDark)}
    </div>`;
  return {
    subject: `Following up on your MANSORA enquiry [${lead.ref}]`,
    html: shell({ preheader: "Here to help whenever you're ready.", body }),
    text: `Hi ${firstName(lead.name)}, checking in on your MANSORA enquiry (${lead.ref}) about ${lead.service}. If we've already spoken, please ignore this. Otherwise call ${PHONES[0]} or reply to this email.`,
  };
}

/* ---------------- 5. Newsletter welcome ---------------- */
export function newsletterWelcome(email) {
  const site = SITE_URL();
  const body = `
    ${h("Welcome to MANSORA Insights")}
    ${p("Thank you for subscribing. From time to time we'll share practical ideas on accounting, tax, cash flow and growing a stronger business in Ghana.")}
    ${box(`
      ${p("<strong>While you're here</strong>", "margin-bottom:8px;")}
      ${list(["Explore our five service areas, from accounting to training", "Learn about our four-step approach: Understand, Analyse, Advise, Improve", "Talk to us any day from 8 AM to 10 PM"])}
    `)}
    <div style="margin:18px 0 0;">${btn(`${site}/services`, "Explore our services")}${btn(`${site}/contact-us`, "Talk to MANSORA", C.goldSoft, C.plumDark)}</div>`;
  return {
    subject: "Welcome to MANSORA Insights",
    html: shell({ preheader: "Practical business insights from MANSORA.", body, footerNote: `You're receiving this because ${e(email)} subscribed on our website. To unsubscribe, reply with "unsubscribe".` }),
    text: `Welcome to MANSORA Insights. Thank you for subscribing. Explore our services: ${site}/services. To unsubscribe, reply with "unsubscribe".`,
  };
}

export function newsletterTeamNotice(email) {
  const body = `${h("New newsletter subscriber", 24)}${p(`<strong>${e(email)}</strong> subscribed to MANSORA Insights from the website.`)}`;
  return { subject: `New MANSORA Insights subscriber: ${email}`, html: shell({ preheader: `${email} subscribed.`, body }), text: `New subscriber: ${email}` };
}
