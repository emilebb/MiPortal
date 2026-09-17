# Activate direct contact email

`POST /api/contact` sends directly through Resend after reserving a persistent
Supabase rate-limit slot. A `202` means Resend accepted the message; it does not
prove inbox delivery. Activation still requires real server configuration and
the SQL migration below. No real email has been authorized for testing.

## Newsletter setup

`POST /api/newsletter` stores one private, duplicate-safe subscriber record and
sends only a confirmation message containing signed, expiring confirmation and
unsubscribe links. It never sends campaigns. Apply `supabase/newsletter.sql`
before deployment and set `NEWSLETTER_HASH_SECRET` in the Vercel server
environment. Newsletter provider calls are mocked by tests, so no repository
test sends a real message.

## Setup

1. Apply `supabase/contact-resend.sql` through your normal Supabase migration
   process. It is additive and repeatable, with no dependency on the legacy queue
   migration. It creates a private rate-limit table and a service-role-only RPC.
   Do not rerun `supabase/n8n-setup.sql` on an existing database.
2. Verify a domain you control in Resend, then choose a sender address on that
   domain. Create a sending API key restricted to that domain where available.
   This repository does not establish that any sender domain is verified.
3. Set the following variables in Vercel's **server environment**, using
   `.env.example` as the template. Keep production credentials out of previews
   unless those previews are intentionally authorized to send.

   | Variable | Required value |
   | --- | --- |
   | `RESEND_API_KEY` | Actual Resend sending key |
   | `RESEND_FROM_EMAIL` | Bare email address on your verified domain |
   | `CONTACT_TO_EMAIL` | `emile.123455@gmail.com` (confirmed recipient) |
   | `SUPABASE_URL` | Your HTTPS Supabase project origin |
   | `SUPABASE_SECRET_KEY` | Server secret/service-role key for the private RPC |
   | `CONTACT_HASH_SECRET` | Random secret, at least 32 characters |

   `VERCEL=1` is supplied by Vercel. It is required because IP limiting trusts
   only Vercel's `x-vercel-forwarded-for`; other proxies are not supported.
   `SUPABASE_URL` is also used by the existing public resource/news client;
   `SUPABASE_PUBLISHABLE_KEY` remains the only key emitted by the static generator.
   Do not put server keys in that variable or add them to `supabase-config.js`.
4. Deploy through the project's normal release process when activation is
   authorized. Keep the current `vercel.json`: `public/` is static output and
   `api/contact.js` is the root Vercel Node function (Node 20+).
   Production origins currently allowed are `https://miportal.me`,
   `https://www.miportal.me`, and `https://mi-portal-seven.vercel.app`.
   Add a new trusted origin deliberately in the server allowlist if needed;
   arbitrary preview origins and localhost are rejected.

Actual deployment, database migration and real-mail smoke testing are separate
activation actions. **Obtain explicit permission before any real email test.**

## Behavior and operational limits

- Six attempts per rolling hour per IP and per lowercased email; 50 per rolling
  hour and 100 per rolling day globally. The SQL RPC serializes check + insert
  with a transaction advisory lock, so multiple serverless instances share one
  budget. Failed provider requests and retries also consume a slot. Quotas are
  deliberately conservative and can be adjusted in the SQL migration.
- Rate-limit records contain only HMAC hashes and timestamps, not message text,
  name, email or raw IP. Records older than 24 hours are pruned on the next valid
  reservation. RLS and revoked public grants prevent client access. No PII or
  provider response bodies are logged by the handler.
- The RPC has a 3-second timeout and fails closed. Resend has an 8-second timeout;
  the browser waits at most 15 seconds. These are application deadlines, not a
  claim that aborting an HTTP request cancels an email already accepted by Resend.
- The server validates JSON type/size (24,000 bytes), allowed fields, name,
  ASCII email syntax, 10–5000-character text, empty honeypot and trusted origin.
  The origin check and honeypot are defense in depth, not bot authentication.
  Persistent global budgets cap abuse even if bots forge Origin or rotate IPs.
- Resend receives plain text, a server-controlled `from`/`to`, and the visitor's
  validated email in REST `reply_to`. The visitor cannot set recipients or HTML.
- A browser attempt carries a UUID and creation time. The server HMACs these
  with the exact provider payload into `Idempotency-Key`. Unchanged manual retries
  reuse that key; double submission is blocked while a request is pending.
  Requests older than 23 hours are rejected, within Resend's 24-hour retention.
  Keep sender, recipient and hash secret stable during retries. Editing content,
  reloading the page or changing server configuration creates a new operation;
  check an uncertain previous submission before doing so. No message draft is
  persisted in browser storage, and no retry runs automatically.
- `429` responses include `Retry-After`. Missing config/limiter failure is `503`;
  uncertain provider failure is `502`, timeout `504`, conflict/expired attempt
  `409`. Errors preserve the form and release the submit button.

## Legacy n8n cutover

The new handler **never calls `enqueue_contact`** and never inserts into
`contact_messages`. Its limiter uses `contact_send_attempts` exclusively, so the
existing `claim_contact` worker cannot claim or resend new direct messages.

The prior `n8n/contact.json`, generator and queue SQL are preserved. Their sender
configuration is historical and is not evidence of domain verification. Keep the
legacy contact worker inactive during cutover. If the deployed worker is already
active, pause only that contact workflow through your authorized operational
process, and decide separately what to do with existing queued rows. Do not copy
legacy rows into the new endpoint or replay them automatically. News workflows
and the news cache do not participate in this migration.

## Local verification (no email delivery)

```sh
node --test scripts/contact.test.cjs scripts/contact-browser.test.mjs
node --test scripts/contact-db.test.cjs
npm run build
node --test scripts/contact-static.test.cjs
```

API tests replace **all** fetch calls and use fake secrets. Browser tests serve
local fixtures, block external HTTPS and never mount the real API handler. The
database suite starts its own `postgres:16-alpine` container with `--network none`
and temporary storage; it never connects to Supabase or starts existing workers.
It verifies migration repeatability, access restrictions, concurrent quotas,
retention and preservation of legacy queue/news fixtures. Docker and the local
PostgreSQL image are required; Chrome defaults to `/usr/bin/google-chrome`.
The static test checks the existing build output. To test secret exclusion, build
with fake server-variable values prefixed `CONTACT_TEST_RESEND_SECRET_SENTINEL`,
`CONTACT_TEST_DB_SECRET_SENTINEL` and `CONTACT_TEST_HASH_SECRET_SENTINEL` respectively;
the test rejects any such values in public artifacts.

For rollback, restore the prior handler/client/contact page together. The additive
limiter table/RPC may remain unused. Re-enabling legacy queue delivery is a
separate operational decision, since it can send older queued messages.

## Verified API references

Checked against live documentation on 2026-09-17:

- [Resend send email](https://resend.com/docs/api-reference/emails/send-email):
  REST `reply_to`, text payload and successful `{ "id": "..." }` response.
- [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys):
  `Idempotency-Key`, 24-hour retention and conflict behavior.
- [Resend errors](https://resend.com/docs/api-reference/errors): provider errors,
  verified-domain requirement and rate limits.
- [Vercel request headers](https://vercel.com/docs/headers/request-headers):
  trusted client IP header semantics.
