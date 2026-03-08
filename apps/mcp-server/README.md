# Apployd MCP Server

This package exposes Apployd deployment operations as MCP tools over `stdio`.

## Tools

- `get_current_user`
- `list_projects`
- `list_recent_deployments`
- `list_project_deployments`
- `get_deployment`
- `create_deployment`
- `cancel_deployment`

## Configuration

Set these environment variables before starting the server:

```bash
export APPLOYD_API_TOKEN="your apployd jwt"
export APPLOYD_API_BASE_URL="https://apployd.com/api/v1"
export APPLOYD_DEFAULT_ORGANIZATION_ID="org_cuid_optional"
```

`APPLOYD_API_TOKEN` is optional if you first run `apployd-mcp-server login`. `APPLOYD_DEFAULT_ORGANIZATION_ID` is optional, but it avoids ambiguity when the token can access more than one organization.

## Install

Run it directly with `npx`:

```bash
npx -y @apployd/mcp-server
```

## Login

Browser login caches an Apployd token locally, similar to `npm login` or `gh auth login`:

```bash
npx -y @apployd/mcp-server login
```

Other auth commands:

```bash
npx -y @apployd/mcp-server whoami
npx -y @apployd/mcp-server logout
```

After login, most MCP clients can launch the package without passing `APPLOYD_API_TOKEN`.

## Local usage

```bash
npm --workspace apps/mcp-server run dev
```

For production-style execution:

```bash
npm --workspace apps/mcp-server run build
npm --workspace apps/mcp-server run start
```

## Example MCP client config

```json
{
  "mcpServers": {
    "apployd": {
      "command": "npx",
      "args": ["-y", "@apployd/mcp-server"],
      "env": {
        "APPLOYD_API_BASE_URL": "https://apployd.com/api/v1",
        "APPLOYD_DEFAULT_ORGANIZATION_ID": "optional organization cuid"
      }
    }
  }
}
```

If you do not want local cached auth, you can still pass `APPLOYD_API_TOKEN` explicitly.

For local development against this repo instead of npm:

```json
{
  "mcpServers": {
    "apployd": {
      "command": "node",
      "args": ["/root/Apployd.com/apps/mcp-server/dist/src/server.js"],
      "env": {
        "APPLOYD_API_TOKEN": "your apployd jwt",
        "APPLOYD_API_BASE_URL": "https://apployd.com/api/v1",
        "APPLOYD_DEFAULT_ORGANIZATION_ID": "optional organization cuid"
      }
    }
  }
}
```
