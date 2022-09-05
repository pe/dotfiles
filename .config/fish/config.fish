/opt/homebrew/bin/brew shellenv | source

test -e {$HOME}/.iterm2_shell_integration.fish ; and source {$HOME}/.iterm2_shell_integration.fish

set PATH $HOME/.jenv/bin $PATH

if status --is-interactive
    source (jenv init -|psub)
    starship init fish | source
end