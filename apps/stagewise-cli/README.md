# stagewise-cli (MVP)

Minimal local CLI for running `@stagewise/agent-core` in a headless setup.
It mounts a workspace, sends one prompt to a chat agent, and prints the final
assistant text.

## Usage

```bash
ANTHROPIC_API_KEY=... pnpm -F @stagewise/stagewise-cli start -- --cwd /tmp/foo "Create hello.txt with hi"
```

### Options

- `--cwd <path>`: workspace path to mount (default: current working directory)
- `--model <modelId>`: model id override
- positional prompt: required prompt text

### Environment

- `ANTHROPIC_API_KEY` (required)
- `STAGEWISE_CLI_MODEL` (optional default model; defaults to `claude-sonnet-4.6`)

## Notes

- Uses temp, session-scoped host paths under `os.tmpdir()/stagewise-cli/<sessionId>/`.
- Sets tool approval mode to `alwaysAllow` for local smoke-test ergonomics.
- Uses universal file tools from `createUniversalToolbox`.
