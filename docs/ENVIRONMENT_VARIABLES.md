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

> The Admin App uses the same Firebase project, so the same service account works.

---

## Coaching Admin App (`coaching-admin-app/`)

Set in: Vercel Dashboard → `quantreflex-coaching` project → Settings → Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_SERVICE_ACCOUNT` | ✅ | Firebase Admin SDK service account JSON |

---

## Security Notes

1. **Never commit** `.env` files or service account keys to the repository
2. The `.gitignore` excludes all `.env*` files (except `.env.example`)
3. Client-side Firebase config keys (in `firebase.js`) are safe to expose — access is controlled by Firestore Security Rules
4. All server-side secrets are accessed via `process.env` in Vercel serverless functions
5. The Razorpay live key (`rzp_live_*`) in `paywall.js` is the **public** key — the secret is server-side only
