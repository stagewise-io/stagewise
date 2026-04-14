#!/bin/zsh
# stagewise shell integration for zsh
# Emits OSC 133 escape sequences for command boundary detection.
# Safe to source multiple times (guarded by __STAGEWISE_SHELL_INTEGRATION).

if [[ -n "$__STAGEWISE_SHELL_INTEGRATION" ]]; then
  return 0 2>/dev/null || exit 0
fi
export __STAGEWISE_SHELL_INTEGRATION=1

# Track whether a command was actually executed (vs. empty prompt)
__stagewise_command_executed=0

# Load add-zsh-hook if available (ships with zsh since 4.3.11)
autoload -Uz add-zsh-hook 2>/dev/null

# precmd: runs before each prompt
# Emit OSC 133;D;<exit_code> for the previous command, then 133;A for prompt start
__stagewise_precmd() {
  local exit_code=$?
  if [[ "$__stagewise_command_executed" == "1" ]]; then
    printf '\033]133;D;%d\007' "$exit_code"
    __stagewise_command_executed=0
  fi
  printf '\033]133;A\007'
}

# preexec: runs after the user enters a command, before it executes
# Emit OSC 133;B (prompt end) and 133;C (command output start)
__stagewise_preexec() {
  __stagewise_command_executed=1
  printf '\033]133;B\007'
  printf '\033]133;C\007'
}

# Install hooks via add-zsh-hook (safe — does not clobber existing hooks)
if (( $+functions[add-zsh-hook] )); then
  add-zsh-hook precmd __stagewise_precmd
  add-zsh-hook preexec __stagewise_preexec
else
  # Fallback: append to hook arrays directly
  precmd_functions+=(__stagewise_precmd)
  preexec_functions+=(__stagewise_preexec)
fi

# Emit initial prompt marker so the first command boundary is detectable
printf '\033]133;A\007'
