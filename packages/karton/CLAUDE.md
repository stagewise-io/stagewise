# Task

- Develop the tool specified in the file `SPEC.md`
- Autonomously resolve open questions by finding smart and simple solutions
- Your job is to start with the outlined requirements from the user and then fully autonomously build a great solution

# Rules

- Only use MIT licensed dependencies
- Use strict typing with TypeScript
  - No any, no unknown
  - Always use types, especially in user facing cases
- Build tool: esbuild
- Export a pre-compiled JavaScript library along with required types
- Always write unit tests with `vitest`
  - Don't write tests for obvious use cases like instantiation of dependencies
  - Write unit tests for edge cases. Think about potential issues and then test for these cases.
- Track your progress and document your thoughts and assumptions in the file `CLAUDE-PROGRESS.md`
  - Use this file regularly and extensively to understand where you left off and what you want to continue with
  - Use this as an active document for you to make notes, thoughts about next steps etc.
- Write documentation in markdown
  - Write both interface documentation and use-case documentation. Keep them in separate file structures inside the docs folder.

# Workflow

- Build features in small cycles that represent individual steps towards the final goal
- Always use Test Driven Development
- Every small feature cycle uses this process:
    1. Make sure to exactly specify what should be built in the next step
    2. Write unit tests that cover these specifications and all edge cases
    3. Write code in order to make the given unit tests succeed
    4. Refactor the code to keep all tests successful while reomivng duplicates, redundancy etc.
        4.1. This step should never modify unit tests, since that may secretly damage existing functionality
    5. Update product documentation related to the changes
    6. Create a git commit in Conventional Commit format with all changes

# File structure

- Put sources in `/src`
- Put tests in `/test`
- Make sure that tests are stored in a file structure that replicates the structure in the source folder
- Put documentation in `/doc`
- Put use examples in `/examples` with a sub-folder for the specific example
