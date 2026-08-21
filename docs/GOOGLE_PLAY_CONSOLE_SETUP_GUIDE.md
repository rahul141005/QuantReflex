# QuantReflex — Google Play Console Setup & Publishing Guide

**Written for you specifically.** Not a generic Play tutorial — every value below is the real value
this repository expects. Where it says "type this", it is because the code is already looking for
exactly that string.

**Console UI revised 2026-08-19** against screenshots of your own Play Console. Google renamed and
moved several sections since this guide was first written, and the old paths in it no longer exist.

Every step is labelled:

| Label | Meaning |
|---|---|
| **[CODE]** | Already done in the repository. Nothing for you to do. |
| **[YOU — PLAY CONSOLE]** | You do this at <https://play.google.com/console>. |
| **[YOU — EXTERNAL]** | You do this somewhere else (Vercel, Firebase, Google Cloud). |

And every navigation path is marked with how sure this document is about it:

| Mark | Meaning |
|---|---|
| ✅ | **Seen in your console.** This exact path/label was read off your screenshots. |
| ⚠️ | **Not seen.** The screenshots did not cover this screen. The path is the best available, but **read your own screen and trust it over this document.** |

That distinction matters. A guide that states a wrong menu path confidently costs more time than one
that admits it does not know, so nothing below is dressed up as verified when it is not.

**Three values that must never change.** If anything ever disagrees with these, stop and ask.

| Thing | Value |
|---|---|
| Play package / application ID | `com.quantreflex.app` |
| Website the app wraps | `https://www.quantreflex.app` |
| Prices | ₹299 (6 months) · ₹399 (12 months) |

---

## WHERE YOU ACTUALLY ARE — verified 2026-08-19

Read this before anything else. Several things this guide used to list as "to do" are already done,
and one thing it assumed was fine is **not**.

| Checked | Finding | Source |
|---|---|---|
| App exists, correct package | ✅ **QuantReflex** · `com.quantreflex.app` | Console screenshot |
| App availability | ✅ **Published** | *Advanced settings → App availability* |
| Unpublished changes | ✅ **None** — "You have no unpublished changes" | *Test and release* |
| Internal testing track | ✅ Live — release **"QuantReflex V2"**, 15 Aug 11:18 | *Test and release* |
| Closed testing track | ✅ Live — one track, **`alpha`**, release **"QuantReflex V2"**, 15 Aug 11:51 | *Test and release* |
| Legal pages deployed | ✅ All three return HTTP 200 and serve the real document | Fetched live, titles confirmed |
| Digital Asset Links | ✅ **Verified by Google on both hosts** — 4 fingerprints, 0 errors | Google's `statements:list` API |
| **In-app products** | 🔴 **NONE EXIST.** The One-time products table reads "No results". | *Monetise with Play → Products → One-time products* |
| Play Billing protection | 🟠 **0 of 4 services active** | *Protected with Play* |
| Play Integrity API | 🟠 **0 of 7 services active** | *Protected with Play* |
| Play Store protection | ✅ 6 of 7 services active | *Protected with Play* |
| Automatic protection | ✅ 1 of 1 service active | *Protected with Play* |
| Overall protection score | ✅ "Good protection" | *Protected with Play* |

### 🔴 The one blocker

**`premium_6m` and `premium_12m` do not exist in Play Console.** The One-time products list is empty.

Until they exist, Play Billing cannot work at all — not "works badly", *cannot start*. The client
asks Play for both product IDs before it will show any purchase UI, and if either one fails to
resolve it deliberately shows **no purchase path whatsoever** rather than falling back to Razorpay.
(That refusal is intentional and must not be "fixed": offering Razorpay for digital goods inside a
Play app is the one unrecoverable Play-policy violation. See `js/platform.js`.)

So a tester installing today's build sees Premium locked with no way to buy it. **Step 10 is the
thing to do first.**

---

## THE NAVIGATION MAP — old label → what it is called now

Google restructured the console. If you are following any older instructions (including earlier
copies of this file), translate through this table first.

| Older label | Current label | Verified? |
|---|---|---|
| Monetize / Monetise | **Monetise with Play** | ✅ |
| Monetise → Products → **In-app products** | Monetise with Play → Products → **One-time products** | ✅ |
| "Create product" | **Create one-time product** | ✅ |
| Grow | **Grow users** | ✅ |
| Quality | **Monitor and improve** | ✅ (the section name; its contents were not opened) |
| Test and release → **Setup** → App integrity | Test and release → **App integrity** — the "Setup" level is gone | ✅ |
| Setup → Advanced settings | Test and release → **Advanced settings** | ✅ |
| *(new)* | **Protected with Play** — a new top-level section | ✅ |

The console itself confirms the products rename: the One-time products page says *"One-time products
**(formerly in-app products)**"*.

**Top-level sections visible in your console, in order** ✅:
Dashboard · Statistics · Publishing overview · Protected with Play · Test and release ·
Monitor and improve · Grow users · Monetise with Play

**Sub-navigation under Test and release** ✅:
Latest releases and bundles · Production · Testing *(expandable)* · Pre-registration ·
App integrity · Advanced settings

**Sub-navigation under Monetise with Play** ✅:
Products *(→ App pricing · One-time products · Subscriptions)* · Merchandising and optimisation ·
Price experiments · Promo codes · Financial reports *(expandable)* · Monetisation setup

⚠️ **"Policy → App content" was not visible** in the screenshots — the left nav may simply have been
cut off below "Monetise with Play", or the section may have moved. Steps 4–7 need it. Look under
**Monitor and improve** and **Publishing overview** first, and use the console's own search box if
neither has it. Do not assume the old *Policy → App content* path still works.

**Deep links.** Your console URLs follow the pattern
`play.google.com/console/u/0/developers/<DEV_ID>/app/<APP_ID>/<page>` — read `<DEV_ID>` and
`<APP_ID>` out of your own address bar once and you can jump straight to any page. The page slugs
seen in your screenshots ✅: `protect-with-play`, `test-and-release`, `advanced-distribution`,
`monetize`, `one-time-products`.

---

## STEP 1 — Do not create a second app

**[YOU — PLAY CONSOLE]** ✅ already correct.

Play binds a package name to an app permanently. If you ever land on a screen offering to "create
app", you are in the wrong place — go back to **All apps** and click the existing **QuantReflex**.

---

## STEP 2 — Website deployed ✅ DONE

**[YOU — EXTERNAL: Vercel]** — **this is complete.** Verified 2026-08-19 by fetching each URL:

