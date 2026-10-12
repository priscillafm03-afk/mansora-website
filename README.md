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
   - `RESEND_API_KEY`: from https://resend.com (the free tier is enough)
   - `CONTACT_TO_EMAIL`: inbox that receives enquiries, e.g. `Mansora@ghana.com`
   - `CONTACT_FROM_EMAIL`: e.g. `MANSORA Website <website@mansora-consulting.com>` (verify the domain in Resend first)
3. Redeploy.

Until the email variables are set, the contact form still works: it opens the visitor's email app with the enquiry already filled in.

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
- Images converted to WebP (12 MB → 1.5 MB). Below-the-fold images lazy-load. Fonts load via `<link>` with preconnect instead of a CSS `@import`.

After launch, add the site to Google Search Console and Bing Webmaster Tools and submit `https://mansora-consulting.com/sitemap.xml`. Then create a Google Business Profile for the Haatso Bohye office.

## Security

- Headers: HSTS, CSP, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy, COOP.
- The CSP has to allow `'unsafe-inline'` and `'unsafe-eval'` in `script-src` because Google Translate needs them. The site has no logins or user-generated content, so the risk is low. If the language selector is ever removed, take both out.
- Form endpoints check that requests come from the site itself, cap body size, rate-limit by IP, validate every field, escape HTML in outgoing email and include a honeypot field to catch bots. Secrets are kept only in Vercel environment variables.
