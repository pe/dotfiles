# shellcheck shell=bash
eval "$(/opt/homebrew/bin/brew shellenv)"

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

# Local environment variables
set -a
[[ -f $HOME/.config/environment.local ]] && source "$HOME/.config/environment.local"
set +a

# Jira PAT — read from the macOS Keychain
# Keychain item was created with:
#   security add-generic-password -a "$USER" -s jira-pat -w
# Verify without printing the token:
#   security find-generic-password -s jira-pat -w | wc -c
JIRA_PAT="$(security find-generic-password -s jira-pat -w 2>/dev/null)"
if [ -n "$JIRA_PAT" ]; then
  export JIRA_PAT
else
  # Stay silent here: any output during zsh init trips powerlevel10k's
  # instant-prompt warning. An unset JIRA_PAT surfaces where it is used.
  unset JIRA_PAT
fi