| URL | Status | Serves |
|---|---|---|
| `/legal/privacy.html` | 200 | *Privacy Policy — QuantReflex* |
| `/legal/terms.html` | 200 | *Terms of Use — QuantReflex* |
| `/legal/delete-account.html` | 200 | *Delete Your QuantReflex Account* |

All three return the real document rather than the app shell, which is exactly what Play's reviewers
and the account-deletion policy require.

**Re-check these after every deploy.** A Vercel rewrite change can start swallowing `/legal/*` into
the SPA, and the failure is silent — the URL still returns 200, it just returns the app.

### 🔴 But the deployed CODE is behind — and that is what decides the payment path

Verified 2026-08-20 by fetching the live origin: `https://quantreflex.app` serves **`APP_VERSION v283`**.
The repository is at **v285**.

This matters more than it looks. **The AAB is only a shell.** A Trusted Web Activity does not contain your
JavaScript — it loads `https://quantreflex.app` at launch, so the installed Play app runs whatever the
origin is serving *right now*, not whatever the repository says. Rebuilding the Android app changes
nothing about the app's behaviour; only a deploy does.

`v283` predates ADR-156, and in `v283` a Play build **loses** its Play verdict after any full-page
navigation — a settings change, a logout, a session expiry. `js/payments/gateway.js` answers a lost
verdict by selecting **Razorpay**, inside the Play app. That is the reported bug, and it is a deploy
problem, not a build problem.

**Order of operations, and it is not negotiable:**

1. **Deploy the current repository to `quantreflex.app` first.** Confirm with
   `curl -s https://quantreflex.app/service-worker.js | grep APP_VERSION` — it must read `v285` or later.
2. Only then build/upload the AAB (STEP 9), with the launch URL set per the note in that step.
3. Then create the two products (STEP 10) and enable the server switch (STEP 11).

Building before deploying produces an app that looks correct in Play Console and behaves wrongly on the
device, which is exactly what happened on the current internal-testing build.

---

## STEP 3 — Store listing

**[YOU — PLAY CONSOLE]** ⚠️ *Grow users → Store presence → Main store listing* — the section is now
**Grow users** ✅; its children were not opened.

| Field | What to enter |
|---|---|
| **App name** (30 chars) | `QuantReflex` |
| **Short description** (80 chars) | `Train speed aptitude — Quant, DI and Logical Reasoning for CAT, CET, IBPS, SSC.` |
| **Full description** (4000 chars) | See the block below — copy it whole. |
| **App icon** (512×512 PNG) | `main-app/icons/icon-512.png` from the repository. |
| **Feature graphic** (1024×500 PNG) | **You must create this.** Play will not let you publish without it. |
| **Phone screenshots** | Minimum 2, maximum 8. Take them on a real phone. |
| **Tablet screenshots** | Optional. Your app is offered for *Phones, Tablets, Chrome OS, Android…* ✅, so tablet shots do help those users find you. |

**Full description — copy this:**

```
QuantReflex trains the one thing timed aptitude exams actually test: speed under pressure.

Quant, Data Interpretation and Logical Reasoning — built for CAT, MAH-CET, IBPS, SSC and similar
competitive exams.

WHAT YOU GET FREE
• Daily timed practice across Quant, DI and LR
• Accuracy and speed tracking that shows where you actually lose marks
• Streaks, bookmarks and a mistake archive so errors stop repeating
• Learn modules covering the core topics

PREMIUM
• AI Coach — ask why an answer is what it is, and get a worked explanation
• Smart Planner — a study plan built from your own weak areas
• Insights — where your time goes, and which topics are costing you marks
• Full timed mock tests
• Complete Learn library
• Math Duels

Premium is a one-time purchase for a fixed period. Nothing renews automatically.
• 6 months — ₹299
• 12 months — ₹399

WHY SPEED
Most candidates know more than their score suggests. The gap is not knowledge — it is the seconds
lost per question. QuantReflex measures those seconds, shows you where they go, and trains them down.

Available in English, Hindi and Marathi.

QuantReflex is an independent study aid. It is not affiliated with or endorsed by any examination
body.
```

**Screenshots — how to take them:** you already have builds on the Internal and `alpha` tracks ✅,
so take them from the **installed app**, not from Chrome. That way the status bar and full-screen
chrome look exactly like what a user gets. Good ones: the practice screen mid-question, stats /
insights, the AI Coach answering something, the planner, the Learn library.

---

## STEP 4 — App content declarations

**[YOU — PLAY CONSOLE]** ⚠️ *App content* — **find this yourself**; see the note in the navigation
map. It was under *Policy → App content*, and "Policy" was not visible in your screenshots.

Work down the list. Here is what QuantReflex actually is, so you can answer honestly:

| Section | Answer | Why |
|---|---|---|
| **Privacy policy** | `https://www.quantreflex.app/legal/privacy.html` | ✅ Live and serving the real document. |
| **App access** | *All functionality is available without special access* — **unless** you want reviewers to see Premium. If so, choose "All or some functionality is restricted" and give them a test account. See the note below. | |
| **Ads** | **No**, the app contains no ads | True — there is no ad code anywhere. |
| **Content ratings** | Fill the questionnaire. Answer **No** to every violence/sexual/drug/gambling question. Category: **Reference, News, or Educational**. | You will get "Rated for 3+" or similar. |
| **Target audience** | **18 and over** (or 16+). Do **not** tick any age band under 13. | Ticking a child band triggers Families policy, a much heavier review. |
| **News app** | **No** | |
| **Data safety** | See Step 5 — this is the long one. | |
| **Government apps** | **No** | |
| **Financial features** | **No** | You sell your own app content. That is not a "financial feature" (that means loans, investments, crypto). |
| **Health** | **No** | |
| **Account deletion** | URL: `https://www.quantreflex.app/legal/delete-account.html`, and confirm the app also offers in-app deletion. | ✅ Both exist: the page (verified live), and Settings → Delete Account. |

**About "App access":** reviewers cannot buy Premium to test it — and right now nobody can, because
the products do not exist (Step 10). Create a real account on your live site, grant it Premium from
Super Admin, and give the reviewer those credentials:
- Instructions: `Sign in with the email and password below. This account already has Premium enabled so all features are visible.`
- Username / password: the account you made.

---

## STEP 5 — Data safety

**[YOU — PLAY CONSOLE]** ⚠️ *App content → Data safety*

Getting this wrong is one of the most common rejection reasons. Below is what QuantReflex genuinely
collects, taken from the code. Answer exactly this.

