# MANSORA Consulting & Business Solutions: website

Static site for **mansora-consulting.com**, moved from the Flask/Render app (`mansora-1.onrender.com`) to Vercel.

```
public/        the website (HTML pages, CSS, JS, images, robots.txt, sitemap.xml, manifest)
api/           Vercel functions for the contact and newsletter forms
scripts/       local preview server that mirrors vercel.json
vercel.json    clean URLs, form rewrites, security headers, caching
```

## Run locally

```bash
npm run dev
```

Open http://localhost:3000. No install step and no dependencies.

## Deploy (Vercel)

1. In Vercel, choose **Add New → Project** and import this GitHub repo. Leave Framework Preset on **Other**; `vercel.json` sets everything else.
2. Under **Settings → Environment Variables**, add:
   - `RESEND_API_KEY`: from https://resend.com
   - `CONTACT_FROM_EMAIL`: a sender on a domain verified in Resend, e.g. `MANSORA Consulting <hello@mansora-consulting.com>`
   - `CONTACT_TO_EMAIL` (optional): team inbox, default `priscilla@mansora-consulting.com`. Separate several addresses with commas.
   - `TEAM_REMINDER_HOURS` (optional, default `24`) and `FOLLOW_UP_DAYS` (optional, default `2`). Set either to `0` to turn that email off.
   - `RESEND_AUDIENCE_ID` (optional): Resend audience that newsletter sign-ups are added to.
3. Redeploy.

## Automations

When someone sends the Contact Us form (`api/contact.js`):

| When | What |
|------|------|
| Instantly | Row added to the **MANSORA Leads** Google Sheet (Enquiries tab), even if email fails |
| Instantly | New-enquiry alert to the team, with a reference number (e.g. `MCB-261012-K7Q4`) and one-tap Reply / Call / WhatsApp buttons |
| Instantly | Branded confirmation to the enquirer (service, package, what happens next, phone numbers) |
| Instantly | WhatsApp message to the business phone (if CallMeBot is set up) |
| After 24 hours | Follow-up reminder to the team |
| After 2 days | Gentle check-in to the enquirer |

Newsletter sign-ups (`api/subscribe.js`) get a welcome email, the team is notified, the subscriber is added to **Resend Contacts** (send newsletters from Resend > Broadcasts) and logged on the sheet's Subscribers tab.

The lead sheet is written by a Google Apps Script web app owned by priscilla@mansora-consulting.com (source: `integrations/google-sheet/Code.gs`).

### Settings (Vercel > Settings > Environment Variables)

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` | Resend key from the **mansora-consulting** Resend team (the domain is verified there) |
| `CONTACT_FROM_EMAIL` | `MANSORA Consulting <hello@mansora-consulting.com>` |
| `CONTACT_TO_EMAIL` | optional, defaults to `priscilla@mansora-consulting.com` |
| `SHEETS_WEBHOOK_URL` | the Apps Script web-app URL (`.../exec`) |
| `WHATSAPP_PHONE`, `CALLMEBOT_API_KEY` | optional WhatsApp alerts |
| `TEAM_REMINDER_HOURS`, `FOLLOW_UP_DAYS` | optional, defaults 24 and 2; `0` turns that email off |

### Logs

- **Google Sheet "MANSORA Leads"**: the permanent record of every enquiry and subscriber
- **Resend > Emails**: every email and its status (delivered, bounced, scheduled)
- **Vercel > Logs**: one `{"event":"enquiry", ...}` line per submission showing each step, plus any errors

### Testing

- Live: `RESEND_API_KEY=... npm run test:live` sends a `[TEST]` enquiry, prints each step, checks Resend and cancels the scheduled test emails. Add `-- --newsletter` to test the sign-up too.
- Local: `npm run dev` logs emails to the terminal instead of sending them.

## Domain (GoDaddy → Vercel)

In Vercel, go to **Settings → Domains**, add `mansora-consulting.com` and `www.mansora-consulting.com`, and make the apex domain primary. Then add these DNS records in GoDaddy:

| Type  | Name | Value                  |
|-------|------|------------------------|
| A     | @    | `76.76.21.21`          |
| CNAME | www  | `cname.vercel-dns.com` |

Delete any other `A` record on `@`, such as GoDaddy's parking record. Vercel issues the SSL certificate automatically.

## SEO

- Each page has its own title, meta description, canonical URL, Open Graph and Twitter tags.
- JSON-LD structured data: `ProfessionalService`/`AccountingService` (address, phone, opening hours), `WebSite`, breadcrumbs and a page type for every page.
- `robots.txt`, `sitemap.xml`, favicons, an Apple touch icon, a web manifest and a 1200×630 social share image.
- Language selector includes Twi, Ga and Igbo alongside English, French, Spanish, German, Portuguese, Italian, Arabic, Chinese, Japanese and Korean.
- Design: the original layout, recoloured to the proposal deck's plum and gold. `static/css/enhance.css` sets Georgia headlines, a 16px text minimum and removes eyebrow labels.
- Images converted to WebP (12 MB → 1.5 MB). Below-the-fold images lazy-load. Fonts load via `<link>` with preconnect instead of a CSS `@import`.

After launch, add the site to Google Search Console and Bing Webmaster Tools and submit `https://mansora-consulting.com/sitemap.xml`. Then create a Google Business Profile for the Haatso Bohye office.

## Security

- Headers: HSTS, CSP, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy, COOP.
- The CSP has to allow `'unsafe-inline'` and `'unsafe-eval'` in `script-src` because Google Translate needs them. The site has no logins or user-generated content, so the risk is low. If the language selector is ever removed, take both out.
- Form endpoints check that requests come from the site itself, cap body size, rate-limit by IP, validate every field, escape HTML in outgoing email and include a honeypot field to catch bots. Secrets are kept only in Vercel environment variables.

## Mansora Sales & Stock early access

`/sales-stock` introduces the product; `/waitlist` saves early-access requests in
separate private persistent storage before reporting success. It never subscribes
people to the newsletter or provisions app users. See
[the implementation, operations and release handoff](docs/sales-stock-waitlist.md)
for configuration, consent/retention, private exports/removal and the release gate.

Run `npm ci`, `npm test` (requires redis-server/redis-cli) and
`npm run test:browser` (requires Playwright Chromium). The form returns an honest
503 until its dedicated storage is configured, including during local preview.
