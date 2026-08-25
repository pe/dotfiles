export ZDOTDIR=$HOME/.config/zsh

# Local environment variables
set -a
[[ -f $HOME/.config/environment.local ]] && source "$HOME/.config/environment.local"
set +a

alias python="python3"