**Opening questions:**
- Does your app collect or share any of the required user data types? → **Yes**
- Is all of the user data collected by your app encrypted in transit? → **Yes**
- Do you provide a way for users to request that their data is deleted? → **Yes**

**Then tick these data types** (for every one: *Collected* = Yes, *Shared* = No, *Processed
ephemerally* = No, *Required or optional* as shown):

| Category | Data type | Required? | Purpose to tick |
|---|---|---|---|
| Personal info | **Name** | Optional | App functionality |
| Personal info | **Email address** | Required | App functionality; Account management |
| Personal info | **User IDs** | Required | App functionality; Account management |
| Financial info | **Purchase history** | Optional | App functionality |
| App activity | **App interactions** | Required | App functionality; Analytics |
| App activity | **Other user-generated content** | Optional | App functionality *(your AI questions and practice answers)* |
| App info & performance | **Crash logs** | Required | App functionality |
| App info & performance | **Diagnostics** | Required | App functionality |

**Do NOT tick:** location, contacts, photos/videos, audio, calendar, health, SMS, files, web
browsing history, installed apps, device IDs for advertising. QuantReflex collects none of them.

**Note on "Shared":** answer **No** for everything. Google's definition of "shared" means transfer to
a third party for *their own* use. Your service providers (Firebase, Vercel, OpenAI, Razorpay)
process data on your behalf, which Google classifies as processing, not sharing.

---

## STEP 6 — Privacy policy

**[CODE]** ✅ live at `/legal/privacy.html`, verified serving the real document.

**[YOU]** — read it once before submitting. It is written from what the code actually does, but you
are the one publishing it. Check specifically that you are happy with the contact address
(`quantreflex@gmail.com`) and the paragraph explaining that payment records are kept after account
deletion for tax purposes.

---

## STEP 7 — Account deletion

**[CODE]** ✅ both halves exist:
- in-app: **Settings → Delete Account** (asks for your password first),
- on the web: `https://www.quantreflex.app/legal/delete-account.html` (verified live).

**[YOU — PLAY CONSOLE]** ⚠️ enter that URL in *App content → Account deletion*.

---

## STEP 8 — Digital Asset Links ✅ DONE AND VERIFIED

This is the step that decides whether your app opens as an **app** or as a **browser tab**.
**It is complete.**

`main-app/.well-known/assetlinks.json` is deployed and lists **four** certificates for
`com.quantreflex.app`. Confirmed 2026-08-19 against Google's own authoritative verifier
(`digitalassetlinks.googleapis.com/v1/statements:list`, which is what Android actually consults):

| Host | Statements | Errors |
|---|---|---|
| `https://www.quantreflex.app` | 4 | none |
| `https://quantreflex.app` | 4 | none |

Four is correct, not excessive: a build signed by **any** listed certificate verifies, which is how
Play-signed production, the previous signing key, the post-quantum key and your upload key can all
open as a real TWA.

### If you ever need to add another fingerprint

**[YOU — PLAY CONSOLE]** ✅ *Test and release → **App integrity*** — note there is **no "Setup"
level any more**; App integrity sits directly under Test and release.

Find **"App signing key certificate"** → copy the **SHA-256 certificate fingerprint** (32 colon-
separated pairs).

> ⚠️ **Use the "App signing key certificate", NOT the "Upload key certificate".** They are two
> different fingerprints on the same page. Google re-signs every build with the app signing key, so
> an upload-key fingerprint alone verifies against nothing — and when verification fails, Android
> shows no error. It silently opens your app as a browser tab.

Then regenerate the file with **every** fingerprint you want trusted, in one command — the script
overwrites, it does not append:

```bash
cd main-app
node scripts/make-assetlinks.js <FP1> <FP2> <FP3> <FP4>
node scripts/assetlinks.check.js      # strict re-validation
```

The generator reads the package name out of `services/playBillingService.js` rather than letting you
retype it, and rejects all-zero, all-identical and filler values. Deploy, then re-run the verifier
above before trusting it.

### If the app opens with an address bar after a *correct* assetlinks.json

Android caches its verification verdict at **install** time. If a device installed the app while the
file was wrong, fixing the file does not retroactively fix that install. **Uninstall and reinstall**
on the device. This is not a code change and no new build is needed.

---

## STEP 9 — Build and upload the Android app (AAB)

**[YOU — EXTERNAL]**

There is no Android project in this repository and there does not need to be one — the app is
generated from your website. Use **PWABuilder**:

1. Go to <https://www.pwabuilder.com>.
2. Enter `https://www.quantreflex.app` and click **Start**.
3. **Package for stores** → **Android**.
4. Open **All settings** and check these exactly:
   - Package ID: `com.quantreflex.app`  ← **must match, character for character**
   - App name: `QuantReflex`
   - Launch URL: `/`
   - Display mode: `standalone`
   - **Signing key:** ⚠️ you already have a published app, so you must **re-use your existing upload
     keystore** — PWABuilder offers an option to supply your own key rather than generate one (the
     exact label was not verified for this guide; it is the option that is *not* "create new"). A
     build signed with a freshly generated key is rejected at upload: Play binds an app to its upload
     key, and re-signs every accepted build with the separate app signing key. If you have lost that
     keystore, do not guess — Play Console has an upload-key reset request, and that is the only
     route back.
5. Download the package. Inside the zip is `app-release-signed.aab` — that is the file Play wants.

**[YOU — PLAY CONSOLE]** ✅ *Test and release → Testing → Internal testing → Create new release* →
upload the `.aab`.

Version numbers: every upload must use a **higher** versionCode than the last. Your current releases
are both named **"QuantReflex V2"** ✅, so the next build must go above whatever versionCode those
carry — read it off the release page, do not guess.

### Two build-time notes

**Launch URL and `?src=play` — set this.** The web manifest's `start_url` is `/` and **must stay
`/`**: putting `?src=play` there would make every installed *web* PWA latch as a Play build and lose
its Razorpay option. The marker belongs on the **TWA launch URL** in the PWABuilder/bubblewrap Android
config — set it to **`/?src=play`**.

An earlier version of this guide called that optional, on the grounds that `js/platform.js` also
recognises and latches an `android-app://com.quantreflex.app` referrer. That is true, but it makes the
referrer the **only** Play marker the shipped build raises, and a launch document that arrives without
one resolves to `isPlayDistribution() === false` — which `js/payments/gateway.js` answers by selecting
**Razorpay inside the Play app**, the one unrecoverable Play-policy violation. The second marker costs
nothing and is set once at build time. Set it.

