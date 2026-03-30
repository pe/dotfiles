# shellcheck shell=sh
eval "$(/opt/homebrew/bin/brew shellenv)"

# Move history out of the way
HISTFILE=$HOME/.local/share/zsh/history
# Huge history
HISTSIZE=500000
# shellcheck disable=SC2034
SAVEHIST=500000
# share history across multiple zsh sessions
setopt SHARE_HISTORY
# append to history
setopt APPEND_HISTORY
# expire duplicates first
setopt HIST_EXPIRE_DUPS_FIRST
# do not store duplications
setopt HIST_IGNORE_DUPS
#ignore duplicates when searching
setopt HIST_FIND_NO_DUPS
# removes blank lines from history
setopt HIST_REDUCE_BLANKS

# Enable completion
autoload -U compinit && compinit -u
# use completion cache
zstyle ':completion::complete:*' use-cache true
# case insensitive
zstyle ':completion:*' matcher-list 'm:{a-zA-Z-_}={A-Za-z_-}' 'r:|[._-]=* r:|=*' 'l:|=* r:|=*'

alias ls='eza --icons=auto --group-directories-first'

eval "$(starship init zsh)"
