# Google Play setup — what you need to do, step by step

**Status:** steps 1–3 are DONE. Next action is **step 4** (create the two products).
**Last updated:** 2026-08-12

---

## Where you actually are

**Already done — confirmed by you:**

- ✅ **Step 1** — Play Console developer account created and identity-verified.
- ✅ **Step 2** — package name decided and **LOCKED**: `com.quantreflex.app`
- ✅ **Step 3** — the QuantReflex app entry exists in Play Console.

`com.quantreflex.app` is now built into QuantReflex as the canonical application id
(`main-app/services/playBillingService.js`). You do **not** need to enter it anywhere — a check in the
codebase refuses to let a second, different package name appear. It is immutable: Play binds an app to
its package name permanently.

**Still to do:** steps 4 through 10 below.

**Nothing is broken while you work through them.** Website and installed-app customers buy Premium
through Razorpay exactly as before, and the Android app cannot take money until you switch it on in
step 9.

**One rule that matters more than everything else here:** never invent or guess a value. If you are
unsure, stop and ask. A wrong fingerprint (step 7) does not show an error — it quietly turns the
Android app into a web browser, which would breach Google's payment policy and can get the app
removed. Leaving a value empty is always safe; guessing it is not.

---

## The order to do things in

Do these in order. Each one needs the one before it.

| # | Step | Where | How long |
|---|---|---|---|
| ~~1~~ | ~~Create the Play Console account~~ | — | ✅ **DONE** |
| ~~2~~ | ~~Decide the package name~~ — locked to `com.quantreflex.app` | — | ✅ **DONE** |
| ~~3~~ | ~~Create the app entry~~ | — | ✅ **DONE** |
| **4** | **Create the two products (₹299, ₹399)** ← **START HERE** | Play Console | 15 min |
| 5 | Turn on the Google API access | Google Cloud | 20 min |
| 6 | Build and upload the Android app | A tool called Bubblewrap | 45 min |
| 7 | Copy the signing fingerprint | Play Console → QuantReflex | 15 min |
| 8 | Set up refund notifications | Google Cloud | 30 min |
| 9 | Switch Play payments on | QuantReflex | 5 min |
| 10 | Test with a real purchase | Your phone | 30 min |

---

## Steps 1–3 — done

The account exists, the app entry exists, and the package name is locked to **`com.quantreflex.app`**.

Nothing further is needed from you here, and nothing about these can be changed now. If you ever see a
different package name anywhere in QuantReflex, that is a bug — tell me, because addressing the wrong
Google application makes every purchase fail with an error that looks exactly like an invalid receipt.

---

## Step 4 — Create the two Premium products

Play Console → **Monetise** → **Products** → **In-app products** → **Create product**

Make **two** products. The IDs must be typed **exactly** as shown — QuantReflex checks them against a
list on the server and rejects anything else, so a typo here means the purchase fails.

**Product 1**
- Product ID: `premium_6m`
- Name: `Premium · 6 Months`
- Description: `Unlimited practice, all modes, the full AI suite, Math Duel and deeper analytics for 6 months.`
- Price: **₹299**
- Status: **Active**

**Product 2**
- Product ID: `premium_12m`
- Name: `Premium · 12 Months`
- Description: `Unlimited practice, all modes, the full AI suite, Math Duel and deeper analytics for 12 months.`
- Price: **₹399**
- Status: **Active**

Two things to be careful about:

- These must be **in-app products**, not **subscriptions**. They are different menus in Play Console.
  QuantReflex sells one-time purchases that simply expire; it does not auto-renew. A subscription
  would charge your customers again automatically, which is not what they agreed to.
- The prices are **₹299 and ₹399**. Some older documents quoted the previously-shipped ₹349/₹499; that
  was a documentation error and has been corrected. ₹299 and ₹399 are the live prices.

**You'll know it worked when:** both products show **Active**, at ₹299 and ₹399.

---

## Step 5 — Turn on Google API access

