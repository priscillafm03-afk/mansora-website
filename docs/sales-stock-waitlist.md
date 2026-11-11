# Sales & Stock early access: implementation and release handoff

## Source and ownership

The corporate site moved from `edanquah266-max/MANSORA` (Flask, master a7a8abc)
to **priscillafm03-afk/mansora-website** (static Vercel + Node functions).
This branch starts at main `7d05ff8b6b6719ec69dc324b6a7e1e4c9de2b92f`.
On 2026-11-11 the live homepage matched this commit byte for byte, SHA-256
`365bdc0eea01e76dc81baca38282de2d201b03444fae1c90da2f15af2db127be`.
Live main.js also matched, SHA-256
`51363d72c0a23676f9aae61ad52619504c0cc1ab4fe085f5a1c60a608b82cf0d`.
No other branches or open PRs existed before work. Recheck before release.
GitHub main's Vercel deployment status identifies the hosting project as
`https://vercel.com/mansora/mansora-website`, project ID
`prj_Ut9FDUqBrj084D2ZCZ5yU0DdF773`. The PR's Vercel bot confirms that same team
`team_X3ap3DDgjZnI1UYLnkvTB6xf` and project. Corrected commit attribution to the
connected GitHub account unblocked the automatic preview, which Vercel reports
Ready. Preview: `https://mansora-website-git-codex-sales-stock-waitlist-mansora.vercel.app/sales-stock`.
The preview requires Vercel Authentication. The connected API returns 404 for
this exact project/deployment despite listing that team, so settings/secret
access and authenticated live-form verification remain blocked. Protection has
not been disabled and no public bypass link has been created.