With both in place either one is sufficient, they are independent, and neither can be forged by a web
page.

### Edge-to-edge on Android 15 — two console warnings, and neither is yours to fix

*For your next release* raises two items against the QuantReflex V2 release:

> *"Edge-to-edge may not display for all users"* — apps targeting SDK 35+ display edge-to-edge by default
> and must handle insets.
>
> *"Your app uses deprecated APIs or parameters for edge-to-edge"*.

**They are live, not hypothetical.** Parsing the shipped `AndroidManifest.xml` out of the uploaded APKs:
`targetSdk=36`, `compileSdk=36`, `minSdk=23` (version codes 2 and 3 respectively). Above SDK 35, so
edge-to-edge is enforced.

**Warning 1 is already satisfied by the web app.** Measured, not assumed:

- `index.html` carries `viewport-fit=cover`, without which `env(safe-area-inset-*)` is always zero;
- `css/style.css` has **23** `env(safe-area-inset-*)` declarations;
- a differential occlusion test — render every surface twice, once with insets resolving to 0 and once
  with them forced to 48px, then walk `elementFromPoint` across both bar regions looking for interactive
  controls — finds **zero** controls under either system bar on Home, Practice, Stats, Learn, Settings,
  a live drill with the numpad up, the pause overlay, the results card, the paywall sheet and a
  full-screen info modal;
- `<meta name="theme-color">` exists and is rewritten on theme change, which is the modern mechanism
  Chrome uses to tint the system bars.

**Warning 2 cannot be fixed from this repository.** The deprecated calls are `setStatusBarColor`,
`setNavigationBarColor` and `getStatusBarColor`, and they are in `com.google.androidbrowserhelper.trusted.*`
— Google's own TWA support library, which PWABuilder bundles. The only Android classes carrying our
package name are the three bubblewrap generates from templates (`Application`, `DelegationService`,
`LauncherActivity`); we author no Android code at all. Confirmed by scanning `classes.dex` in both APKs:
identical findings in each.

**Neither blocks a release.** Both sit in *For your next release*, which is advisory. The practical
effect on Android 15+ is that the deprecated colour calls are ignored, so the system bars go transparent
and the page shows through behind them — and because the CSS insets its content, nothing important is
hidden; the bar area simply paints the page background instead of the theme colour.

**If you want the second warning gone**, the only route is to tick *Include source code* in PWABuilder,
raise the `com.google.androidbrowserhelper` dependency in `app/build.gradle` to a version that has
migrated off those APIs, and rebuild with Gradle rather than PWABuilder — then re-test on a device.
Otherwise wait for PWABuilder to ship a newer helper. Do not lower `targetSdk` to silence it: Play
requires 35+ for new apps, so that trades an advisory warning for a rejected upload.

**Still worth doing on a device:** open a drill and the results card on an Android 15+ phone and confirm
nothing hides behind the status or navigation bars. The test above is strong evidence, but it runs in
desktop Chromium with synthetic insets, not on a real device.

---

## STEP 10 — 🔴 Create the two products (DO THIS FIRST)

**[YOU — PLAY CONSOLE]** ✅ *Monetise with Play → Products → **One-time products** → **Create
one-time product***

**Verified 2026-08-19: this table is empty — "No results".** Neither product exists. This is the one
thing standing between you and a working purchase.

You need **exactly two**, and the IDs must match the code character for character. The server refuses
any product ID it does not recognise (`services/playBillingService.js`), so a typo here means
purchases fail with "unknown product".

| Product ID (type exactly) | Name | Description | Price |
|---|---|---|---|
| `premium_6m` | `QuantReflex Premium — 6 Months` | `Full access to AI Coach, Planner, Insights, mock tests and the complete Learn library for 6 months.` | **₹299** |
| `premium_12m` | `QuantReflex Premium — 12 Months` | `Full access to AI Coach, Planner, Insights, mock tests and the complete Learn library for 12 months.` | **₹399** |

Set both to **Active**. Draft products do not resolve.

### The create form is a two-step wizard ✅

**① Product details — ② Availability and pricing.** The field that matters to the code lives on
**step ①**, and step ② has a trap.

| Field | Step | 6-month | 12-month |
|---|---|---|---|
| **Product ID** — *this is the SKU the code matches* | ① | `premium_6m` | `premium_12m` |
| **Purchase option ID** — internal only, users never see it | ② | `buy-6m` | `buy-12m` |
| **Purchase type** | ② | **Buy** *(not Rent — "Buy" is the default)* | **Buy** |
| **Tags** | ② | leave empty | leave empty |

> 🔴 **The Purchase option ID cannot be `premium_6m`.** The console's own hint on that field reads:
> *"Must start with a number or lowercase letter, and can contain numbers, lowercase letters and
> hyphens."* **No underscores** — so the string will be rejected. Do not "fix" it by typing
> `premium-6m` and assuming that is now the SKU. It is not. The SKU is the **Product ID** on step ①,
> and a mismatch here is invisible until purchases fail.

**Why the Product ID is the one that matters**, traced end to end:
`js/payments/play-provider.js:53` declares `SKUS = ['premium_6m', 'premium_12m']`, hands them to
`QRPlatform.canUsePlayBilling(SKUS)` → `getDetails(SKUS)` and matches on `itemId`; the purchase is
launched with `data: { sku: planType }`; and the server verifies at
`…/products/{productId}/tokens/{purchaseToken}` (`services/playBillingService.js`). Nothing anywhere
in the codebase reads a purchase-option id or an offer token — grep-verified, zero matches.

### Availability and pricing (step ②)

The region table opens with every country **Available** at price `–`. It will not activate in that
state. Two workable choices:

- **Sell in India only** — narrow it under **Edit availability and access**, then price that one row.
  Simplest, and it matches the audience.
- **Sell everywhere** — use **Set prices** and let Play convert from an INR base.

**Selling outside India is safe on the server side**, and this was checked rather than assumed:
`api/payment.js:324` records a Play grant with `currency: 'INR'` and **deliberately no
`amountPaise`** — the entitlement is granted by *duration*, not by amount, so a foreign-currency
purchase still grants correctly. So it is a product decision, not a technical constraint. Worth
knowing: the Razorpay path is INR-only, so Play is the only way an overseas user could ever pay you.

