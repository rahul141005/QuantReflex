# Firebase Setup Guide for Quant Reflex Trainer

This guide walks you through setting up Firebase Authentication and Firestore for the Quant Reflex Trainer PWA.

---

## Prerequisites

- A Google account
- A web browser

---

## Step 1: Create a Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project**.
3. Enter a project name (e.g., `quant-reflex-trainer`).
4. Optionally enable Google Analytics, then click **Create project**.
5. Once created, click **Continue**.

---

## Step 2: Register a Web App

1. In the Firebase Console, click the **Web** icon (`</>`) to add a web app.
2. Enter an app nickname (e.g., `Quant Reflex Trainer`).
3. Optionally check **Also set up Firebase Hosting**.
4. Click **Register app**.
5. Firebase will display your config object. It looks like this:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};
```

6. Copy these values into `js/firebase.js`, replacing the existing `firebaseConfig` object.

---

## Step 3: Enable Firebase Authentication

1. In the Firebase Console sidebar, click **Build → Authentication**.
2. Click **Get started**.
3. Under **Sign-in method**, click **Email/Password**.
4. Enable the **Email/Password** toggle.
5. Click **Save**.

> **Note:** The app relies on email and password for authentication.


---

## Step 4: Create the Firestore Database

1. In the Firebase Console sidebar, click **Build → Firestore Database**.
2. Click **Create database**.
3. Choose a location closest to your users (e.g., `asia-south1` for India).
4. Select **Start in test mode** for development (you will tighten rules in Step 5).
5. Click **Enable**.

---

## Step 5: Set Up Firestore Security Rules

For production, update the Firestore rules to restrict access. Go to **Firestore Database → Rules** and set:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own documents
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      // Subcollections (e.g., practiceSessions) inherit the same rule
      match /{subcollection=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }

    // Deny access to all other collections
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### Security Rules Explanation

| Rule | Purpose |
|------|---------|
| `request.auth != null` | Only authenticated users can access the database |
| `request.auth.uid == userId` | Users can only access their own documents |
| `match /{subcollection=**}` | Applies the same rule to all subcollections (e.g., `practiceSessions`) |
| `match /{document=**} allow: false` | Denies access to any collection not explicitly allowed |

### Best Practices for Scaling

- **Separate growing data into subcollections:** Practice sessions are stored in `users/{userId}/practiceSessions/{sessionId}` to prevent the main user document from becoming too large.
- **Limit document size:** Firestore documents have a 1 MB size limit. Keep arrays (like `mistakes`, `responseTimes`) capped.
- **Use batch writes:** The app uses debounced batch writes to minimize Firestore write operations.
- **Enable offline persistence:** Already enabled in the app code for PWA support.

### Deploying Rules Safely

1. Test rules in the Firebase Console **Rules Playground** before deploying.
2. Use the Firebase CLI for version-controlled deployments:
   ```bash
   firebase deploy --only firestore:rules
   ```
3. Monitor rule evaluation in **Firestore → Usage** to detect issues.
4. Never use `allow read, write: if true` in production.

---

## Step 6: Enable Offline Persistence

Offline persistence is already enabled in the app code (`js/firebase.js`). Firestore will automatically:

- Cache data locally for offline access
- Queue writes made while offline
- Sync data when the connection is restored

No additional setup is needed.

---

## Step 7: Verify the Setup

1. Open the app in a browser.
2. You should see the login screen.
3. Create an account with an email and password.
4. Open the browser Developer Tools → Console — no Firebase errors should appear.
5. Go to the Firebase Console → Authentication → Users — you should see your new account.
6. Go to Firebase Console → Firestore Database → Data — you should see a document under the `users` collection with your user UID.

---

## Firestore Database Structure

```
users/
  └── {userId}/                      (Firebase Auth UID)
        ├── profile
        │     ├── name               (display name)
        │     └── createdAt          (account creation date)
        ├── settings
        │     ├── darkMode           (boolean)
        │     ├── sound              (boolean)
        │     ├── vibration          (boolean)
        │     ├── difficulty         (string: easy/medium/hard)
        │     └── dailyGoal          (number)
        ├── stats
        │     ├── totalAttempted     (number)
        │     ├── totalCorrect       (number)
        │     ├── bestStreak         (number)
        │     ├── currentStreak      (number)
        │     ├── dailyStreak        (number)
        │     ├── categoryStats      (map: category → {attempted, correct})
        │     ├── responseTimes      (array of numbers)
        │     └── dailyHistory       (map: date → {attempted, correct})
        ├── quickLinks               (array of selected quick link IDs)
        ├── customTopics             (array of user-created topic objects)
        ├── customFormulas           (map: topicId → array of formula objects)
        ├── bookmarks                (array of bookmarked formula IDs)
        │
        └── practiceSessions/        (subcollection)
              └── {sessionId}/
                    ├── mode         (string)
                    ├── category     (string, optional)
                    ├── score        (number)
                    ├── total        (number)
                    ├── duration     (number)
                    ├── date         (string)
                    └── timestamp    (string, ISO 8601)
