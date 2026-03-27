# Agentic Prompts

Prompt patterns for tool-using, multi-step, and long-running AI agent systems.

## Tool Use Instructions

### Be explicit about action vs. suggestion

Models may suggest changes instead of implementing them. Direct language fixes this.

**Passive (model may only suggest):**

```
Can you help fix this bug?
```

**Active (model will act):**

```
Find and fix the bug in this function. Edit the file directly.
```

### Default-to-action prompt

```xml
<default_to_action>
Implement changes rather than only suggesting them. If the user's intent is
unclear, infer the most useful action and proceed. Use tools to discover
missing details instead of guessing.
</default_to_action>
```

### Default-to-caution prompt (opposite)

```xml
<do_not_act_before_instructions>
Do not make changes unless clearly instructed. Default to providing information
and recommendations. Only edit files when explicitly requested.
</do_not_act_before_instructions>
```

## Parallel Tool Calling

Modern models can execute multiple tool calls simultaneously. Boost reliability:

```xml
<parallel_tool_calls>
When calling multiple tools with no dependencies between them, make all
independent calls in parallel. Example: reading 3 files → 3 parallel read calls.
If calls depend on previous results, execute sequentially.
Never use placeholders or guess missing parameters.
</parallel_tool_calls>
```

## Thinking and Reasoning

### Constrain overthinking

Models with extended thinking may over-explore. Reduce with:

```
Choose an approach and commit to it. Avoid revisiting decisions unless new
information directly contradicts your reasoning. Pick one path and see it
through; course-correct only if it fails.
```

### Guide interleaved thinking

```
After receiving tool results, reflect on quality and determine optimal next
steps before proceeding. Use thinking to plan based on new information,
then take the best next action.
```

### Limit thinking tokens

```
Extended thinking adds latency. Only use it for problems requiring multi-step
reasoning. When in doubt, respond directly.
```

### Manual chain-of-thought (use when thinking is off of model doesnt support thinking natively)

Use structured tags to separate reasoning from output:

```xml
Think through the problem in <thinking> tags.
Provide your final answer in <answer> tags.
```

### Self-verification

```
Before finishing, verify your answer against: [specific test criteria].
```

## Long-Horizon State Tracking

### Context window management

```
Your context window will be automatically compacted as it approaches its limit.
Do not stop tasks early due to token budget concerns. Save progress and state
before context refreshes. Be persistent and autonomous — complete tasks fully.
```

### Multi-context-window workflows

1. **First window:** Set up framework — write tests, create setup scripts, establish structure
2. **Subsequent windows:** Iterate on a todo-list, reference saved state

### Fresh context startup instructions

```
Review progress.txt, tests.json, and git logs.
Run the integration test suite before implementing new features.
```

### State management

- **Structured formats** (JSON) for test results, task status, schemas
- **Unstructured text** for progress notes and context
- **Git** for state tracking across sessions — provides log and restore points

## Autonomy and Safety Balance

### Reversibility-aware prompt

```
Take local, reversible actions freely (editing files, running tests).
For irreversible or externally visible actions, confirm with the user first.

Actions requiring confirmation:
- Destructive operations (delete files/branches, drop tables, rm -rf)
- Hard to reverse (git push --force, git reset --hard)
- Externally visible (push code, comment on PRs, send messages)

Never bypass safety checks as a shortcut.
```

## Research and Information Gathering

```
Search systematically. Develop competing hypotheses as you gather data.
Track confidence levels. Self-critique your approach regularly.
Update a research notes file for transparency.
Break complex research into systematic sub-tasks.
```

## Subagent Orchestration

### When subagents help

- Tasks that can run in parallel
- Independent workstreams with isolated context
- Large-scale exploration across many files

### When to work directly

- Simple tasks, sequential operations, single-file edits
- Tasks requiring shared state across steps

### Constrain overuse

```
Use subagents for parallel, independent workstreams. For simple tasks,
sequential operations, or tasks needing shared context, work directly.
```

## File Management

### Reduce unnecessary file creation

```
If you create temporary files, scripts, or helpers for iteration,
clean them up by removing them when the task is complete.
```

### Prevent overengineering

```
Only make changes that are directly requested or clearly necessary.
Don't add features, refactor code, or make improvements beyond what was asked.
Keep solutions simple and focused.
```
