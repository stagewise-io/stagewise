# General information

- Agent client
- Hosts all the functionalities of the agent on the local machine
- Uses the external AI-infrastructure via `@stagewise/client-api`
- Makes changes to the local codebase by using the implementation in `@stagewise/agent-runtime-node`
- Temporarily stores the chat history and interoperates with the toolbar through the `@stagewise/agent-interface`

# Workflow

- Make script calls always from within this package
- Make dev builds with `pnpm dev`. This runs permanently, so if you want to make one-time builds to just check if the types etc. are correct, use `pnpm build` instead.
- Make prod build with `pnpm build`
- Make sure to build the this package when changing it before building the CLI (`stagewise`).
- Write tests for complex functionalities
  - Always put tests into a package root `test` folder
  - Always put tests into sub-folders that mirrors the `src` folder structure
  - Split tests for complex functionalities into individual files and put them into one common foloder names like the tested module
  - Use `vitest` as testing framework.
  - Always name tests `{MODULE_NAME_OR_FUNCTIONALITY}.test.ts`
  