> ⚠️ **One thing this guide cannot confirm.** How the new purchase-option model surfaces through the
> Digital Goods API was not verifiable from outside your console. The code matches
> `itemId === 'premium_6m'`, which is the product ID. If both products are Active and the app still
> shows no purchase option, that is the first thing to investigate — capture what `getDetails`
> actually returns before changing any code.

**Both, not one.** If only one resolves, the client shows **no purchase UI at all** rather than a
half catalogue — deliberately, so a customer can never be sold the plan you happened to configure
instead of the one they chose (`js/platform.js`, `canUsePlayBilling`).

**One-time products, *not* Subscriptions.** QuantReflex Premium is a one-time purchase for a fixed
period — the code has no renewal logic, and listing it as a subscription would promise auto-renewal
that does not happen. The console offers **Subscriptions** as a sibling menu item ✅; do not use it.

> You do not need to look for a "consumable" setting — the current console does not have one.
> Consumability is decided by the app, and the server already consumes each purchase after granting
> it, which is what lets a customer buy again when their 6 or 12 months run out.

The new console wraps each product in **purchase options and offers** ✅ (the list's last column is
"Active purchase options and offers"). Create the plain one-time purchase option at the price above.
You do not need regional pricing or promotional offers for launch — but whatever you create, the
**Product ID** must remain exactly `premium_6m` / `premium_12m`, because that is the string the
server matches on.

**After creating both, verify from the app, not from the console:** install from Internal testing,
open the upgrade sheet, and confirm it shows ₹299 and ₹399. If it shows nothing, one of the two IDs
does not match.

---

## STEP 11 — Connect the server to Google

**[YOU — PLAY CONSOLE]** ⚠️ *Users and permissions → Invite new user* (account-level, not inside the
app; not covered by the screenshots)

1. Get your Firebase service-account email: Firebase Console → ⚙️ Project settings → **Service
   accounts** → it looks like `firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com`.
2. Invite that email as a user on the QuantReflex app.
3. Give it permissions: **View financial data** and **Manage orders and subscriptions**.

**[YOU — EXTERNAL: Google Cloud]** — enable the API the server calls. The code requests the scope
`https://www.googleapis.com/auth/androidpublisher` and calls
`androidpublisher.googleapis.com/androidpublisher/v3/applications` (`services/playBillingService.js`),
so this is not optional:
<https://console.cloud.google.com/apis/library/androidpublisher.googleapis.com> → select your
Firebase project → **Enable**.

**[YOU — EXTERNAL: Firebase Console]** — turn the feature on:
Firestore Database → collection `config`, document ID `playBilling`, one boolean field
`enabled` = `true`.

Until you do that last step the app will not offer Play purchases at all. That is deliberate — it is
the switch that lets you turn Play Billing off instantly if anything goes wrong, without a deploy.
The reader (`api/_lib/config-flags.js`) caches for 30 seconds, so allow up to half a minute for a
change to take effect, and note it **defaults to off**: a missing document means disabled.

Two practical notes verified against the current code:

- **There is no Super Admin control for this flag.** `super-admin-app/api/admin/system.js` exposes
  `config-get`/`config-set` for exactly three keys — `maintenance`, `aiKillSwitch`,
  `paymentKillSwitch` — and `playBilling` is not among them. The Firebase Console is the only place
  to switch it. (`config/playBilling` also has no Firestore rule, so the default deny applies and no
  client can read or write it. The server uses the Admin SDK, which bypasses rules.)
- **You do not need to reinstall or force-quit the app after switching it on.** Once the flag is on,
  re-open the Premium sheet and the purchase button appears: `js/payments/play-provider.js` re-probes
  a server "not yet" rather than memoising it (ADR-169), and `js/paywall.js` injects the CTA when
  readiness turns true. Before ADR-169 the first "no" was final for the life of the page, so the app
  had to be force-quit — if you tested earlier and saw a stubborn "Purchasing isn't available", that
  was this.

---

## STEP 12 — Refund notifications (do this, or refunds go unnoticed)

**[YOU — EXTERNAL: Vercel]** first — add an environment variable:
- Name: `PLAY_RTDN_SECRET`
- Value: a long random string you invent (30+ characters, letters and numbers).
- Then redeploy.

> If this variable is not set, the endpoint refuses everything (`api/payment/play-rtdn.js`). That is
> intentional: an unset secret is a locked door, not an open one.

**[YOU — EXTERNAL: Google Cloud]**
1. <https://console.cloud.google.com/cloudpubsub/topic/list> → **Create topic** → name it
   `play-rtdn`.
2. Open the topic → **Create subscription**:
   - Delivery type: **Push**
   - Endpoint URL: `https://quantreflex.app/api/payment/play-rtdn?key=YOUR_SECRET_FROM_ABOVE`
     (apex, **no `www`** — an earlier version of this guide said `www`. Both origins currently
     serve the API so either works today, but Pub/Sub push does **not** follow redirects, so if
     you ever make one origin canonical this URL must already point at the surviving one.)
3. On the topic's **Permissions** tab, grant
   `google-play-developer-notifications@system.gserviceaccount.com` the role **Pub/Sub Publisher**.

**Four subscription settings that are not the console defaults.** The defaults are wrong for this
endpoint in ways that fail silently rather than loudly:

| Setting | Set it to | Why |
|---|---|---|
| **Expiration period** | **Never expire** | The default expires the subscription after **31 days of inactivity**. A new app can easily go 31 days without a refund — the subscription is then deleted and refunds stop being processed, with no error anywhere. This is the one that will bite you months from now. |
| **Acknowledgement deadline** | **60 seconds** | The default is 10 s. The handler makes an `androidpublisher` round-trip plus Firestore reads/writes and is declared at `maxDuration: 15` (ADR-172), so 10 s can expire while the first attempt is still working — Pub/Sub then redelivers on top of it. |
| **Retry policy** | **Retry after exponential backoff delay** | "Retry immediately" turns a transient Firestore or Google blip — which the handler correctly answers with a 500 — into a hot loop against your own function. |
| **Enable payload unwrapping** | **leave OFF** | `_decode` reads `body.message.data` and base64-decodes it. Unwrapping strips that envelope, `_decode` returns null, and **every notification is silently ignored** as `no_known_notification`. |

**`Enable authentication` and `PLAY_RTDN_AUDIENCE` are one switch, not two.** `_authenticate` requires a
Bearer token *only when* `PLAY_RTDN_AUDIENCE` is set. So:

- Audience unset + authentication unchecked → shared secret only. Works.
- Audience **set** + authentication **unchecked** → **every notification 401s.** Broken.
- Audience set + authentication checked (audience = the full push URL) → both factors. Best.

