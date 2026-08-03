---
name: Watch
description: Watch a local or remote condition in the background and resume when it is met
user-invocable: true
agent-invocable: false
---

Treat the user's request as a background watch task. Call
`createWatcherSession` in this turn unless the condition is already satisfied,
cannot be checked with the available CLIs, or a matching active watcher is
listed in the current `<shell-sessions>`.

Perform any required read-only preflight before arming the watcher. After it is
armed, briefly tell the user and end the turn; do not wait with
`executeShellCommand`.
