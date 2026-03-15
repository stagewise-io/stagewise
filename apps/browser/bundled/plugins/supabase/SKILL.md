---
name: supabase
description: Complete guide for the Supabase plugin — Management API access for running SQL queries, listing projects, managing edge functions, secrets, migrations, and inspecting project health.
---

# Supabase Plugin

This plugin provides access to the Supabase Management API on the user's behalf, using a stored Personal Access Token (PAT).

Capabilities:
- List and inspect Supabase projects
- Run arbitrary SQL against any project database
- Generate TypeScript types from the database schema
- List, create, and manage edge functions
- Manage project secrets
- List and apply database migrations
- Check project health and performance advisors
- Retrieve project API keys and configuration

---

## Authentication

Request the stored Supabase credential. The `accessToken` field is an opaque placeholder — the sandbox fetch proxy substitutes the real value automatically. Never decode or transform it.

```js
const cred = await API.getCredential('supabase-pat');
if (!cred) {
  return 'Supabase credential is not configured. Ask the user to create a Personal Access Token at supabase.com/dashboard/account/tokens, then store it in Settings.';
}
```

## Making Requests

All requests go to `https://api.supabase.com/v1/`. Always pass the token as a Bearer header:

```js
async function sbGet(path) {
  const res = await fetch(`https://api.supabase.com/v1${path}`, {
    headers: {
      Authorization: `Bearer ${cred.accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Supabase API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbPost(path, body) {
  const res = await fetch(`https://api.supabase.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cred.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbPatch(path, body) {
  const res = await fetch(`https://api.supabase.com/v1${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${cred.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbDelete(path) {
  const res = await fetch(`https://api.supabase.com/v1${path}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${cred.accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Supabase API ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}
```

---

## Identifying the Project

Most endpoints require a **project ref** — the unique identifier for a Supabase project (e.g. `ypnrbornkuwxlvjkgubi`). It appears in the project's dashboard URL:

```
https://supabase.com/dashboard/project/{ref}/...
```

If the user hasn't specified a project ref, list their projects first:

```js
const projects = await sbGet('/projects');
return projects.map(p => ({ id: p.id, name: p.name, region: p.region }));
```

Then ask the user which project to target.

---

## Key Endpoints

### Projects

**List all projects**
`GET /v1/projects`
Returns all projects the PAT has access to, including id, name, region, and status.

**Get a specific project**
`GET /v1/projects/{ref}`
Returns full project details.

**Get project health**
`GET /v1/projects/{ref}/health`
Returns the current health status of the project.

**Get project API keys**
`GET /v1/projects/{ref}/api-keys`
Returns the project's API keys (anon, service_role, etc.).

### Running SQL (The Primary Tool)

**Execute a SQL query**
`POST /v1/projects/{ref}/database/query`
Body: `{ "query": "SELECT * FROM public.users LIMIT 10" }`

This is the most powerful endpoint — it runs arbitrary SQL against the project's Postgres database with full privileges.

**Execute a read-only SQL query**
`POST /v1/projects/{ref}/database/query/read-only`
Body: `{ "query": "SELECT ..." }`
Same as above but restricted to read-only operations. Use this for SELECT queries to avoid accidental mutations.

#### Common SQL Patterns

**List all tables in the public schema:**
```sql
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

**Describe a table's columns:**
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'your_table'
ORDER BY ordinal_position;
```

**List all schemas:**
```sql
SELECT schema_name
FROM information_schema.schemata
WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY schema_name;
```

**List foreign key relationships:**
```sql
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  ccu.column_name AS foreign_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public';
```

**List indexes on a table:**
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'your_table' AND schemaname = 'public';
```

**List RLS policies:**
```sql
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public';
```

**Count rows in a table:**
```sql
SELECT count(*) FROM public.your_table;
```

**Insert a row:**
```sql
INSERT INTO public.your_table (col1, col2) VALUES ('val1', 'val2') RETURNING *;
```

**Update rows:**
```sql
UPDATE public.your_table SET col1 = 'new_val' WHERE id = 123 RETURNING *;
```

**Delete rows:**
```sql
DELETE FROM public.your_table WHERE id = 123 RETURNING *;
```

### TypeScript Types

**Generate TypeScript types from the database schema**
`GET /v1/projects/{ref}/types/typescript`
Returns TypeScript type definitions matching the current database schema. Useful for keeping frontend types in sync.

### Edge Functions

**List edge functions**
`GET /v1/projects/{ref}/functions`
Returns all deployed edge functions with their slugs, status, and metadata.

**Get a specific edge function**
`GET /v1/projects/{ref}/functions/{function_slug}`

**Delete an edge function**
`DELETE /v1/projects/{ref}/functions/{function_slug}`

### Secrets

**List project secrets**
`GET /v1/projects/{ref}/secrets`
Returns secret names (values are redacted).

**Create a secret**
`POST /v1/projects/{ref}/secrets`
Body: `{ "name": "MY_SECRET", "value": "secret_value" }`

**Delete secrets**
`DELETE /v1/projects/{ref}/secrets`
Body: `["SECRET_NAME_1", "SECRET_NAME_2"]`

### Database Migrations

**List migrations**
`GET /v1/projects/{ref}/database/migrations`

**Create a migration**
`POST /v1/projects/{ref}/database/migrations`
Body: `{ "name": "add_users_table", "statements": ["CREATE TABLE ..."] }`

### Configuration

**Get PostgREST config**
`GET /v1/projects/{ref}/postgrest`
Returns the PostgREST configuration (exposed schemas, max rows, etc.).

**Update PostgREST config**
`PATCH /v1/projects/{ref}/postgrest`
Body: `{ "max_rows": 1000 }`

**Get database Postgres config**
`GET /v1/projects/{ref}/config/database/postgres`

**Get disk utilization**
`GET /v1/projects/{ref}/config/disk/util`

### Advisors

**Performance advisor**
`GET /v1/projects/{ref}/advisors/performance`
Returns performance lints (unindexed foreign keys, unused indexes, etc.).

**Security advisor**
`GET /v1/projects/{ref}/advisors/security`
Returns security lints. Add `?lint_type=sql` to filter.

### Organizations

**List organizations**
`GET /v1/organizations`

**Get organization details**
`GET /v1/organizations/{slug}`

**List organization members**
`GET /v1/organizations/{slug}/members`

**List organization projects**
`GET /v1/organizations/{slug}/projects`

---

## Common Patterns

### Explore a project's database schema
```js
const cred = await API.getCredential('supabase-pat');
const ref = 'YOUR_PROJECT_REF';

// List all tables
const tables = await sbPost(`/projects/${ref}/database/query/read-only`, {
  query: `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
});
return tables;
```

### Query data from a table
```js
const cred = await API.getCredential('supabase-pat');
const ref = 'YOUR_PROJECT_REF';