If you turn one on, turn on the other, and prefer this order: tick **Enable authentication** in
Pub/Sub first, then add `PLAY_RTDN_AUDIENCE` in Vercel and redeploy. That ordering never leaves a
window where notifications are rejected.

**When you rotate `PLAY_RTDN_SECRET`, change it in BOTH places** — the Vercel variable *and* the `?key=`
on this push endpoint URL — and redeploy. They are compared directly; a mismatch 401s everything.

**[YOU — PLAY CONSOLE]** ✅ *Monetise with Play → **Monetisation setup*** → Real-time developer
notifications → paste `projects/YOUR-PROJECT-ID/topics/play-rtdn` → **Send test notification** → it
must succeed.

Why bother: this is how you find out when Google refunds someone. Without it, a refunded customer
keeps Premium until the backup sweep catches it.

### The backup sweep needs one more variable — `CRON_SECRET`

`vercel.json` declares two daily cron jobs, and the payment one is the safety net that finishes any
Play purchase whose verification was interrupted (it grants, acknowledges and consumes orphaned
purchases — `api/payment.js` `_playReconcile`, scheduled `0 3 * * *`):

```
/api/payment?action=play-reconcile   03:00 UTC daily
/api/duel?action=cron-sweep          02:00 UTC daily
```

Both authenticate on `Authorization: Bearer <CRON_SECRET>`, and both return **500 for every run**
while the variable is unset — so the safety net is simply not running.

**[YOU — EXTERNAL: Vercel]** Settings → Environment Variables → add `CRON_SECRET` = another long
random string, then redeploy. Vercel attaches the header to its own cron calls automatically once the
variable exists; there is nothing to configure on the schedule itself.

Why this matters more than it sounds: without it, a purchase whose `verify-play` call hit a Google
outage stays unacknowledged, and Google **auto-refunds an unacknowledged purchase after three days**.
The customer pays, loses Premium, and gets refunded days later with no explanation.

---

## STEP 13 — Protected with Play (new section)

**[YOU — PLAY CONSOLE]** ✅ *Protected with Play*

This section did not exist when this guide was written. Your current state, read off the page:

| Service | State | Action |
|---|---|---|
| Automatic protection — *prevent unofficial installs* | ✅ **1 of 1 active** | Nothing. |
| Play Store protection — *distribute safe apps* | ✅ **6 of 7 active** | Expand it and see what the 7th is; probably worth turning on. |
| **Play Billing protection** — *protect your business from fraud and abuse* | 🟠 **0 of 4 active** | **Turn this on once Step 10 exists.** |
| **Play Integrity API** — *detect security threats and risky devices* | 🟠 **0 of 7 active** | Optional. See below. |

Overall score reads **"Good protection"** ✅.

**Play Billing protection** is the one that matters to you, because you are about to start taking
money. Do Step 10 first — protecting a catalogue that does not exist achieves nothing — then come
back and enable it.

**Play Integrity API is optional for this app, and enabling it naively can hurt.** Integrity verdicts
are consumed by *your own* server code, and nothing in this repository requests or checks one. The
real protection against a forged purchase here is server-side: every purchase token is verified
against Google's `androidpublisher` API before any entitlement is granted, and the package name is
pinned. Turning Integrity on without writing code to act on its verdicts adds no security, and
turning on its stricter device checks can block legitimate users on rooted or unusual devices. Leave
it until you have a reason.

---

## STEP 14 — Internal testing

**[YOU — PLAY CONSOLE]** ✅ *Test and release → Testing → Internal testing* — already has a release,
**"QuantReflex V2"** (15 Aug 11:18).

1. **Testers** tab → **Create email list** → add your own Gmail address → Save.
2. **Releases** tab → your uploaded build → **Review release** → **Start rollout**.
3. Copy the **opt-in URL**, open it on your phone, accept, then install from Play.

**Test these, in this order:**

| # | Test | What must happen |
|---|---|---|
| 1 | Open the app | Full screen, **no address bar**. If an address bar appears despite Step 8 being verified, **uninstall and reinstall** — Android caches the verdict from install time. |
| 2 | Sign in | Works, and your existing progress is there. |
| 3 | Tap a Premium feature | The upgrade sheet appears showing ₹299 and ₹399. **Blocked until Step 10.** |
| 4 | Buy the 6-month plan | Google's payment sheet appears (says "Google Play", shows ₹299). |
| 5 | Complete the purchase | Premium unlocks. Super Admin shows the payment with provider `play`. |
| 6 | Open the website on your laptop, same account | Premium is active there too. |
| 7 | Ask Google for a refund | Premium is removed within a few minutes (with Step 12 done). |

> **Test purchases are free** for accounts on your internal-testing list, provided your Gmail is
> added under **License testing** ⚠️ — an *account-level* setting (outside the app), not seen in the
> screenshots. Add it there before test 4, or you will be charged real money.

**Also test the Super Admin path**, since it is how you will support customers: grant a test account
Premium from Super Admin, then open the Android app signed in as that account. Premium must be active
**without any Play purchase**. That is by design — an admin grant is an entitlement in its own right,
and Play Billing is only one purchase route.

---

## STEP 15 — Closed testing

**[YOU — PLAY CONSOLE]** ✅ *Test and release → Testing → Closed testing* — you already have **one
track, `alpha`**, carrying **"QuantReflex V2"** (15 Aug 11:51). Reached via **"View all tracks (1)"**.

A **personal** Google Play developer account must run a closed test before it can apply for
production access. As Google has stated the requirement: at least **12 testers** who opt in, running
**continuously for 14 days**.

> Google has changed these numbers before (it was 20 testers for a while). **Read the exact
> requirement on your own closed-testing page** and follow that number, not this document.

If your developer account is registered as an **organisation** rather than a person, this may not
apply. Your console will say.

**How to do it:**
1. Add an email list with your 12+ testers' Gmail addresses to the `alpha` track. Real people —
   friends, classmates, coaching students. They must each actually opt in and install.
2. Promote your tested build to the track.
3. Send them the opt-in link. Ask them to genuinely use the app over the two weeks — Google looks at
   whether the testing was real.
4. Do not remove testers during the 14 days; the clock resets.

⚠️ Because the `alpha` track already has a 15 Aug release, check whether your 14-day clock has
already started — the page shows the current status.

---

## STEP 15b — Associated developer accounts (account-level, one-off)

**[YOU — PLAY CONSOLE]** *Account-level → Associated developer accounts → Manage account group*

