---
name: posthog
description: Complete guide for the PostHog plugin — REST API access for querying analytics with HogQL, managing feature flags, inspecting events and persons, reading insights, experiments, cohorts, surveys, and more.
---

# PostHog Plugin

This plugin provides access to the PostHog REST API on the user's behalf, using a stored Personal API Key (`phx_...`).

Capabilities:
- Run arbitrary HogQL (SQL-like) queries against the analytics database
- List, filter, and inspect events
- Look up persons (users) by ID, email, or properties
- Read saved insights (trends, funnels, retention, paths, etc.)
- CRUD feature flags
- Read and manage experiments (A/B tests)
- Read cohorts, annotations, actions, dashboards, and surveys
- Query web analytics stats

---

## Authentication

Request the stored PostHog credential. The `personalApiKey` field is an opaque placeholder — the sandbox fetch proxy substitutes the real value automatically. Never decode or transform it.

```js
const cred = await API.getCredential('posthog-pat');
if (!cred) {
  return 'PostHog credential is not configured. Ask the user to create a Personal API Key at Settings → Personal API Keys in their PostHog dashboard, then store it in Settings.';
}
```

## Region & Base URL

PostHog Cloud has **two regions**. The agent must determine which one the user is on:

| Region | Base URL |
|--------|----------|
| US Cloud | `https://us.posthog.com` |
| EU Cloud | `https://eu.posthog.com` |

**How to determine the region:**
- Ask the user, OR
- Look at any PostHog dashboard tab open in the browser — the URL hostname reveals the region.

Store the base URL in a variable and use it for all requests.

---

## Making Requests

All API paths are relative to the region base URL. Always pass the key as a Bearer header:

```js
const BASE = 'https://us.posthog.com'; // or https://eu.posthog.com

async function phGet(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${cred.personalApiKey}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`PostHog API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function phPost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cred.personalApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PostHog API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function phPatch(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${cred.personalApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PostHog API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function phDelete(path) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${cred.personalApiKey}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`PostHog API ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}
```

---

## Identifying the Project

Most endpoints require a **project ID** — a numeric identifier visible in the PostHog dashboard URL:

```
https://us.posthog.com/project/{project_id}/...
```

If the user hasn't specified a project ID:
1. Check any open PostHog dashboard tab in the browser — the project ID is in the URL path.
2. Ask the user directly.

---

## Key Endpoints

All paths below are relative to the base URL (e.g. `https://us.posthog.com`).

### HogQL Queries (The Primary Analytical Tool)

**Run a HogQL query**
`POST /api/projects/{project_id}/query`
Body:
```json
{
  "query": {
    "kind": "HogQLQuery",
    "query": "SELECT event, count() AS cnt FROM events WHERE timestamp > now() - interval 7 day GROUP BY event ORDER BY cnt DESC LIMIT 20"
  }
}
```

Response contains `results` (array of rows), `columns` (column names), and `types` (column types).

HogQL is a SQL-like query language on top of ClickHouse. It can query `events`, `persons`, `sessions`, `groups`, and more. This is the most powerful endpoint for analytics — prefer it over the REST list endpoints when aggregation or filtering is needed.

**Run a web stats query**
`POST /api/projects/{project_id}/query`
Body:
```json
{
  "query": {
    "kind": "WebStatsTableQuery",
    "dateRange": { "date_from": "2025-01-01", "date_to": "2025-01-31" },
    "breakdownBy": "Page",
    "limit": 10
  }
}
```

#### Common HogQL Patterns

**Top events in the last 7 days:**
```sql
SELECT event, count() AS cnt
FROM events
WHERE timestamp > now() - interval 7 day
GROUP BY event
ORDER BY cnt DESC
LIMIT 20
```

**Unique users in the last 30 days:**
```sql
SELECT uniq(person_id) AS unique_users
FROM events
WHERE timestamp > now() - interval 30 day
```

**Pageviews by path:**
```sql
SELECT properties.$pathname AS path, count() AS views
FROM events
WHERE event = '$pageview'
  AND timestamp > now() - interval 7 day
GROUP BY path
ORDER BY views DESC
LIMIT 20
```

**Daily active users trend:**
```sql
SELECT toDate(timestamp) AS day, uniq(person_id) AS dau
FROM events
WHERE timestamp > now() - interval 30 day
GROUP BY day
ORDER BY day
```

**Funnel analysis (pageview → signup):**
```sql
SELECT
  uniq(person_id) AS total_users,
  uniqIf(person_id, event = '$pageview') AS step1,
  uniqIf(person_id, event = 'signed_up') AS step2
FROM events
WHERE timestamp > now() - interval 7 day
```

**User sessions with duration:**
```sql
SELECT
  session.session_id,
  min(timestamp) AS start,
  max(timestamp) AS end,
  dateDiff('second', min(timestamp), max(timestamp)) AS duration_s,
  count() AS event_count
FROM events
WHERE timestamp > now() - interval 1 day
  AND session.session_id IS NOT NULL
GROUP BY session.session_id
ORDER BY duration_s DESC
LIMIT 20
```

**Events for a specific person:**
```sql
SELECT event, timestamp, properties
FROM events
WHERE person_id = 'PERSON_UUID'
ORDER BY timestamp DESC
LIMIT 50
```

### Events

**List events**
`GET /api/projects/{project_id}/events/`
Query params: `?event=<event_name>`, `?person_id=<id>`, `?limit=<n>`, `?after=<cursor>`
Returns paginated event list.

**Get a single event**
`GET /api/projects/{project_id}/events/{event_id}/`

### Persons

**List persons**
`GET /api/projects/{project_id}/persons/`
Query params: `?search=<term>`, `?email=<email>`, `?limit=<n>`

**Get a specific person**
`GET /api/projects/{project_id}/persons/{person_id}/`

### Insights (Saved Analytics)

**List insights**
`GET /api/projects/{project_id}/insights/`
Query params: `?search=<term>`, `?short_id=<id>`, `?limit=<n>`
Returns saved trends, funnels, retention, paths, lifecycle, and stickiness queries.

**Get a specific insight**
`GET /api/projects/{project_id}/insights/{id}/`
Returns the insight definition and its last-calculated results.

### Feature Flags

**List feature flags**
`GET /api/projects/{project_id}/feature_flags/`
Query params: `?search=<term>`, `?active=true`

**Get a specific feature flag**
`GET /api/projects/{project_id}/feature_flags/{id}/`

**Create a feature flag**
`POST /api/projects/{project_id}/feature_flags/`
Body:
```json
{
  "name": "My Flag",
  "key": "my-flag-key",
  "description": "Enables the new onboarding flow",
  "filters": { "groups": [] },
  "active": true
}
```

**Update a feature flag**
`PATCH /api/projects/{project_id}/feature_flags/{id}/`
Body: partial update (e.g. `{ "active": false }` to disable).

**Delete a feature flag**
`DELETE /api/projects/{project_id}/feature_flags/{id}/`

### Experiments

**List experiments**
`GET /api/projects/{project_id}/experiments/`

**Get a specific experiment**
`GET /api/projects/{project_id}/experiments/{id}/`

**Get experiment results**
`GET /api/projects/{project_id}/experiments/{id}/results/`

### Cohorts

**List cohorts**
`GET /api/projects/{project_id}/cohorts/`

**Get a specific cohort**
`GET /api/projects/{project_id}/cohorts/{id}/`

### Actions

**List actions**
`GET /api/projects/{project_id}/actions/`

**Get a specific action**
`GET /api/projects/{project_id}/actions/{id}/`

### Annotations

**List annotations**
`GET /api/projects/{project_id}/annotations/`

**Create an annotation**
`POST /api/projects/{project_id}/annotations/`
Body:
```json
{
  "content": "Deployed v2.1.0",
  "date_marker": "2025-03-15T12:00:00Z",
  "scope": "project"
}
```

**Update an annotation**
`PATCH /api/projects/{project_id}/annotations/{id}/`

**Delete an annotation**
`DELETE /api/projects/{project_id}/annotations/{id}/`

### Dashboards

**List dashboards**
`GET /api/projects/{project_id}/dashboards/`

**Get a specific dashboard**
`GET /api/projects/{project_id}/dashboards/{id}/`

### Surveys

**List surveys**
`GET /api/projects/{project_id}/surveys/`

**Get a specific survey**
`GET /api/projects/{project_id}/surveys/{id}/`

---

## Common Patterns

### Query top events for the past week
```js
const cred = await API.getCredential('posthog-pat');
const BASE = 'https://us.posthog.com';
const projectId = 12345;

const result = await phPost(`/api/projects/${projectId}/query`, {
  query: {
    kind: 'HogQLQuery',
    query: `SELECT event, count() AS cnt FROM events WHERE timestamp > now() - interval 7 day GROUP BY event ORDER BY cnt DESC LIMIT 20`
  }
});
return { columns: result.columns, rows: result.results };
```

### Look up a person by email
```js
const cred = await API.getCredential('posthog-pat');
const BASE = 'https://us.posthog.com';
const projectId = 12345;

const persons = await phGet(`/api/projects/${projectId}/persons/?email=user@example.com`);
return persons.results;
```

### List active feature flags
```js
const cred = await API.getCredential('posthog-pat');
const BASE = 'https://us.posthog.com';
const projectId = 12345;

const flags = await phGet(`/api/projects/${projectId}/feature_flags/?active=true`);
return flags.results.map(f => ({
  id: f.id,
  key: f.key,
  name: f.name,
  active: f.active,
  rollout: f.rollout_percentage,
}));
```

### Create a feature flag
```js
const cred = await API.getCredential('posthog-pat');
const BASE = 'https://us.posthog.com';
const projectId = 12345;

const flag = await phPost(`/api/projects/${projectId}/feature_flags/`, {
  name: 'New Onboarding',
  key: 'new-onboarding',
  description: 'Enables the redesigned onboarding flow',
  filters: { groups: [{ properties: [], rollout_percentage: 50 }] },
  active: true,
});
return flag;
```

### Get daily active users trend
```js
const cred = await API.getCredential('posthog-pat');
const BASE = 'https://us.posthog.com';
const projectId = 12345;

const result = await phPost(`/api/projects/${projectId}/query`, {
  query: {
    kind: 'HogQLQuery',
    query: `SELECT toDate(timestamp) AS day, uniq(person_id) AS dau FROM events WHERE timestamp > now() - interval 30 day GROUP BY day ORDER BY day`
  }
});
return { columns: result.columns, rows: result.results };
```

### List experiments and their status
```js
const cred = await API.getCredential('posthog-pat');
const BASE = 'https://us.posthog.com';
const projectId = 12345;

const experiments = await phGet(`/api/projects/${projectId}/experiments/`);
return experiments.results.map(e => ({
  id: e.id,
  name: e.name,
  start_date: e.start_date,
  end_date: e.end_date,
}));
```

### Read insights (saved analytics)
```js
const cred = await API.getCredential('posthog-pat');
const BASE = 'https://us.posthog.com';
const projectId = 12345;

const insights = await phGet(`/api/projects/${projectId}/insights/?limit=10`);
return insights.results.map(i => ({
  id: i.id,
  name: i.name,
  short_id: i.short_id,
  filters: i.filters,
  last_refresh: i.last_refresh,
}));
```

---

## Important Rules

- Always call `API.getCredential('posthog-pat')` before any PostHog API call. If it returns `null`, prompt the user to configure it.
- Always determine the user's **region** (US or EU) before making requests. Check open PostHog tabs or ask.
- Always identify the target **project ID** (numeric). Check open PostHog tabs (it's in the URL path: `/project/{id}/...`) or ask.
- Prefer **HogQL queries** (`POST /api/projects/{id}/query`) for analytical questions — they are far more flexible than REST list endpoints.
- Use `LIMIT` clauses in HogQL queries to keep responses manageable.
- When creating or modifying feature flags, confirm details with the user first.
- When deleting resources (flags, annotations, etc.), always confirm with the user first.
- Treat API keys as sensitive — never log or display them.
- Paginated responses use `next` / `previous` URLs. Follow `next` to get more pages.
- The PostHog API may rate-limit requests. Avoid tight loops; add short delays between batch requests.
