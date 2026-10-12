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
   - `CONTACT_TO_EMAIL` (optional): team inbox, default `ataakonadu50@gmail.com`. Separate several addresses with commas.
   - `TEAM_REMINDER_HOURS` (optional, default `24`) and `FOLLOW_UP_DAYS` (optional, default `2`). Set either to `0` to turn that email off.
   - `RESEND_AUDIENCE_ID` (optional): Resend audience that newsletter sign-ups are added to.
3. Redeploy.

## Enquiry workflow (Resend)

When someone sends the Contact Us form (`api/contact.js`):

| When | Who gets it | What |
|------|-------------|------|
| Instantly | Team (`CONTACT_TO_EMAIL`) | New-enquiry alert with a reference number (e.g. `MCB-261012-K7Q4`), the details, and one-tap Reply, Call and WhatsApp buttons. Replying goes straight to the enquirer. |
| Instantly | Enquirer | Branded confirmation with their reference, the service they asked about, what happens next and the phone numbers. Replies go to the team. |
| After 24 hours | Team | Follow-up reminder ("ignore if you've already been in touch"). |
| After 2 days | Enquirer | Gentle check-in with the phone numbers. |

Newsletter sign-ups (`api/subscribe.js`) receive a welcome email, the team gets a notification, and the subscriber is added to the Resend audience if `RESEND_AUDIENCE_ID` is set.

The team alert is sent first and has to succeed. If it fails, the form opens the visitor's email app with the enquiry already filled in, so no lead is lost. Every email carries an idempotency key, so retries never send duplicates. Emails are templated in `api/_templates.js`.

To test locally, run `npm run dev`. Without a `RESEND_API_KEY`, emails are logged to the terminal instead of being sent.

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
