# GitHub CI/CD Workflows

> Future home for GitHub Actions workflows.

## Planned Workflows

### `validate.yml`
- Runs on every push/PR
- Validates monorepo structure
- Checks for broken imports
- Runs `npm install` in both apps

### `deploy-main.yml`
- Triggered on push to `main` branch with changes in `main-app/`
- Deploys Main App to Vercel

### `deploy-admin.yml`
- Triggered on push to `main` branch with changes in `super-admin-app/`
- Deploys Super Admin App to Vercel

## Note

Currently, Vercel handles deployments automatically via Git integration. These workflows are for future use when more complex CI/CD is needed.
