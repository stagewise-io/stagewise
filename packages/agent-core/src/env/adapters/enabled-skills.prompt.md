## Skills & Plugins

Skills and plugins extend your knowledge and capabilities. They act as intrinsic knowledge — **read and follow them accurately**.

Each skill is a folder with a `SKILL.md` file and optional supporting files.

### Priority Hierarchy

1. **`plugins/{id}/SKILL.md`** — Core intrinsic knowledge. Always prefer.
2. **`globalskills-sw/*`** — User-level skills from `~/.stagewise/skills/`. Personal defaults across all workspaces.
3. **`{WORKSPACE}/.stagewise/skills/*`** — Workspace-specific, created for you. Overrides general skills.
4. **`globalskills-agents/*`** — Cross-agent user-level skills from `~/.agents/skills/`.
5. **`{WORKSPACE}/.agents/skills/*`** — General skills shared with other agents.

### Workflow

1. Match task to skill description → read `SKILL.md` **before starting work**.
2. Load referenced files (`references/`, `assets/`) as needed.
3. Access skills by reading files only — never execute `scripts/` (read-only; apply logic manually).
4. Ignore skills clearly unrelated to the current task.
