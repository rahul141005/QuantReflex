# Environment Variables

> Per-app environment variable requirements for Vercel deployment.

---

## Main App (`main-app/`)

Set in: Vercel Dashboard → `quantreflex` project → Settings → Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | ✅ | OpenAI API key for AI features (explain, coach, study-plan, word-problems) |
| `RAZORPAY_KEY_ID` | ✅ | Razorpay live key ID for payment processing |
| `RAZORPAY_KEY_SECRET` | ✅ | Razorpay live secret for server-side verification |
| `FIREBASE_SERVICE_ACCOUNT` | ✅ | Firebase Admin SDK service account JSON (single line) |
| `RAZORPAY_WEBHOOK_SECRET` | ✅ | Razorpay webhook HMAC secret |
| `CRON_SECRET` | ✅ | Bearer secret for the Vercel cron endpoints |
| `NOTIFY_INTERNAL_SECRET` | ✅ | Bearer secret for the internal `/api/notify` endpoint. **A real secret** — it is the only thing standing between the public internet and the push/inbox fan-out. Surfaced by the WS5/WS6 self-audit, which found it used in three apps and documented in none. |
| `NODE_ENV` | ⬜ | Set by Vercel. Read only to widen the CORS allowlist to localhost in development. |
| `PLAY_PACKAGE_NAME` | ⬜ | **Google Play (ADR-145).** The Android package name, e.g. the value chosen in `PLAY_CONSOLE_HANDOFF.md` step 2. **Unset today.** While unset, `isConfigured()` is false and every Play path refuses — no purchase can be granted. Setting it is what turns Play verification on. |
| `PLAY_SERVICE_ACCOUNT` | ⬜ | **Google Play (ADR-145).** Optional. Service-account JSON for `androidpublisher`. Falls back to `FIREBASE_SERVICE_ACCOUNT`, which is the documented setup — that account's email is the one invited to Play Console. Only set this if the two ever need to differ. |
| `PLAY_RTDN_SECRET` | ⬜ | **Google Play (ADR-146).** Shared secret in the Pub/Sub push endpoint's query string. **If unset the RTDN endpoint returns 500, never accepting a notification** — an unset secret is a closed door, not an open one. |
| `PLAY_RTDN_AUDIENCE` | ⬜ | **Google Play (ADR-146).** Optional. The push endpoint URL, used to verify Pub/Sub's OIDC token. Optional only because it cannot exist before the subscription does; once set it is enforced. |

### Firebase Service Account Format

Paste the entire JSON as a single line:

```
{"type":"service_account","project_id":"quant-reflex-trainer","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}
```

---

## Super Admin App (`super-admin-app/`)

Set in: Vercel Dashboard → `quantreflex-admin` project → Settings → Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_SERVICE_ACCOUNT` | ✅ | Firebase Admin SDK service account JSON (same as main app) |
| `CRON_SECRET` | ✅ | Bearer secret for the daily `/api/cron/sweep` |
| `NOTIFY_INTERNAL_SECRET` | ✅ | Must match the main app's value — it authenticates admin→main notification fan-out |
| `NOTIFY_ENDPOINT_URL` | ⬜ | Full URL of the main app's `/api/notify`. Falls back to `MAIN_APP_URL` + `/api/notify`. |
| `MAIN_APP_URL` | ⬜ | Main app origin, used to derive the notify endpoint when the above is unset |
| `OPENAI_ADMIN_KEY` | ⬜ | OpenAI **admin** key for org-level usage reporting in the AI Command Center. Read-only telemetry; absent = that panel is empty. |

> The Admin App uses the same Firebase project, so the same service account works.
> `CRON_SECRET` through `MAIN_APP_URL` were surfaced by the WS5/WS6 self-audit — used in code,
> documented nowhere.

---

## Coaching Admin App (`coaching-admin-app/`)

Set in: Vercel Dashboard → `quantreflex-coaching` project → Settings → Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_SERVICE_ACCOUNT` | ✅ | Firebase Admin SDK service account JSON |
| `NOTIFY_INTERNAL_SECRET` | ✅ | Must match the main app's value — authenticates coaching→main notification fan-out |
| `NOTIFY_ENDPOINT_URL` | ⬜ | Full URL of the main app's `/api/notify`. Falls back to `MAIN_APP_URL` + `/api/notify`. |
| `MAIN_APP_URL` | ⬜ | Main app origin, used to derive the notify endpoint when the above is unset |

---

## Not deployment variables

`LAYOUT_URL`, `LAYOUT_DIR`, `LAYOUT_LOCALES`, `LAYOUT_SCREENS`, `LAYOUT_THEMES`, `LAYOUT_VIEWPORTS`,
`PX_SHOTS_DIR` and `AP_LOCALES` appear in `main-app/scripts/dev/*` only. They configure local
px-diff/layout tooling and are **never read by deployed code**. Listed here so a future audit does not
mistake them for missing production configuration.

---

## Security Notes

1. **Never commit** `.env` files or service account keys to the repository
2. The `.gitignore` excludes all `.env*` files (except `.env.example`)
3. Client-side Firebase config keys (in `firebase.js`) are safe to expose — access is controlled by Firestore Security Rules
4. All server-side secrets are accessed via `process.env` in Vercel serverless functions
5. The Razorpay live key (`rzp_live_*`) in `paywall.js` is the **public** key — the secret is server-side only


---

## Google Play variables — how to read the ⬜ column

⬜ means **not set today, and that is correct.** The Play Console application does not exist yet
(see [PLAY_CONSOLE_HANDOFF.md](BIBLE/PLAY_CONSOLE_HANDOFF.md)), so these values cannot be created.

Nothing degrades while they are unset. `playBillingService.isConfigured()` reports false and every
consumer refuses: `verify-play` 503s, the RTDN endpoint 500s so Pub/Sub retries rather than losing a
notification, reconciliation no-ops, and the client shows Premium's value with no purchase control.
Razorpay on web/PWA is entirely unaffected.

**Never invent a value for any of these.** A guessed package name addresses a Google application that
does not exist; a guessed fingerprint verifies against nothing and silently degrades the Android app
to a browser tab. Absence is safe; a plausible wrong value is not.
