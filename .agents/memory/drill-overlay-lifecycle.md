---
name: Drill overlay lifecycle
description: The Practice drill engine and its results card share one DOM overlay and have separate session and ownership lifetimes.
---

The drill session flag and the active engine reference are intentionally different lifetimes: `finish()` ends the answering session before rendering results, but the engine must continue owning the fullscreen results overlay until the user deliberately exits.

**Why:** Treating `_drillSessionActive` as the only lifecycle signal caused router refreshes to remove the results fullscreen class or tear down the card while it was still being displayed.

**How to apply:** Router cleanup and background repaint guards must preserve the drill container whenever `_activeDrillEngine` owns it; explicit exits must dispose the engine reference before resetting Practice UI or navigating.