Not part of the QuantReflex build and unrelated to billing — it is an account declaration Play asks
every developer to complete, and it can gate production access. Two yes/no questions, both about **you**,
not about the app. **Save stays greyed out until both are answered.**

**"Does your legal entity own any other Play Console developer accounts?"**
Other *Play developer* accounts — the kind you pay the one-off registration fee for — owned by the same
person or company. Not other Google accounts, not other apps inside this account. If this developer
account is the only one you or your company holds, the answer is No.

**"Are there any other developer accounts that publish apps that use similar brand features to the apps
in your developer account?"**
Apps published from a *different* developer account that share your branding — same or near-same name,
logo, colour scheme, or store presence. A co-founder shipping a "QuantReflex Lite" from their own
account would be a Yes. Unrelated apps that merely happen to be exam-prep are not.

**Why it matters, and which way to err.** Google uses this to link accounts under one owner, mostly to
stop a terminated developer opening a fresh account. Declaring an account you do own costs nothing — its
admins simply get a request to accept, and correctly-declared groups are routine. Failing to declare one
is an account-linking policy problem, and enforcement there applies across every linked account. So if
an account exists and you are unsure whether it counts, declare it.

---

## STEP 16 — Apply for production access

**[YOU — PLAY CONSOLE]** ✅ *Test and release → Production → Apply for production access*

After the 14 days, a form appears asking about your app, who tested it, and what you learned. Answer
in plain sentences — mention the tester feedback you actually got and the changes you made. Google
reviews it manually; it typically takes a few days.

---

## STEP 17 — Production release

**[YOU — PLAY CONSOLE]** ✅ *Test and release → Production → Create new release* → promote your
tested build → **Start rollout to production**.

Start with a **staged rollout of 20%** rather than 100%. If something is wrong you can halt it. Raise
it over a few days.

**App availability** ✅ is already **Published** (*Test and release → Advanced settings → App
availability*). That tab is also where you would **Unpublish** in an emergency — the button is on
that page. The other tabs there ✅ are Form factors · Managed Google Play · Play as you download ·
Operator targeting · App Actions · App indexing, and more behind the ▸ arrow. You do not need any of
them for launch.

---

## STEP 17b — Getting paid (this is NOT Razorpay's bank account)

**[YOU — PLAY CONSOLE]** *Account-level → Payments profile*

Razorpay and Google Play settle on completely separate rails. Razorpay pays into the bank account
configured in the Razorpay dashboard. Google Play pays into a **Google payments profile**, which is set
once at account level and has nothing to do with Razorpay. Nothing in this repository configures it and
nothing in this repository can check it.

**Verified 2026-08-21 from the console:** the profile exists (`KRISHNA A BAJAJ`) with **two** payments
accounts, both INR:

| Payments account | Scope |
|---|---|
| Google Play Apps · `…6580` | **Cross border** |
| Google Play Apps · `…0576` | **India only** |

**Two accounts is correct, not a duplicate.** Google splits payments for India-based sellers: sales to
buyers in India settle through the *India only* account, sales to buyers outside India through the
*Cross border* one. Do not delete either. For QuantReflex — INR pricing, an Indian exam-prep audience —
essentially all revenue will land in *India only*, but a single purchase by someone abroad goes to
*Cross border*, so both need to be able to pay out.

**What still has to be true before money can reach you**, on **each** payments account (open it →
*Settings*):

- a **bank account** added and verified — an unverified account accrues a balance that simply never pays out;
- **tax details** complete for the profile — incomplete tax info holds payouts even when the bank is fine.

**Payout cadence.** Monthly, around the 15th, for the previous calendar month, and only once the balance
clears the minimum payout threshold shown on the payments account — below it, the balance rolls forward.
Google's service fee is deducted first (15% of the first USD 1M of annual earnings for most developers,
30% above that).

Google is the merchant of record for Play sales in India and handles buyer-side GST. That is **not** the
same as your own tax position on the earnings — take that to an accountant rather than to this guide.

---

## STEP 17c — Seller verification (India: carried out by a third party, not by Google directly)

**[YOU — EXTERNAL]** Before Play will pay out, the seller behind the payments profile has to be
verified. In India that is handled by partners rather than inside Play Console itself — this account
was taken through **`connect.billdesk.com`**, with an eSign step alongside it. The exact partner and
screen order can differ; the substance below does not.

**No code involvement whatsoever.** This is identity and business verification for the payouts in
STEP 17b. `js/payments/gateway.js` has exactly two adapters, `razorpay` and `play`, and none of this
adds a third.

**The one form worth getting right** asks for the website and app you want payments enabled on:

| Field | What to enter |
|---|---|
| Website URL | `https://quantreflex.app` — apex, no `www`, and **no `?src=play`** |
| APP Name | `QuantReflex` |
| Mobile App APK URL | The public listing `https://play.google.com/store/apps/details?id=com.quantreflex.app` **only once production is live** — it 404s while the app is in internal testing. If the field is mandatory before then, give the internal-testing opt-in link (*Testing → Internal testing → Testers → Copy link*) and say the app is pending production review. A dead link is worse than a blank field. |

🔴 **Never put `?src=play` in a URL you hand to a third party.** It is the marker that makes
`js/platform.js` classify the document as a Play build, which suppresses Razorpay by design — so a
reviewer opening `https://quantreflex.app/?src=play` sees *"Purchasing isn't available in this version
of the app yet"* and no checkout at all. That marker belongs in exactly one place: the TWA launch URL
inside the Android build.

**A reviewer seeing Razorpay on the website is fine.** Play's requirement is that digital purchases
*inside the Android app* go through Play Billing; selling the same product on your own site with your
own processor is permitted. The violation would be an alternative billing path reachable from inside
the Play app, and there is none — `payment-facade.check.js` asserts that no code path leads from a Play
verdict to the Razorpay adapter.

---

## STEP 18 — After launch

**[YOU — PLAY CONSOLE]**, check weekly at first:

| Where | What you are looking for |
|---|---|
| ⚠️ *Monitor and improve* → Android vitals → Crashes and ANRs *(section name ✅; children not opened)* | Crash rate near zero. A TWA rarely crashes; a spike means the website broke. |
| ✅ *Monetise with Play → Financial reports* | Purchases arriving. Cross-check against Super Admin's revenue figure. |
| ⚠️ *Grow users* → Ratings and reviews *(section ✅)* | Reply to reviews. It measurably helps ranking. |
| ⚠️ *App content* | Any policy warning — deal with it immediately, they have deadlines. |
| ✅ *Protected with Play* | The service counters. A number dropping means something got switched off. |
| ✅ *Publishing overview* | "You have no unpublished changes" — anything else means a change is stuck awaiting review. |
| Super Admin → payments | Any payment stuck at `pending`, or any row in `paymentOrphans`. |

