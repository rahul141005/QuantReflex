# QuantReflex — Google Play Console Setup & Publishing Guide

**Written for you specifically.** Not a generic Play tutorial — every value below is the real value
this repository expects. Where I say "type this", it is because the code is already looking for
exactly that string.

Every step is labelled:

| Label | Meaning |
|---|---|
| **[OPUS/CODE]** | Already done in the repository. Nothing for you to do. |
| **[ME — PLAY CONSOLE]** | You do this at <https://play.google.com/console>. |
| **[ME — EXTERNAL]** | You do this somewhere else (Vercel, Firebase, Google Cloud). |

**Three values that must never change.** If anything ever disagrees with these, stop and ask.

| Thing | Value |
|---|---|
| Play package / application ID | `com.quantreflex.app` |
| Website the app wraps | `https://www.quantreflex.app` |
| Prices | ₹299 (6 months) · ₹399 (12 months) |

---

## STEP 1 — Where you already are

**[OPUS/CODE] + [ME — PLAY CONSOLE, done]**

- ✅ Google Play developer account created and identity-verified.
- ✅ The QuantReflex app already exists in Play Console with package `com.quantreflex.app`.
- ✅ All the server code for Play Billing is written, tested and merged.

**Do NOT create a second app.** Play binds a package name to an app permanently. If you ever see a
screen offering to "create app", you are in the wrong place — go back to **All apps** and click the
existing **QuantReflex**.

---

## STEP 2 — Deploy the website first (this blocks everything else)

**[ME — EXTERNAL: Vercel]**

This is the single most important prerequisite, and it is currently **not done**. The live site is
running an older build than this branch.

Why it blocks everything: the Android app is a *Trusted Web Activity* — a wrapper around your real
website. Google verifies the link between the app and the website by fetching a file from your
domain. If the deployed site does not serve that file correctly, the app silently opens as a browser
tab with an address bar instead of as an app — and a browser tab showing Razorpay inside a Play app
is the one Play policy violation that gets an app removed.

1. Merge this branch into your main branch.
2. Let Vercel deploy it.
3. Check it worked — open these three URLs in a browser:
   - <https://www.quantreflex.app/legal/privacy.html> → must show the **Privacy Policy**, not the app.
   - <https://www.quantreflex.app/legal/terms.html> → must show the **Terms**.
   - <https://www.quantreflex.app/legal/delete-account.html> → must show the **deletion page**.

If any of those shows the QuantReflex app instead of the document, the deploy has not gone through
yet. Wait and retry. **Do not continue until all three show the right page.**

---

## STEP 3 — Store listing

**[ME — PLAY CONSOLE]** → *QuantReflex → Grow → Store presence → Main store listing*

| Field | What to enter |
|---|---|
| **App name** (30 chars) | `QuantReflex` |
| **Short description** (80 chars) | `Train speed aptitude — Quant, DI and Logical Reasoning for CAT, CET, IBPS, SSC.` |
| **Full description** (4000 chars) | See the block below — copy it whole. |
| **App icon** (512×512 PNG) | Use `main-app/icons/icon-512.png` from the repository. |
| **Feature graphic** (1024×500 PNG) | **You must create this.** It is the banner at the top of your listing. Play will not let you publish without it. Canva has free templates — search "Google Play feature graphic". |
| **Phone screenshots** | Minimum 2, maximum 8. Take them on a real phone. See below. |
| **Tablet screenshots** | Optional. Skip unless you want tablet users to find you. |

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

**Screenshots — how to take them:** open <https://www.quantreflex.app> on your Android phone in
Chrome → menu → **Add to Home screen** → open it from the home screen (it now runs full-screen with
no address bar) → take normal screenshots. Good ones to capture: the practice screen mid-question,
your stats/insights page, the AI Coach answering something, the planner, and the Learn library.

---

## STEP 4 — App content declarations

**[ME — PLAY CONSOLE]** → *QuantReflex → Policy → App content*

Work down the list. Here is what QuantReflex actually is, so you can answer honestly:

| Section | Answer | Why |
|---|---|---|
| **Privacy policy** | `https://www.quantreflex.app/legal/privacy.html` | Created in this branch. Must be live first (Step 2). |
| **App access** | *All functionality is available without special access* — **unless** you want reviewers to see Premium. If so, choose "All or some functionality is restricted" and give them a test account. See the note below. | |
| **Ads** | **No**, the app contains no ads | True — there is no ad code anywhere. |
| **Content ratings** | Fill the questionnaire. Answer **No** to every violence/sexual/drug/gambling question. Category: **Reference, News, or Educational**. | You will get "Rated for 3+" or similar. |
| **Target audience** | **18 and over** (or 16+). Do **not** tick any age band under 13. | The app is for exam candidates. Ticking a child band triggers Families policy, which is a much heavier review. |
| **News app** | **No** | |
| **COVID-19 contact tracing** | **No** | |
| **Data safety** | See Step 5 — this is the long one. | |
| **Government apps** | **No** | |
| **Financial features** | **No** | You sell your own app content. That is not a "financial feature" (that means loans, investments, crypto). |
| **Health** | **No** | |
| **Account deletion** | URL: `https://www.quantreflex.app/legal/delete-account.html` and confirm the app also offers in-app deletion. | Both exist now: the page, and Settings → Delete Account. |

**About "App access":** reviewers cannot buy Premium to test it. Create a real account on your live
site, then use Super Admin to grant it Premium, and give the reviewer those credentials. Fill in:
- Instructions: `Sign in with the email and password below. This account already has Premium enabled so all features are visible.`
- Username / password: the account you made.

---

## STEP 5 — Data safety

**[ME — PLAY CONSOLE]** → *Policy → App content → Data safety*

This is a long form, and getting it wrong is one of the most common reasons for rejection. Below is
what QuantReflex genuinely collects, taken from the code. Answer exactly this.

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
a third party for *their own* use. Your service providers (Firebase, Vercel, OpenAI, Razorpay) process
data on your behalf, which Google classifies as processing, not sharing.

---

## STEP 6 — Privacy policy

**[OPUS/CODE]** — written and live at `/legal/privacy.html` once Step 2 is deployed.

**[ME]** — read it once before submitting. It is written from what the code actually does, but you
are the one publishing it. Check specifically that you are happy with: the contact address
(`quantreflex@gmail.com`), and the paragraph explaining that payment records are kept after account
deletion for tax purposes.

---

## STEP 7 — Account deletion

**[OPUS/CODE]** — both halves exist:
- in-app: **Settings → Delete Account** (asks for your password first),
- on the web: `https://www.quantreflex.app/legal/delete-account.html`.

**[ME — PLAY CONSOLE]** — enter that URL in *Policy → App content → Account deletion*.

---

## STEP 8 — Digital Asset Links (the app↔website handshake)

This is the step that decides whether your app opens as an **app** or as a **browser tab**.

### 8a. Get your app's signing fingerprint **[ME — PLAY CONSOLE]**

You can only do this after you have uploaded a build once (Step 9), so come back here then.

*QuantReflex → Test and release → Setup → App integrity → App signing* → find
**"App signing key certificate"** → copy the **SHA-256 certificate fingerprint**.

It looks like `AB:CD:12:...` — 32 pairs of characters separated by colons.

> ⚠️ **Use the "App signing key certificate", NOT the "Upload key certificate".** They are two
> different fingerprints on the same page. Google re-signs every build with the app signing key, so
> the upload key fingerprint verifies against nothing — and when verification fails, Android does not
> show an error. It silently opens your app as a browser tab. That is the failure mode this whole
> step exists to prevent.

### 8b. Give me the fingerprint **[ME → then OPUS/CODE]**

Send me that fingerprint and I will create `main-app/.well-known/assetlinks.json` and deploy it.

I have deliberately **not** created that file with a made-up value. A fabricated fingerprint is a
well-formed 64-character string that looks completely correct in review and verifies against nothing —
it would produce exactly the silent browser-tab failure above. `assetlinks.check.js` in the repository
refuses any placeholder fingerprint for that reason.

### 8c. Verify it **[ME]**

After I deploy, open:
`https://developers.google.com/digital-asset-links/tools/generator`
Enter hosting site `https://www.quantreflex.app`, package `com.quantreflex.app`, and your
fingerprint. It must say the link is verified.

---

## STEP 9 — Build and upload the Android app (AAB)

**[ME — EXTERNAL]**

There is no Android project in this repository, and there does not need to be one — the app is
generated from your website. Use **PWABuilder**, which needs no software installed:

1. Go to <https://www.pwabuilder.com>.
2. Enter `https://www.quantreflex.app` and click **Start**.
3. Click **Package for stores** → **Android**.
4. Open **All settings** and check these exactly:
   - Package ID: `com.quantreflex.app`  ← **must match, character for character**
   - App name: `QuantReflex`
   - Launch URL: `/`
   - Display mode: `standalone`
   - **Signing key: "Create new"** for your very first build. Download the `.zip` it gives you and
     **keep the keystore file and its passwords somewhere safe and backed up.** If you lose it you
     cannot ever update the app under this package name.
5. Download the package. Inside the zip is `app-release-signed.aab` — that is the file Play wants.

**[ME — PLAY CONSOLE]** → *Test and release → Testing → Internal testing → Create new release* →
upload the `.aab`.

Version numbers: PWABuilder starts at versionCode 1. Every later upload must use a **higher**
versionCode than the last — Play rejects a repeat.

---

## STEP 10 — Create the two products

**[ME — PLAY CONSOLE]** → *QuantReflex → Monetise → Products → In-app products → Create product*

You need **exactly two**, and the IDs must match the code character for character. The server refuses
any product ID it does not recognise, so a typo here means purchases fail with "unknown product".

| Product ID (type exactly) | Name | Description | Price |
|---|---|---|---|
| `premium_6m` | `QuantReflex Premium — 6 Months` | `Full access to AI Coach, Planner, Insights, mock tests and the complete Learn library for 6 months.` | **₹299** |
| `premium_12m` | `QuantReflex Premium — 12 Months` | `Full access to AI Coach, Planner, Insights, mock tests and the complete Learn library for 12 months.` | **₹399** |

Set both to **Active**.

Choose **In-app products**, *not* Subscriptions. QuantReflex Premium is a one-time purchase for a
fixed period — the code has no renewal logic, and listing it as a subscription would promise
auto-renewal that does not happen.

> You do not need to look for a "consumable" setting — newer Play Console versions do not have one.
> Consumability is decided by the app, and the server already consumes each purchase after granting
> it, which is what lets a customer buy again when their 6 or 12 months run out.

---

## STEP 11 — Connect the server to Google

**[ME — PLAY CONSOLE]** → *Users and permissions → Invite new user*

1. Get your Firebase service-account email: Firebase Console → ⚙️ Project settings → **Service
   accounts** → it looks like `firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com`.
2. Invite that email as a user on the QuantReflex app.
3. Give it permissions: **View financial data** and **Manage orders and subscriptions**.

**[ME — EXTERNAL: Google Cloud]** — enable the API the server calls:
Go to <https://console.cloud.google.com/apis/library/androidpublisher.googleapis.com>, select your
Firebase project, click **Enable**.

**[ME — EXTERNAL: Firebase Console]** — turn the feature on:
Firestore Database → create a document at collection `config`, document ID `playBilling`, with one
field: `enabled` (boolean) = `true`.

Until you do that last step the app will not offer Play purchases at all. That is deliberate — it is
the switch that lets you turn Play Billing off instantly if anything goes wrong, without a deploy.

---

## STEP 12 — Refund notifications (do this, or refunds go unnoticed)

**[ME — EXTERNAL: Vercel]** first — add an environment variable:
- Name: `PLAY_RTDN_SECRET`
- Value: a long random string you invent (30+ characters, letters and numbers).
- Then redeploy.

> If this variable is not set, the notification endpoint refuses everything. That is intentional: an
> unset secret is a locked door, not an open one.

**[ME — EXTERNAL: Google Cloud]**
1. <https://console.cloud.google.com/cloudpubsub/topic/list> → **Create topic** → name it
   `play-rtdn`.
2. Open the topic → **Create subscription**:
   - Delivery type: **Push**
   - Endpoint URL:
     `https://www.quantreflex.app/api/payment/play-rtdn?key=YOUR_SECRET_FROM_ABOVE`
3. On the topic's **Permissions** tab, grant `google-play-developer-notifications@system.gserviceaccount.com`
   the role **Pub/Sub Publisher**.

**[ME — PLAY CONSOLE]** → *Monetise → Monetisation setup → Real-time developer notifications* →
paste the topic name:
`projects/YOUR-PROJECT-ID/topics/play-rtdn` → **Send test notification** → it should succeed.

Why bother: this is how you find out when Google refunds someone. Without it, a refunded customer
keeps Premium for up to a day until the backup sweep catches it — and if that sweep is not running,
forever.