```

---

## How Authentication Works

- Users create an account with an **email** and **password**.
- Firebase Authentication handles password hashing and session management.
- Login persists across browser sessions using Firebase Auth's `LOCAL` persistence.
- If browser data is cleared, users can log in again and all their data is restored from Firestore.
- A **Logout** button is available in the Settings tab.

---

## Data Synchronization

The app uses a hybrid storage strategy:

1. **App launch** → Load cached data from localStorage immediately → Render UI
2. **Background sync** → Load data from Firestore → Update localStorage cache
3. **Data changes** → Write to localStorage immediately → Queue Firestore update (debounced 2s)
4. **Drill mode** → Defer Firestore writes until drill ends → Flush all updates at once

This ensures the UI is always fast while data stays synchronized.

---

## Data Recovery

If localStorage is cleared (e.g., user clears browser data):

1. User logs in again with their email and password.
2. All data is automatically reloaded from Firestore.
3. localStorage cache is rebuilt.
4. No progress is lost.

---

## In-App Data Clearing

Users can clear their data through the Settings tab:

| Option | What it clears |
|--------|---------------|
| **Clear Statistics** | Resets all progress, streaks, and performance history |
| **Clear Formulas & Tips** | Deletes custom topics and added formulas |
| **Clear Entire App Data** | Resets everything: settings, stats, formulas, bookmarks |

Data clearing requires confirmation to prevent accidental deletion.
The user account is never deleted — only app data is cleared.

---

## Troubleshooting

| Issue | Solution |
|---|---|
| Firebase not initializing | Check that the Firebase SDK scripts load before `firebase.js` in `index.html` |
| Console says "Firebase not configured" | Verify `firebaseConfig` values in `js/firebase.js` |
| Login fails with "Authentication service not available" | Ensure `firebase-auth-compat.js` is loaded in `index.html` |
| Account creation fails | Verify Email/Password sign-in is enabled in Firebase Console → Authentication |
| Firestore writes failing | Check Firestore rules in the Firebase Console |
| Offline mode not working | Ensure only one tab is open (multi-tab persistence requires `synchronizeTabs: true`, which is already enabled) |
| Data not syncing | Check network connectivity and Firestore Console for the user document |

---

## Firebase SDK Version

The app uses Firebase JavaScript SDK **v10.12.2** (compat build) loaded via CDN:

```html
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
```

The compat build is used for maximum browser compatibility with the vanilla JavaScript architecture.

---

## Granting Premium manually (v2)

> The normal way to grant Premium is the **Super Admin app** (`/api/admin/entitlements`), which writes
> the canonical `users/{uid}.plan` field **and** the JWT claim. Use the script below only for a one-off
> manual grant. In v2 the JWT `premium` claim is a fast-path optimization — the **source of truth is the
> Firestore `plan` field**, so the script must set both.

### Step 1: Get Your Firebase Service Account Key

To modify user claims securely, you need "Admin" access to your Firebase project.

1. Go to your [Firebase Console](https://console.firebase.google.com/).
2. Select your **QuantReflex** project.
3. Click the **Gear icon** ⚙️ next to "Project Overview" in the top left and select **Project settings**.
4. Go to the **Service accounts** tab.
5. Make sure **Node.js** is selected, and click the **Generate new private key** button.
6. This will download a JSON file (it looks like `your-project-id-firebase-adminsdk-xxxxx.json`).
7. **Keep this file safe.** Do not share it or commit it to GitHub. Move it to a secure folder on your computer (for example, right next to the script we are about to create, and rename it to `serviceAccountKey.json`).

### Step 2: Set Up the Node.js Script

You will need Node.js installed on your computer.

1. Open your terminal (or Command Prompt / PowerShell on Windows).
2. Create a new folder for this script and go into it:
   ```bash
   mkdir firebase-claims-admin
   cd firebase-claims-admin
   ```
3. Initialize a new Node project and install the Firebase Admin SDK:
   ```bash
   npm init -y
   npm install firebase-admin
   ```
4. Move the `serviceAccountKey.json` you downloaded in Step 1 into this folder.

### Step 3: Write the Script

Create a new file in that folder called `setPremium.js` and paste the following code:

```javascript
// setPremium.js
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// 1. Initialize the Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// 2. The UID of the user you want to grant Premium to
// You can find this UID in the "Authentication" tab of your Firebase Console.
const targetUid = 'PASTE_THE_USER_UID_HERE';
const planType = 'premium_12m'; // 'premium_6m' | 'premium_12m'
const days = planType === 'premium_12m' ? 365 : 182;