**Whenever you change the website, the app changes too** — it wraps the live site. You only need a
new AAB upload if you change the package, the icon, the launch URL, or the app name.

---

# THE CHECKLIST

Ticked items were **verified on 2026-08-19**, either in your console screenshots or by fetching the
live site.

### Developer account
- [x] Verification complete
- [ ] Contact information verified ⚠️
- [ ] Payment profile configured ⚠️ *(required before you can be paid)*

### Website
- [x] Deployed
- [x] `/legal/privacy.html` serves *Privacy Policy — QuantReflex*
- [x] `/legal/terms.html` serves *Terms of Use — QuantReflex*
- [x] `/legal/delete-account.html` serves *Delete Your QuantReflex Account*

### QuantReflex app
- [x] Package `com.quantreflex.app`
- [x] App availability: **Published**
- [x] No unpublished changes
- [ ] Store listing (name, descriptions, icon, feature graphic, 2+ screenshots)
- [ ] Privacy policy URL entered
- [ ] Data safety form completed
- [ ] App content declarations completed
- [ ] Target audience set to 18+ (no under-13 band)
- [ ] Account deletion URL entered
- [ ] Content rating questionnaire completed

### Billing — 🔴 the blocking group
- [ ] 🔴 Product `premium_6m` created at ₹299, Active — **confirmed absent**
- [ ] 🔴 Product `premium_12m` created at ₹399, Active — **confirmed absent**
- [ ] Firebase service account invited with financial + order permissions
- [ ] `androidpublisher` API enabled in Google Cloud
- [ ] Firestore `config/playBilling` → `enabled: true`
- [ ] `PLAY_RTDN_SECRET` set in Vercel and redeployed
- [ ] Pub/Sub topic + push subscription created, test notification succeeds
- [ ] Play Billing protection enabled *(0 of 4 active)*
- [ ] Purchase verification tested end to end
- [ ] Entitlement confirmed on web **and** Android for the same account

### Asset links
- [x] AAB uploaded (Internal + `alpha`, "QuantReflex V2", 15 Aug)
- [x] `assetlinks.json` deployed with 4 fingerprints
- [x] Verified by Google on `www.quantreflex.app` — 4 statements, 0 errors
- [x] Verified by Google on `quantreflex.app` — 4 statements, 0 errors
- [ ] App confirmed to open with **no address bar** on a fresh install

### Release
- [x] Internal testing track live
- [x] Closed testing track `alpha` live
- [ ] Internal testing: all 7 tests pass *(3–7 blocked on products)*
- [ ] Required number of testers opted in *(check your own console for the number)*
- [ ] 14 continuous days elapsed
- [ ] Production access applied for and granted
- [ ] Production release rolled out

### Cross-platform
- [ ] Website — Premium works
- [ ] Installed web app — Premium works
- [ ] Android app — Premium works
- [ ] Super Admin grant works on **all three** with no purchase
- [ ] Super Admin shows plan, source, expiry and payment history

---

# WHAT TO DO NEXT

The order changed, because Steps 2 and 8 are now done and one new blocker appeared.

1. 🔴 **Create the two one-time products.** *Monetise with Play → Products → One-time products →
   Create one-time product.* `premium_6m` at ₹299 and `premium_12m` at ₹399, both **Active**.
   Nothing about purchasing can be tested until both exist. *(Step 10)*
2. **Connect the server**: invite the Firebase service account, enable `androidpublisher`, set
   `config/playBilling` → `enabled: true`. *(Step 11)*
3. **Set `PLAY_RTDN_SECRET` in Vercel**, create the Pub/Sub topic and subscription, point Play at it,
   send the test notification. *(Step 12)*
4. **Enable Play Billing protection** now that there is a catalogue to protect. *(Step 13)*
5. **Add your Gmail to License testing**, then install from Internal testing and run all 7 tests —
   especially the address-bar check on a **fresh** install. *(Step 14)*
6. **Finish the store listing**: feature graphic, screenshots from the installed app, descriptions.
   *(Step 3)*
7. **Fill in App content and Data safety.** *(Steps 4–7)*
8. **Check the `alpha` track's 14-day clock**, recruit the required testers, run the closed test.
   *(Step 15)*
9. **Apply for production access**, then roll out at 20%. *(Steps 16–17)*

Steps 1–4 are the ones that actually unblock things. Everything after step 5 is paperwork and
waiting.

---

## If something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| **No purchase option at all in the app** | One or both products missing — **this is your current state** | Step 10. Both must exist and be Active; the client refuses a half catalogue on purpose. |
| App shows an address bar | Verification failed, **or** the device cached a failed verdict from install time | Asset links are verified server-side. **Uninstall and reinstall.** If it persists, re-check Step 8. |
| "Unknown product" on purchase | Product ID typo | Must be exactly `premium_6m` and `premium_12m`. |
| Razorpay appears inside the Play app | The build is not identifying itself as Play | Should not happen: `js/platform.js` latches an `android-app://com.quantreflex.app` referrer for the tab's life. If you ever see it, **stop and report it** — it is a policy violation, not a cosmetic bug. |
| Play purchase option missing on a correct build | `config/playBilling` not enabled, or service account not connected | Step 11. Remember the 30-second cache and that a missing document means **off**. |
| "Item already owned" | The purchase was not consumed | The server does this automatically. If it persists, check `payments` for a row with `consumed: false`. |
| Purchase succeeds, Premium does not unlock | Verification failed | Check Vercel logs for `PLAY_VERIFY`. The purchase is recorded either way and the hourly sweep completes it. |
| Refund does not remove Premium | RTDN not configured | Step 12. The backup sweep still catches it within a day. |
| Premium works on web but not Android | Different account, or entitlement not refreshed | Confirm the same email, then use **Restore Purchase** on the upgrade screen. |
| A menu path in this guide does not exist | Google moved it again | Use the console's search box. Then update this file's navigation map so the next person does not lose the same hour. |

---

*Companion documents: `docs/BIBLE/PLAY_CONSOLE_HANDOFF.md` (technical detail),
`docs/BIBLE/PAYMENT_ARCHITECTURE.md` (how payments work),
`docs/ENVIRONMENT_VARIABLES.md` (every server variable).*
