---
name: github
description: Complete guide for the GitHub plugin — REST API access for repositories, issues, pull requests, actions, releases, and search using a GitHub Personal Access Token.
---

# GitHub Plugin

This plugin provides access to the GitHub REST API on the user's behalf, using a stored Personal Access Token.

Capabilities:
- List, inspect, and search repositories
- Create, read, update, and comment on issues
- Create, list, review, and merge pull requests
- List branches, commits, and compare refs
- Trigger, monitor, and inspect GitHub Actions workflow runs
- List and create releases
- Search code, issues, and repositories

---

## Authentication

Request the stored GitHub credential. The `token` field is an opaque placeholder — the sandbox fetch proxy substitutes the real value automatically. Never decode or transform it.

```js
const cred = await API.getCredential('github-pat');
if (!cred) {
  return 'GitHub credential is not configured. Ask the user to add a GitHub Personal Access Token at github.com/settings/tokens, then store it in Settings.';
}
```

## Making Requests

Always pass the token as a Bearer header and include the recommended API version:

```js
async function ghGet(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${cred.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function ghPost(path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${cred.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function ghPatch(path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method: 'PATCH',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${cred.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  return res.json();
}
```

---

## Key Endpoints

### Repositories

**Get a repository**
`GET /repos/{owner}/{repo}`
Returns full repository metadata including default branch, visibility, and description.

**List repositories for a user**
`GET /users/{username}/repos?sort=updated&per_page=30`
Use `?type=owner` to list only owned repos (excludes forks/member repos).

**List repositories for the authenticated user**
`GET /user/repos?sort=updated&per_page=30`
Add `?affiliation=owner` to show only owned repos.

**List organization repositories**
`GET /orgs/{org}/repos?sort=updated&per_page=30`

### Issues

**List issues for a repository**
`GET /repos/{owner}/{repo}/issues?state=open&per_page=30`
Add `&labels=bug` to filter by label. Add `&sort=updated` to sort by update time.
Note: pull requests are included in issue listings. Filter them out by checking that `pull_request` is absent.

**Get a single issue**
`GET /repos/{owner}/{repo}/issues/{issue_number}`

**Create an issue**
`POST /repos/{owner}/{repo}/issues`
Body: `{ "title": "...", "body": "...", "labels": ["bug"], "assignees": ["username"] }`

**Update an issue**
`PATCH /repos/{owner}/{repo}/issues/{issue_number}`
Body: `{ "state": "closed" }` or `{ "title": "New title", "body": "Updated body" }`

**List issue comments**
`GET /repos/{owner}/{repo}/issues/{issue_number}/comments?per_page=100`

**Create an issue comment**
`POST /repos/{owner}/{repo}/issues/{issue_number}/comments`
Body: `{ "body": "Comment text" }`

### Pull Requests

**List pull requests**
`GET /repos/{owner}/{repo}/pulls?state=open&per_page=30`
Add `&sort=updated` to sort by update time. Use `&head=owner:branch` to filter by head branch.

**Get a pull request**
`GET /repos/{owner}/{repo}/pulls/{pull_number}`
Returns diff stats, mergeable status, head/base refs, and review state.

**Create a pull request**
`POST /repos/{owner}/{repo}/pulls`
Body: `{ "title": "...", "body": "...", "head": "feature-branch", "base": "main" }`

**Merge a pull request**
`PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge`
Body: `{ "merge_method": "squash" }` — merge_method can be `merge`, `squash`, or `rebase`.

**List pull request files**
`GET /repos/{owner}/{repo}/pulls/{pull_number}/files?per_page=100`
Returns the list of changed files with patch diffs, additions, deletions, and status.

**List review comments on a pull request**
`GET /repos/{owner}/{repo}/pulls/{pull_number}/comments?per_page=100`

### Branches and Commits

**List branches**
`GET /repos/{owner}/{repo}/branches?per_page=100`

**Get a branch**
`GET /repos/{owner}/{repo}/branches/{branch}`
Returns the branch tip commit SHA and protection status.

**List commits**
`GET /repos/{owner}/{repo}/commits?sha={branch}&per_page=30`
Add `&since=2024-01-01T00:00:00Z` to scope by date.

**Compare two refs**
`GET /repos/{owner}/{repo}/compare/{base}...{head}`
Returns ahead/behind counts, diff stats, and the list of commits between two refs.

### GitHub Actions

**List workflows**
`GET /repos/{owner}/{repo}/actions/workflows`

**List workflow runs**
`GET /repos/{owner}/{repo}/actions/runs?per_page=10`
Add `&status=failure` to filter failed runs. Add `&branch=main` to scope to a branch.