This is what lets the QuantReflex server ask Google "was this purchase real?".

**5a. Find the service account email**

QuantReflex already uses a Google service account. Its email ends in
`...iam.gserviceaccount.com`. It is in your Vercel settings under `FIREBASE_SERVICE_ACCOUNT`, inside
the text, after `"client_email":`.

> If you can't find it, tell me and I'll point you at the exact spot.

**5b. Invite it to Play Console**

1. Play Console → **Users and permissions** → **Invite new users**
2. Email address: the service account email from 5a
3. Under **App permissions**, add QuantReflex, and tick:
   - **View financial data, orders, and cancellation survey responses**
   - **Manage orders and subscriptions**
4. **Invite user**

**5c. Enable the API**

1. Go to **https://console.cloud.google.com/apis/library/androidpublisher.googleapis.com**
2. Make sure the project selected at the top is the **same Firebase project** QuantReflex uses.
3. Click **Enable**.

**You'll know it worked when:** the service account appears in your Users list, and the API page says
"API enabled" rather than showing an Enable button.

---

## Step 6 — Build and upload the Android app

The Android app is a thin wrapper around the website — the same app, in a Play Store shell.

You need a computer for this step. If you don't have one, tell me and we'll find another way.

1. Install Node.js from https://nodejs.org (the LTS version)
2. Open a terminal and run: `npm install -g @bubblewrap/cli`
3. Run: `bubblewrap init --manifest https://www.quantreflex.app/manifest.json`
4. When it asks:
   - Package name → **the exact name you chose in step 2**
   - Application name → **QuantReflex**
   - Start URL → **`/?src=play`** ← *do not skip the `?src=play` part.* It is how the app tells
     QuantReflex it is running inside the Play app rather than a browser. Without it the app may
     offer the wrong payment method, which is the policy breach described at the top.
   - Signing key → let Bubblewrap create one. **Back up the file it creates and remember the
     password.** Losing it means never being able to update the app again.
5. Run: `bubblewrap build`
6. Play Console → **Testing** → **Internal testing** → **Create new release** → upload the
   `app-release-bundle.aab` file → **Save**, then **Review release** → **Start rollout**

**You'll know it worked when:** the release shows in Internal testing without errors.

---

## Step 7 — Copy the signing fingerprint ⚠️ THE CRITICAL ONE

1. Play Console → **Setup** → **App integrity** → **App signing** tab
2. Find the section headed **App signing key certificate**
3. Copy the **SHA-256 certificate fingerprint** — a long string of letters, numbers and colons

⚠️ **Take it from "App signing key certificate", NOT from "Upload key certificate".** They are both on
this page and they look identical. Google re-signs your app with its own key, so the upload key is the
wrong one — and using it fails **silently**: the Android app quietly becomes an ordinary browser tab
with a visible address bar, and would then offer the wrong payment method. This is the mistake that
gets apps removed from the Play Store.

> **Send me the fingerprint and your package name.** I will create the file Google needs to verify
> them, and a check in the codebase will refuse it if anything is malformed or looks like a
> placeholder. Please do not create this file yourself.

**You'll know it worked when:** after I publish the file, Google's tester at
https://developers.google.com/digital-asset-links/tools/generator reports **success** for
`https://www.quantreflex.app` and your package name. Check this **before** step 10.

---

## Step 8 — Set up refund notifications

This is how Google tells QuantReflex when a customer gets a refund, so Premium is switched off.

1. Go to **https://console.cloud.google.com/cloudpubsub/topic/list** (same project as step 5c)
2. **Create topic** → name it `play-rtdn` → **Create**
3. Open the topic → **Create subscription**:
   - Delivery type: **Push**
   - Endpoint URL: I will give you this — it contains a secret and must not be guessed
   - Enable authentication: **on**, and pick the same service account from step 5a
4. Copy the full topic name (it looks like `projects/your-project/topics/play-rtdn`)
5. Play Console → **Monetise** → **Monetisation setup** → paste it into
   **Google Cloud Pub/Sub topic name** → **Save**

