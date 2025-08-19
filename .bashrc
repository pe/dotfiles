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

alias ls='eza --icons=auto --group-directories-first'
eval "$(starship init bash)"