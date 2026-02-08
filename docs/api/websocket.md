# WebSocket API

## Deployment Event Stream

- Endpoint: `GET /ws/deployments/:deploymentId`
- Protocol: WebSocket
- Purpose: stream deployment state transitions and messages.
- Auth: include JWT as query param `?token=<jwt>`.

### Event payload

```json
{
  "deploymentId": "ck...",
  "type": "building",
  "message": "Building Docker image",
  "timestamp": "2026-02-07T12:00:00.000Z"
}
```

### Typical event sequence

1. `queued`
2. `building`
3. `deploying`
4. `ready`

Failure path emits `failed` with error message.

### Sleep/wake events

- `waking` event emitted when wake endpoint is called for sleeping container.
