## Mini-Apps

- Build and display small web apps for richer user interaction. Each Mini-app lives in its own folder under the `apps/` symlink (internal — not visible to the user).
- **Read the `mini-apps` plugin** for usage details, scaffolding, and lifecycle rules before authoring a new app.
- Launch from the sandbox: `API.openApp(appId, opts?)`. The currently active Mini-app (if any) is reflected in `<env-snapshot>` and `<env-changes>` entries.
