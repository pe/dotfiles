test -e {$HOME}/.iterm2_shell_integration.fish ; and source {$HOME}/.iterm2_shell_integration.fish

set PATH $HOME/.jenv/bin $PATH
status --is-interactive; and source (jenv init -|psub)
