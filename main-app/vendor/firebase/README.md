# Vendored Firebase SDK (ADR-150)

These four files are the **unmodified** Firebase JS SDK compat bundles, version **10.12.2**, served
from our own origin instead of `www.gstatic.com`.

## Why they are here

QuantReflex cannot boot without them — `js/firebase.js` calls `firebase.initializeApp()`, and every
authenticated path depends on it. Loading them from a third-party CDN meant a cold start depended on
`www.gstatic.com` being reachable. CDN blocking is common on the school and coaching-centre networks
this product targets, and the failure mode is total: the app shows "Firebase unavailable" and nothing
works.

This was confirmed by execution, not assumed. A headless boot of `index.html` with the CDN
unreachable produced exactly four `RESOURCE_FAIL` entries for these files, followed by
`[AuthGate] Firebase unavailable.` — the app degraded cleanly, but it did not function.

Serving them from our own origin also lets the service worker **precache** them like any other app
asset, so an installed PWA or TWA keeps working offline.

## Source and integrity

Downloaded 12 August 2026 from:

```
https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js
https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js
https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js
https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js
```

SHA-256 (first 16 hex chars — run `sha256sum *.js` for the full values):

| File | Bytes | SHA-256 (short) |
|---|---:|---|
| `firebase-app-compat.js` | 31444 | `24a1fd90a9424647` |
| `firebase-auth-compat.js` | 139582 | `277f6ef705251682` |
| `firebase-firestore-compat.js` | 341174 | `25133ac64bef210c` |
| `firebase-messaging-compat.js` | 38392 | `3550a8481c2f8f37` |

## Rules for changing these

- **Never edit them.** They are third-party build output. A local patch would be invisible to anyone
  reading the version number and would be silently lost on the next upgrade.
- **To upgrade**, re-download all four at the *same* version from the URLs above, update this file's
  version/date/checksums, and bump `APP_VERSION` in `service-worker.js` so the cache is rebuilt.
  Mixing versions across the four bundles is not supported by Firebase.
- The version here must stay in step with any Firebase docs or SDK references elsewhere in the repo.

## Related

- `index.html` — the four `<script defer>` tags that load them
- `service-worker.js` — `ASSETS` precache list, and the fetch handler that still recognises the old
  gstatic prefix so a browser holding a stale cached shell keeps working through the changeover
- `scripts/firebase-selfhost.check.js` — the ratchet that keeps all of the above consistent
