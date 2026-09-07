export ZDOTDIR=$HOME/.config/zsh

# Local environment variables
set -a
[[ -f $HOME/.config/environment.local ]] && source "$HOME/.config/environment.local"
set +a

alias python="python3"

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