App coordination is in **PeterAshiagbor/Mansora**, `docs/codex-tasks.md` and
[issue #39](https://github.com/PeterAshiagbor/Mansora/issues/39).
The corporate session owns only this page and waiting list. App tester invitations,
Resend diagnostics, app DNS and infrastructure stay with the app session.
C39 app demo-request intake is a different workflow. No automatic invitation,
account creation or provisioning is triggered here.

## Feature evidence and boundaries

Copy was checked against app source snapshot `700d0862708387c6f852e67b2ebb0f459d16be52`
and its existing review/readiness documents. The app suite was **not rerun in this
website session**. These references support implemented software, not hardware or
real-shop acceptance. App `docs/operations/product-audit-and-roadmap.md` explicitly
distinguishes offline Windows selling from the internet-dependent hosted gateway.

| Page feature | App evidence (paths in PeterAshiagbor/Mansora) |
| --- | --- |
| Desktop offline sale, barcode checkout, receipt | `apps/desktop/src/renderer/pages/Checkout.tsx`, `tests/integration/engine.test.ts`, `tests/e2e/desktop-workflows.test.ts` |
| Cash/card/mobile-money records | Checkout, `tests/unit/domain.test.ts`; recording is distinct from live provider processing |
| Products, carton costing, counts, purchases, low stock | `pages/Products.tsx`, `pages/Stock.tsx`, `tests/integration/retail-pricing.test.ts`, `tests/e2e/retail-pricing.test.ts` |
| Customer credit and repayments | `pages/Customers.tsx`, `tests/e2e/ui.test.ts` |
| Shifts, movements, expenses, reconciliation | `pages/Shifts.tsx`, `tests/e2e/desktop-workflows.test.ts` |
| Sales/payment/profit/stock reports and exports | `pages/Reports.tsx`, `tests/unit/reporting.test.ts` |
| Staff permissions and approvals | `pages/Admin.tsx`, `tests/security/isolation.test.ts` |
| Encrypted backups, recovery and sync | `tests/sync/recovery.test.ts`, `tests/sync/sync.test.ts`, `docs/disaster-recovery/backup-and-recovery.md` |
| Setup, help, consent-based support | `pages/GettingStarted.tsx`, `pages/Help.tsx`, `tests/e2e/client-readiness.test.ts`, `tests/security/isolation.test.ts` |
| Subscription billing, reminders, communications | `tests/billing/lifecycle.test.ts`, `tests/billing/resend-email.test.ts`, `tests/e2e/communications.test.ts` |

`pages/` above abbreviates `apps/desktop/src/renderer/pages/`. No pricing, launch
date, signed installer, live payment-provider approval or physical hardware
acceptance is promised. Existing users link to `https://app.mansora-consulting.com`.

## Storage and consent

- New endpoint: `POST /waitlist` (rewrite to `/api/waitlist`). No public reads.
- Uses a **dedicated private Upstash Redis store**, via its JSON REST API. Do not
  connect it to the app DB, newsletter audience or the existing lead sheet.
- Required server-only configuration: `WAITLIST_REDIS_REST_URL`,
  `WAITLIST_REDIS_REST_TOKEN`, `WAITLIST_HASH_SECRET` (random, >=32 characters),
  `WAITLIST_NAMESPACE`. Example values are intentionally absent from the repo.
- Production namespace: `production`. Previews require a separate test store and
  another namespace; a preview configured as `production` fails closed. Preview
  deployments never send the team notification.
- Use durable storage with persistence enabled and **eviction disabled**. This is
  a system of record, not a disposable cache. Upstash account/storage billing and
  retention settings must be reviewed before release. No resource is provisioned
  or charged by this branch.
- Atomic Redis script enforces distributed limits (5/IP/10 minutes,
  3/email/hour, 100 total/hour) and creates one normalized-email record. Redis
  cluster keys share one slot. A duplicate keeps the original consent and details;
  it returns the same generic saved response, without exposing list membership.
- Records contain name, email, optional business, UUID, UTC receipt time, source,
  exact consent text/version, requested status and team notification status.
  Consent is required and unchecked; no newsletter opt-in is inferred.
- Keys use HMAC digests, never raw email or IP. Raw IPs are not retained. Vercel's
  overwritten `x-vercel-forwarded-for` supplies the client IP. Missing identity
  shares a conservative limit rather than bypassing it. Rate keys expire.
- Each request record expires after 180 days; copy says up to six months. This is
  an explicit early-access default, to be reviewed by the owner before release.
  Apply the same maximum retention to exports, team email copies and backups.
  Configure the provider's backup retention/deletion process accordingly.
- Origin is checked against known site/preview origins, not forwarded host input;
  content type, actual streamed body size (8KB), fields, honeypot and explicit
  consent are checked server-side. A honeypot never receives false success.
- Any missing configuration, datastore error or ambiguous acknowledgement returns
  503 with an honest retry message. There is no local/mock storage fallback.
  If a timed-out write did commit, retry is safe and deduplicated.

## Email behaviour

After a new record is durably acknowledged, an optional **team-only transactional
alert** uses the website's existing server-side Resend key/sender/team inbox.
This does not touch the app email system, Resend Contacts, audiences or broadcasts.
No email is sent to the unverified supplied address; this avoids creating a spam
relay or claiming verification/invitation. Input is escaped in the team email.
There is a bounded timeout and a UUID idempotency key. Accepted means provider
accepted, not delivered. Notification failure does not change the successful save.
`notification=pending` remains available for operator follow-up; no automatic
retry worker is claimed. The UI never promises an email was sent.

## Private operations

Only a trusted operator with storage credentials may run the tool. Keep pulled
env files ignored. Do not paste secrets or personal records into PRs/logs.

```
node --env-file=.env.local scripts/waitlist-admin.mjs get person@example.com
node --env-file=.env.local scripts/waitlist-admin.mjs delete person@example.com
node --env-file=.env.local scripts/waitlist-admin.mjs export /private/path/waitlist-export.json
```

Exports are private JSON (no CSV formula execution), created mode 0600 without
overwriting an existing file. Never put exports in `public/` or commit them.
Handle correction by verifying the requester through the business support process,
then deleting and asking them to resubmit. On withdrawal, delete the record and
relevant team email/export copies; track the request privately. Deletion permits a
later fresh opt-in. Do not use this list for newsletters or other marketing.

## Verification and release gate

- `npm test`: real Redis integration, including AOF-backed server restart,
  normalization/consent, duplicates/races, limits, invalid input, configuration,
  storage failure and notification failure. No actual Resend messages are sent.
- `npm run test:browser`: real browser → local server → real Redis → UI, success,
  duplicate/restart, failure/retry and focus/error handling; layout at
  320/390/768/1024/1440px, keyboard skip, axe WCAG A/AA on **new product content**.
  Existing contact/newsletter client requests are intercepted to verify endpoints;
  no test enquiry or subscription is sent to production.
- GitHub Actions installs real Redis and Chromium and runs both suites plus audit.
  Local Redis executables can be selected with `REDIS_SERVER`/`REDIS_CLI`.
  Local browser executable can be selected with
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

Before merging or deploying, coordinate in issue #39 and with the website owner:
1. Confirm the actual Vercel project and its Git link to this repository/branch.
2. Connect dedicated persistent storage and configure server-only secrets through
   Vercel settings. Keep preview and production storage separate.
3. Verify real preview POST, stored row after a second invocation/restart, duplicate,
   validation, consent, failure state and team notification status. Verify physical
   email receipt separately if desired; provider acceptance alone is insufficient.
4. Check exact PR-head CI, inspect desktop/phone preview, confirm retention policy.
5. Merge/deploy only after coordination. Recheck production routes and a labelled
   test request, verify its stored record, then remove it through the private tool.

At implementation time: 13 local backend checks and 10 browser checks pass. **Live waitlist
persistence, production configuration and deployment are not yet verified.** The
production URL does not serve this branch. Contact/newsletter handlers, DNS and
hosting settings are unchanged by this branch.