---

## STEP 13 — Internal testing (just you)

**[ME — PLAY CONSOLE]** → *Test and release → Testing → Internal testing*

1. **Testers** tab → **Create email list** → add your own Gmail address → Save.
2. **Releases** tab → your uploaded build → **Review release** → **Start rollout**.
3. Copy the **opt-in URL**, open it on your phone, accept, then install from Play.

**Test these, in this order:**

| # | Test | What must happen |
|---|---|---|
| 1 | Open the app | Full screen. **No address bar.** If you see an address bar, asset links failed — go back to Step 8. |
| 2 | Sign in | Works, and your existing progress is there. |
| 3 | Tap a Premium feature | The upgrade sheet appears showing ₹299 and ₹399. |
| 4 | Buy the 6-month plan | Google's payment sheet appears (it says "Google Play" and shows ₹299). |
| 5 | Complete the purchase | Premium unlocks. Check Super Admin — the payment appears with provider `play`. |
| 6 | Open the website on your laptop, same account | Premium is active there too. |
| 7 | Ask Google for a refund | Premium is removed within a few minutes (with Step 12 done). |

> **Test purchases are free** for accounts on your internal-testing list, as long as you add your
> Gmail under *Setup → License testing* in Play Console. Add it there before test 4.

**Also test the Super Admin path**, since it is how you will support customers: grant a test account
Premium from Super Admin, then open the Android app signed in as that account. Premium must be active
**without any Play purchase**. This works by design — an admin grant is an entitlement in its own
right, and Play Billing is only the purchase route.

---

## STEP 14 — Closed testing (Google requires this)

**[ME — PLAY CONSOLE]** → *Test and release → Testing → Closed testing*

Since November 2023, a **personal** Google Play developer account must run a closed test before it can
apply for production access. The requirement as Google currently states it:

- **at least 12 testers** who **opt in**, and
- they must stay opted in and the test must run **continuously for 14 days**.

> Google has changed these numbers before (it was 20 testers for a while). **Read the exact
> requirement on your own Play Console screen** — it is shown right there on the closed-testing page —
> and follow that number, not this document.

If your developer account is registered as an **organisation** rather than a person, this step may not
apply. Your Play Console will say.

**How to do it:**
1. Create a closed testing track and an email list with your 12+ testers' Gmail addresses. Real
   people — friends, classmates, coaching students. They must each actually opt in and install.
2. Promote your tested build to the closed track.
3. Send them the opt-in link. Ask them to install it and genuinely use the app now and then over the
   two weeks — Google looks at whether the testing was real.
4. Do not remove testers during the 14 days; the clock resets.

---

## STEP 15 — Apply for production access

**[ME — PLAY CONSOLE]** → *Test and release → Production → Apply for production access*

After the 14 days, a form appears asking about your app, who tested it, and what you learned. Answer
in plain sentences — mention the tester feedback you actually got and any changes you made. Google
reviews it manually; it typically takes a few days.

---

## STEP 16 — Production release

**[ME — PLAY CONSOLE]** once production access is granted:
*Test and release → Production → Create new release* → promote your tested build → **Start rollout to
production**.

Start with a **staged rollout of 20%** rather than 100%. If something is wrong you can halt it. Raise
it over a few days.

---

## STEP 17 — After launch

**[ME — PLAY CONSOLE]**, check weekly at first:

| Where | What you are looking for |
|---|---|
| *Quality → Android vitals → Crashes and ANRs* | Crash rate should be near zero. A TWA rarely crashes; a spike means the website broke. |
| *Monetise → Financial reports* | Purchases arriving. Cross-check against Super Admin's revenue figure. |
| *Grow → Ratings and reviews* | Reply to reviews. It measurably helps ranking. |
| *Policy → App content* | Any policy warning — deal with it immediately, they have deadlines. |
| Super Admin → payments | Any payment stuck at `pending`, or any row in `paymentOrphans`. |

**Whenever you change the website, the app changes too** — it wraps the live site. You only need a new
AAB upload if you change the package, the icon, the launch URL, or the app name.

---

# THE CHECKLIST

### Developer account
- [x] Verification complete
- [ ] Contact information verified
- [ ] Payment profile configured *(Monetise → Payments profile — required before you can be paid)*

