# Apployd VS Code Extension (MVP)

Manage Apployd resources from your IDE:

- Sign in to your Apployd account
- Native multi-view sidebar (Overview, Projects, Deployments)
- Browse projects and recent deployments in your selected organization
- Trigger deployments (production or preview)
- Cancel in-progress deployments
- Copy deployment IDs quickly
- Fetch and view project logs
- Open project or dashboard pages in browser

## Configure

Set these in VS Code settings:

- `apployd.apiBaseUrl` (default: `https://sylicaai.com/api/v1`)
- `apployd.dashboardBaseUrl` (default: `https://sylicaai.com`)

## Commands

- `Apployd: Sign In`
- `Apployd: Focus Sidebar`
- `Apployd: Sign Out`
- `Apployd: Refresh`
- `Apployd: Select Organization`
- `Apployd: Deploy Project`
- `Apployd: Cancel Deployment`
- `Apployd: Copy Deployment ID`
- `Apployd: Show Project Logs`
- `Apployd: Open Project Dashboard`
- `Apployd: Open Dashboard`

## Notes

- Authentication uses `/auth/login` and stores the JWT in VS Code `SecretStorage`.
- The project view reads organizations from `/organizations` and projects from `/projects`.
- This is an MVP. It can be extended with create/update project flows, env/secret management, and realtime deployment/log websockets.
