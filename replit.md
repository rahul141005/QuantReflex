# Replit setup

## Main app preview

The Replit workflow serves the student-facing PWA from `main-app/`:

```bash
cd main-app && npx --yes serve . -l 5000
```

Open the Replit Preview to use the app. The main app is a static vanilla
JavaScript PWA, so no build step is required.

The imported repository also contains serverless API routes and Firebase,
OpenAI, and Razorpay integrations. Those services require their own
production configuration; no external service credentials were invented or
added during Replit setup.