### Website (blocks everything)
- [ ] This branch merged and deployed
- [ ] `/legal/privacy.html` loads the policy, not the app
- [ ] `/legal/terms.html` loads
- [ ] `/legal/delete-account.html` loads

### QuantReflex app
- [x] Package `com.quantreflex.app`
- [ ] Store listing (name, descriptions, icon, feature graphic, 2+ screenshots)
- [ ] Privacy policy URL entered
- [ ] Data safety form completed
- [ ] App content declarations completed
- [ ] Target audience set to 18+ (no under-13 band)
- [ ] Account deletion URL entered
- [ ] Content rating questionnaire completed

### Billing
- [ ] Product `premium_6m` created at ₹299, Active
- [ ] Product `premium_12m` created at ₹399, Active
- [ ] Firebase service account invited to Play Console with financial + order permissions
- [ ] `androidpublisher` API enabled in Google Cloud
- [ ] Firestore `config/playBilling` → `enabled: true`
- [ ] `PLAY_RTDN_SECRET` set in Vercel and redeployed
- [ ] Pub/Sub topic + push subscription created, test notification succeeds
- [ ] Purchase verification tested end to end
- [ ] Entitlement confirmed on web **and** Android for the same account

### Asset links
- [ ] First AAB uploaded
- [ ] SHA-256 **app signing** fingerprint copied from Play Console
- [ ] Fingerprint sent to me, `assetlinks.json` deployed
- [ ] Verified with Google's Statement List tester
- [ ] App opens with **no address bar**

### Release
- [ ] AAB generated
- [ ] Internal testing done, all 7 tests pass
- [ ] Closed testing track live
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

# WHAT I SHOULD DO NEXT

In this order. Do not skip ahead — each step needs the one before it.

1. **Merge this branch and deploy it.** Then check the three `/legal/` URLs load. *(Step 2)*
2. **Write the store listing** and create the feature graphic. Take 2–5 screenshots on your phone. *(Step 3)*
3. **Fill in App content and Data safety** using the tables above. *(Steps 4–7)*
4. **Create the two products** — `premium_6m` at ₹299, `premium_12m` at ₹399. *(Step 10)*
5. **Connect the server**: invite the Firebase service account, enable `androidpublisher`, and set
   `config/playBilling` → `enabled: true` in Firestore. *(Step 11)*
6. **Set `PLAY_RTDN_SECRET` in Vercel**, create the Pub/Sub topic and subscription, and point Play at
   it. *(Step 12)*
7. **Build the AAB with PWABuilder** and upload it to Internal testing. **Back up the keystore.** *(Step 9)*
8. **Copy the SHA-256 app signing fingerprint and send it to me.** I will add `assetlinks.json`. *(Step 8)*
9. **Install from Internal testing and run the 7 tests.** The address-bar check is the important one. *(Step 13)*
10. **Start closed testing.** Recruit your testers, check your console for the exact number required. *(Step 14)*
11. **Wait out the 14 days**, then apply for production access. *(Step 15)*
12. **Roll out to production at 20%**, then raise it. *(Step 16)*

**Steps 1–7 you can do today.** Step 8 needs step 7 first. Everything from step 10 onward is mostly
waiting.

---

## If something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| App shows an address bar | Asset links not verified | Step 8. Check you used the **app signing** fingerprint, not the upload key. |
| "Unknown product" on purchase | Product ID typo | The IDs must be exactly `premium_6m` and `premium_12m`. |
| No Play purchase option in the app | `config/playBilling` not enabled, or service account not connected | Step 11. |
| "Item already owned" | The purchase was not consumed | The server does this automatically. If it persists, tell me — check `payments` for a row with `consumed: false`. |
| Purchase succeeds, Premium does not unlock | Verification failed | Check Vercel logs for `PLAY_VERIFY`. The purchase is recorded either way and the hourly sweep will complete it. |
| Refund does not remove Premium | RTDN not configured | Step 12. The backup sweep still catches it within a day. |
| Premium works on web but not Android | Different account, or entitlement not refreshed | Confirm the same email. Then use **Restore Purchase** on the upgrade screen. |

---

*Companion documents: `docs/BIBLE/PLAY_CONSOLE_HANDOFF.md` (technical detail),
`docs/BIBLE/PAYMENT_ARCHITECTURE.md` (how payments work),
`docs/ENVIRONMENT_VARIABLES.md` (every server variable).*
