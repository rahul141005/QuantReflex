# Deployment Guide

> How to deploy QuantReflex apps from the monorepo to Vercel.

---

## Deployment Model

Each app deploys as a **separate Vercel project** from the same Git repository. Vercel's "Root Directory" setting isolates each app's build context.

## Setup Steps

### 1. Connect Repository to Vercel

1. Push the monorepo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project
3. Import the repository
4. Create **one Vercel project per app**

### 2. Configure Each Project

#### Main App

| Setting | Value |
|---------|-------|
| Project Name | `quantreflex` |
| Root Directory | `main-app` |
| Framework Preset | Other |
| Build Command | (leave empty — static site) |
| Output Directory | `.` |
| Domain | `quantreflex.app` |

#### Super Admin App

| Setting | Value |
|---------|-------|
| Project Name | `quantreflex-admin` |
| Root Directory | `super-admin-app` |
| Framework Preset | Other |
| Build Command | (leave empty — static site) |
| Output Directory | `.` |
| Domain | `dev.quantreflex.app` |

#### Coaching Admin App

| Setting | Value |
|---------|-------|
| Project Name | `quantreflex-coaching` |
| Root Directory | `coaching-admin-app` |
| Framework Preset | Other |
| Build Command | (leave empty — static site) |
| Output Directory | `.` |
| Domain | `admin.quantreflex.app` |

### 3. Environment Variables

Set in Vercel Dashboard → Project Settings → Environment Variables.

See [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) for the full list per app.

### 4. Deploy

```bash
# Automatic: push to main branch
git push origin main

# Manual: deploy a specific app
cd main-app && npx vercel --prod
cd super-admin-app && npx vercel --prod
```

## Vercel Configuration Files

Each app has its own `vercel.json`:

### Main App (`main-app/vercel.json`)
- SPA rewrite: `/((?!api/).*)` → `/index.html`
- CORS headers for API routes
- Service worker no-cache headers
- AI function timeout: 30s
- Payment function timeout: 15s

### Super Admin App (`super-admin-app/vercel.json`)
- SPA rewrite: `/((?!api/).*)` → `/index.html`
- CORS headers for API routes
- Admin function timeout: 15s

## Deploy Previews

Vercel creates preview deployments for every push/PR. Each app gets its own preview URL. This is ideal for testing changes in isolation.

## Rollback

Use Vercel Dashboard → Deployments → select a previous deployment → Promote to Production.
