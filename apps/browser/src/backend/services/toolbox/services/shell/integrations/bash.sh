#!/bin/bash
# stagewise shell integration for bash
# Emits OSC 133 escape sequences for command boundary detection.
# Safe to source multiple times (guarded by __STAGEWISE_SHELL_INTEGRATION).

if [[ -n "$__STAGEWISE_SHELL_INTEGRATION" ]]; then
  return 0 2>/dev/null || exit 0
fi
export __STAGEWISE_SHELL_INTEGRATION=1

# Track whether a command was actually executed (vs. empty prompt)
__stagewise_command_executed=0

# Emit OSC 133;A — prompt start
__stagewise_prompt_start() {
  printf '\033]133;A\007'
}

# Emit OSC 133;D;<exit_code> — command finished, then 133;A — next prompt
__stagewise_prompt_command() {
  local exit_code=$?
  if [[ "$__stagewise_command_executed" == "1" ]]; then
    printf '\033]133;D;%d\007' "$exit_code"
    __stagewise_command_executed=0
  fi
  __stagewise_prompt_start
}

# Emit OSC 133;B — prompt end (command about to run), then 133;C — command output start
# Triggered by DEBUG trap before each command
__stagewise_pre_exec() {
  # Avoid firing for PROMPT_COMMAND itself
  if [[ "$BASH_COMMAND" == "__stagewise_prompt_command" ]]; then
    return
  fi
  __stagewise_command_executed=1
  printf '\033]133;B\007'
  printf '\033]133;C\007'
}

# Install hooks
trap '__stagewise_pre_exec' DEBUG

# Append to PROMPT_COMMAND (support both string and array forms in bash 5.1+)
if [[ ${BASH_VERSINFO[0]} -ge 5 && ${BASH_VERSINFO[1]} -ge 1 ]]; then
  PROMPT_COMMAND+=('__stagewise_prompt_command')
else
  if [[ -z "$PROMPT_COMMAND" ]]; then
    PROMPT_COMMAND='__stagewise_prompt_command'
  else
    PROMPT_COMMAND="__stagewise_prompt_command;${PROMPT_COMMAND}"
  fi
fi

# Emit initial prompt marker so the first command boundary is detectable
__stagewise_prompt_start