const result = await sbPost(`/projects/${ref}/database/query/read-only`, {
  query: `SELECT * FROM public.users ORDER BY created_at DESC LIMIT 20`
});
return result;
```

### Insert data
```js
const cred = await API.getCredential('supabase-pat');
const ref = 'YOUR_PROJECT_REF';

const result = await sbPost(`/projects/${ref}/database/query`, {
  query: `INSERT INTO public.todos (title, completed) VALUES ('Buy milk', false) RETURNING *`
});
return result;
```

### Check project health and performance
```js
const cred = await API.getCredential('supabase-pat');
const ref = 'YOUR_PROJECT_REF';

const health = await sbGet(`/projects/${ref}/health`);
const perf = await sbGet(`/projects/${ref}/advisors/performance`);
const disk = await sbGet(`/projects/${ref}/config/disk/util`);

return { health, performanceLints: perf.length, disk };
```

### Generate and display TypeScript types
```js
const cred = await API.getCredential('supabase-pat');
const ref = 'YOUR_PROJECT_REF';

const types = await sbGet(`/projects/${ref}/types/typescript`);
return types;
```

### List edge functions and their status
```js
const cred = await API.getCredential('supabase-pat');
const ref = 'YOUR_PROJECT_REF';

const functions = await sbGet(`/projects/${ref}/functions`);
return functions.map(f => ({
  slug: f.slug,
  name: f.name,
  status: f.status,
  version: f.version,
}));
```

---

## Important Rules

- Always call `API.getCredential('supabase-pat')` before any Supabase API call. If it returns `null`, prompt the user to configure it.
- Always identify the target project ref before making project-specific calls. Either ask the user or call `GET /v1/projects` to list available projects.
- Use `POST /v1/projects/{ref}/database/query/read-only` for SELECT queries to avoid accidental writes.
- Use `POST /v1/projects/{ref}/database/query` for INSERT/UPDATE/DELETE/DDL operations.
- When running destructive SQL (DROP, DELETE, TRUNCATE), always confirm with the user first.
- Treat tokens as sensitive — never log or display them.
- The Management API does not have publicly documented rate limits, but be reasonable — avoid tight loops of requests.
- SQL query results may be large. Use `LIMIT` clauses to keep responses manageable.