> **If Google asks you to enable billing on Google Cloud:** stop and tell me. Pub/Sub may not be
> available on the free plan. This is not a blocker — QuantReflex has a backup that checks with Google
> once a day instead. Refunds would take up to 24 hours to switch Premium off rather than being
> instant. That is a trade-off for you to choose, not a bug.

**You'll know it worked when:** Play Console → Monetisation setup shows **Send test notification**,
and clicking it reports success.

---

## Step 9 — Switch Play payments on

Two things, both of which I do:

1. Add these settings in Vercel (I'll do this — I just need the values from you):
   - `PLAY_RTDN_SECRET` — I generate this; you don't supply anything
   - `PLAY_RTDN_AUDIENCE` — from step 8, only if you completed step 8
   - *(the package name needs no setting — `com.quantreflex.app` is built in)*
2. Turn on the switch: **Super Admin → Emergency Controls → `playBilling` → enable**

Until that switch is on, the Android app shows Premium's benefits with **no buy button** and the
Restore button still works. That is deliberate: it means you can publish and test the app safely
before switching payments on, and you can switch them off instantly if anything looks wrong.

---

## Step 10 — Test with a real purchase

1. Play Console → **Setup** → **License testing** → add your own Google account. This lets you make
   **real purchases without being charged**.
2. Install QuantReflex from the Internal testing link on your phone.
3. **Before buying, check:** the app must have **no address bar** at the top. If you can see one,
   step 7 went wrong — **stop and tell me**. Do not continue.
4. Buy Premium. Confirm it unlocks.
5. Play Console → **Orders** → refund that order. Within a few minutes (or 24 hours if you skipped
   step 8), Premium should switch off by itself.
6. Tap **Restore access** and confirm it behaves correctly.

**When all six pass, tell me** and I'll help you move from Internal testing to a public release.

---

## If something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| Address bar visible in the app | Step 7 fingerprint is wrong | **Stop.** Don't buy anything. Tell me. |
| "Purchasing isn't available in this version" | The `playBilling` switch is off, or the service account has no Play access | Step 9, then re-check step 5 |
| Purchase succeeds but Premium doesn't unlock | Step 5 permissions | Re-check 5b and 5c |
| Refund doesn't switch Premium off | Step 8 not done | Wait 24h — the backup should catch it. If not, tell me. |
| "This purchase is already linked to another account" | Working correctly | One purchase, one account. Expected. |

---

## What I need from you, in one list

1. Confirmation that the **two products** exist and are Active (step 4)
2. Confirmation that the **service account was invited** and the API enabled (step 5)
3. The **SHA-256 App Signing fingerprint** (step 7) — the single most important value
4. Whether **Pub/Sub needed billing** (step 8)
5. A yes when you're ready for me to **switch `playBilling` on** (step 9)

The package name is no longer on this list — it is locked and built in.

Everything else is already done and tested in the codebase.

---

## For the record — what is genuinely finished, and what is not

Stated separately on purpose, because "done" means two different things here.

**COMPLETE — CODE + AUTOMATED TESTS**
- Purchase verification against Google (`services/playBillingService.js`, `?action=verify-play`)
- Refund/void handling and reconciliation (`api/payment/play-rtdn.js`, `?action=play-reconcile`)
- The client Play adapter and reader-mode behaviour
- 143 automated assertions across `play-billing.check.js` and `play-rtdn.check.js`, every guard
  mutation-proved

**READY — EXTERNAL CONFIGURATION REQUIRED**
- All of the above is inert until steps 1–9 supply real values

**BLOCKED — REQUIRES A REAL PLAY ENVIRONMENT**
- No purchase, refund, notification or asset-link verification has **ever** run against the real
  Google Play Store. Everything is exercised against a controlled stub. Step 10 is the first time any
  of it meets reality, and it is the only thing that can promote this to production-certified.
