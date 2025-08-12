# shellcheck disable=SC2148
# Prevent file overwrite on stdout redirection
# Use `>|` to force redirection to an existing file
set -o noclobber
# Update window size after every command
shopt -s checkwinsize
# Append to the history file, don't overwrite it
shopt -s histappend
# Save multi-line commands as one command
shopt -s cmdhist
# Correct spelling errors in arguments supplied to cd
shopt -s cdspell
# Record each line as it gets issued
PROMPT_COMMAND='history -a'
# Huge history
HISTSIZE=500000
HISTFILESIZE=100000
# Avoid duplicate entries
HISTCONTROL="erasedups:ignoreboth"
# Use standard ISO 8601 timestamp
# %F equivalent to %Y-%m-%d
# %T equivalent to %H:%M:%S (24-hours format)
HISTTIMEFORMAT='%F %T '
# Move history out of the way
HISTFILE=$HOME/.local/share/bash/history

PROMPT_COMMAND='PS1_CMD1=$(git branch --show-current 2>/dev/null)'; PS1='\w \[\e[35m\] ${PS1_CMD1}\[\e[0m\] \[\e[32m\]\$\[\e[0m\] '

alias ls='eza --icons=auto --group-directories-first'