**Get a workflow run**
`GET /repos/{owner}/{repo}/actions/runs/{run_id}`
Returns status, conclusion, timing, and associated commits.

**List jobs for a workflow run**
`GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs`
Returns individual job names, statuses, conclusions, and step details.

**Trigger a workflow dispatch**
`POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches`
Body: `{ "ref": "main", "inputs": { "key": "value" } }`
The `workflow_id` can be the workflow file name (e.g. `ci.yml`) or numeric ID.

**Re-run a workflow**
`POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun`

**Cancel a workflow run**
`POST /repos/{owner}/{repo}/actions/runs/{run_id}/cancel`

**Download workflow run logs**
`GET /repos/{owner}/{repo}/actions/runs/{run_id}/logs`
Returns a 302 redirect to a zip archive of the logs.

### Releases

**List releases**
`GET /repos/{owner}/{repo}/releases?per_page=10`

**Get the latest release**
`GET /repos/{owner}/{repo}/releases/latest`

**Create a release**
`POST /repos/{owner}/{repo}/releases`
Body: `{ "tag_name": "v1.0.0", "name": "v1.0.0", "body": "Release notes", "draft": false, "prerelease": false }`

### Search

**Search repositories**
`GET /search/repositories?q={query}&sort=stars&order=desc&per_page=10`

**Search issues and pull requests**
`GET /search/issues?q={query}+repo:{owner}/{repo}+is:issue&per_page=10`

**Search code**
`GET /search/code?q={query}+repo:{owner}/{repo}&per_page=10`
Note: code search requires authentication and has stricter rate limits.

---

## Common Patterns

### Check CI status for a branch
```js
const cred = await API.getCredential('github-pat');
const runs = await ghGet('/repos/OWNER/REPO/actions/runs?branch=main&per_page=1');
const latest = runs.workflow_runs[0];
return {
  status: latest.status,
  conclusion: latest.conclusion,
  name: latest.name,
  url: latest.html_url,
  createdAt: latest.created_at,
};
```

### List open PRs with their review status
```js
const cred = await API.getCredential('github-pat');
const prs = await ghGet('/repos/OWNER/REPO/pulls?state=open&per_page=10');
return prs.map(pr => ({
  number: pr.number,
  title: pr.title,
  author: pr.user.login,
  head: pr.head.ref,
  base: pr.base.ref,
  draft: pr.draft,
  url: pr.html_url,
}));
```

### Create an issue and add a comment
```js
const cred = await API.getCredential('github-pat');
const issue = await ghPost('/repos/OWNER/REPO/issues', {
  title: 'Bug: login fails on mobile',
  body: 'Steps to reproduce...',
  labels: ['bug'],
});
await ghPost(`/repos/OWNER/REPO/issues/${issue.number}/comments`, {
  body: 'Investigating this now.',
});
return { issueNumber: issue.number, url: issue.html_url };
```

### Watch a workflow run until completion
```js
const cred = await API.getCredential('github-pat');
const runId = 12345678;
let status = 'in_progress';
let attempts = 0;
while (['queued', 'in_progress', 'waiting'].includes(status) && attempts < 30) {
  await new Promise(r => setTimeout(r, 5000));
  const run = await ghGet(`/repos/OWNER/REPO/actions/runs/${runId}`);
  status = run.status;
  attempts++;
  API.output(`Run status: ${status} (conclusion: ${run.conclusion ?? 'pending'})`);
}
const final = await ghGet(`/repos/OWNER/REPO/actions/runs/${runId}`);
return { status: final.status, conclusion: final.conclusion };
```

---

## Extracting Owner and Repo from a GitHub URL

A GitHub URL looks like:
`https://github.com/{owner}/{repo}/...`

The owner is the first path segment after `github.com/`, and the repo is the second. Strip any trailing `.git` if present.

---

## Important Rules

- Always call `API.getCredential('github-pat')` before any GitHub API call. If it returns `null`, prompt the user to configure it.
- Always include the `Accept: application/vnd.github+json` and `X-GitHub-Api-Version: 2022-11-28` headers.
- Pagination: most list endpoints return 30 items by default. Use `?per_page=100` (max) and `?page=N` to paginate. Check the `Link` response header for `rel="next"` to detect more pages.
- Rate limits: authenticated PATs allow 5,000 requests/hour. Check `x-ratelimit-remaining` in response headers. If exhausted, wait until the time in `x-ratelimit-reset` (UTC epoch seconds).
- Search endpoints have a stricter rate limit of 30 requests/minute. Space out search calls accordingly.
- Treat tokens as sensitive — never log or display them.
