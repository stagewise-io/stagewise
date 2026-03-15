---
name: vercel
description: Complete guide for the Vercel plugin — REST API access for deployments, logs, projects, and environment variables using a Vercel Personal Access Token.
---

# Vercel Plugin

This plugin provides access to the Vercel REST API on the user's behalf, using a stored Personal Access Token.

Capabilities:
- List and inspect projects and deployments
- Fetch build and runtime logs
- Check deployment status and watch for completion
- Read, add, and update environment variables
- Trigger redeploys or cancel running builds
- Inspect domain and alias configuration

---

## Authentication

Request the stored Vercel credential. The `token` field is an opaque placeholder — the sandbox fetch proxy substitutes the real value automatically. Never decode or transform it.

```js
const cred = await API.getCredential('vercel-pat');
if (!cred) {
  return 'Vercel credential is not configured. Ask the user to add a Vercel Personal Access Token at vercel.com/account/tokens, then store it in Settings.';
}
```

## Making Requests

Always pass the token as a Bearer header:

```js
async function vercelGet(path) {
  const res = await fetch(`https://api.vercel.com${path}`, {
    headers: {
      Authorization: `Bearer ${cred.token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Vercel API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function vercelPost(path, body) {
  const res = await fetch(`https://api.vercel.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cred.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Vercel API ${res.status}: ${await res.text()}`);
  return res.json();
}
```

---

## Key Endpoints

### Projects

**List all projects**
`GET /v9/projects`
Returns paginated list of projects. Use `?limit=20` to control page size.

**Get a project**
`GET /v9/projects/:projectId`
`:projectId` can be the project ID or name (slug).

### Deployments

**List deployments for a project**
`GET /v6/deployments?projectId=:projectId&limit=10`
Add `&target=production` to filter production deployments only.
Add `&state=ERROR` / `&state=READY` / `&state=BUILDING` to filter by status.

**Get a deployment**
`GET /v13/deployments/:deploymentId`
Returns full deployment details including status, meta, and build output.

**Get deployment build logs**
`GET /v2/deployments/:deploymentId/events`
Returns a stream of build log events. Each event has `type` (`stdout`/`stderr`) and `text`.

**Redeploy**
`POST /v13/deployments`
Body: `{ "deploymentId": "...", "name": "...", "target": "production" }`

**Cancel a deployment**
`PATCH /v12/deployments/:deploymentId/cancel`

### Runtime Logs

**Get runtime logs**
`GET /v1/deployments/:deploymentId/events?direction=backward&limit=100`
Use `&since=<timestamp_ms>` and `&until=<timestamp_ms>` to scope by time.
Add `&statusCode=500` or filter by `level` field in results (`error`, `warning`, `info`).

### Environment Variables

**List env vars for a project**
`GET /v9/projects/:projectId/env`
Returns all env vars. Secret values are redacted — use `/decrypt` endpoint to retrieve them.

**Create an env var**
`POST /v10/projects/:projectId/env`
Body:
```json
{
  "key": "MY_VAR",
  "value": "my-value",
  "type": "plain",
  "target": ["production", "preview", "development"]
}
```
`type` can be `"plain"`, `"secret"`, or `"encrypted"`.

**Update an env var**
`PATCH /v9/projects/:projectId/env/:envId`
Body: `{ "value": "new-value" }`

**Delete an env var**
`DELETE /v9/projects/:projectId/env/:envId`

### Teams

If the user's projects are under a team, many endpoints require `?teamId=:teamId`.

**List teams**
`GET /v2/teams`
Returns all teams the token has access to. Note the `id` field for use as `teamId`.

**Get a team**
`GET /v2/teams/:teamId`

---

## Common Patterns

### Check if latest deployment succeeded
```js
const cred = await API.getCredential('vercel-pat');
const { deployments } = await vercelGet('/v6/deployments?projectId=YOUR_PROJECT&limit=1&target=production');
const latest = deployments[0];
return { status: latest.state, url: latest.url, createdAt: new Date(latest.createdAt).toISOString() };
```

### Fetch recent error logs for a deployment
```js
const cred = await API.getCredential('vercel-pat');
const events = await vercelGet('/v2/deployments/DEPLOYMENT_ID/events?direction=backward&limit=200');
const errors = events.filter(e => e.level === 'error' || e.type === 'stderr');
return errors.map(e => e.text || e.payload?.text).filter(Boolean).join('\n');
```

### Watch a deployment until it finishes
```js
const cred = await API.getCredential('vercel-pat');
const deploymentId = 'dpl_...';
let status = 'BUILDING';
let attempts = 0;
while (['BUILDING', 'INITIALIZING', 'QUEUED'].includes(status) && attempts < 30) {
  await new Promise(r => setTimeout(r, 5000));
  const { state } = await vercelGet(`/v13/deployments/${deploymentId}`);
  status = state;
  attempts++;
  API.output(`Deployment status: ${status}`);
}
return `Final status: ${status}`;
```

---

## Important Rules

- Always call `API.getCredential('vercel-pat')` before any Vercel API call. If it returns `null`, prompt the user to configure it.
- Many endpoints are paginated — check for `pagination.next` in the response and page through if needed.
- Team-scoped projects require `?teamId=` on most endpoints. If requests return 403 or empty results, ask the user for their team ID or fetch it via `GET /v2/teams`.
- Treat env var values as sensitive — do not log or display secret/encrypted values.
- Rate limits: Vercel enforces per-token rate limits. Avoid tight polling loops; use at least 2–5s between status checks.