async function grantPremium() {
  try {
    console.log(`Granting Premium (${planType}) to user: ${targetUid}...`);

    // 3a. Source of truth — write the canonical plan fields to Firestore
    const expiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    await admin.firestore().collection('users').doc(targetUid).set({
      plan: 'premium', planType, planExpiry: expiry, planSource: 'admin',
      isTrial: false, trialEnd: null,
      planUpdatedAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    }, { merge: true });

    // 3b. Fast-path JWT claim (single `premium` claim in v2)
    await admin.auth().setCustomUserClaims(targetUid, { premium: true });

    console.log('✅ Successfully granted Premium!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error granting Premium:', error);
    process.exit(1);
  }
}

grantPremium();
```

### Step 4: Run the Script

1. Open your Firebase Console, go to the **Authentication** tab, and find the UID of the user account you want to upgrade.
2. Replace `'PASTE_THE_USER_UID_HERE'` in the script with that exact UID.
3. Save the file.
4. Run the script in your terminal:
   ```bash
   node setPremium.js
   ```

If it prints `✅ Successfully granted Premium!`, you are done!

### Step 5: Refresh the App

Custom claims are baked into the user's secure token. For the QuantReflex app to see the new claims immediately:
1. Open the QuantReflex app.
2. **Log out and log back in.** (This forces Firebase to fetch a brand new token containing the new claims).
3. The app will now read the token securely and unlock Premium features automatically!

---

## Google Sign-In (one-time console setup)

The app ships a "Continue with Google" button on the auth screen. It stays functional only after
these console steps (code cannot do them):

1. **Enable the provider:** Firebase Console → Authentication → Sign-in method → **Google** → Enable
   (set the project support email). Until enabled, the button surfaces "Google sign-in is not
   enabled" — nothing breaks.
2. **Authorized domains:** Authentication → Settings → Authorized domains → add `quantreflex.app`
   and `dev.quantreflex.app` (localhost is pre-authorized).

### First-login provisioning

Provider sign-ins do NOT go through `/api/auth/register`, so the client calls the idempotent
`POST /api/account?action=ensure-profile` on a genuinely-new login **before** claiming the
single-device session. It seeds the exact `users/{uid}` shape register.js creates (entitlement
defaults, emailLower, stats roster key, usage/ai) and no-ops for already-provisioned users. If it
ever fails, login continues on local defaults and the next login retries.

### Two caveats to know before enabling

- **Redirect fallback reliability:** `authDomain` is `quant-reflex-trainer.firebaseapp.com` — a
  different site from `quantreflex.app`, so the `signInWithRedirect` fallback (used only when a
  popup is blocked) is unreliable on Safari/iOS third-party-storage partitioning. Popup-first works
  today. The robust follow-up is Firebase's documented proxy option: set
  `authDomain: 'quantreflex.app'`, add a Vercel rewrite for `/__/auth/:path*` →
  `https://quant-reflex-trainer.firebaseapp.com/__/auth/:path*`, and add
  `https://quantreflex.app/__/auth/handler` to the OAuth client's authorized redirect URIs in
  Google Cloud Console.
- **Unverified-password unlink:** with the default "one account per email" policy, if an email user
  (register.js creates them with `emailVerified: false`) later signs in with Google on the same
  address, Firebase keeps the same uid (data intact) but **unlinks the password provider** — their
  password stops working until they use "Forgot password". Expected Firebase behavior; worth knowing
  for support.
