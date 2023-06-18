/opt/homebrew/bin/brew shellenv | source

set PATH $HOME/.jenv/bin $PATH

if status --is-interactive
    command -q jenv; and jenv init - | source
    command -q starship; and starship init fish | source
    set -e STARSHIP_SHELL # Breaks iterm shell integration
    command -q oc; and oc completion fish | source
    test -e {$HOME}/.iterm2_shell_integration.fish; and source {$HOME}/.iterm2_shell_integration.fish
    abbr -a -- nano micro
    abbr -a -- cat bat
    abbr -a -- find fd
    abbr -a -- ls exa
    abbr -a -- watch viddy
    abbr -a -- edit micro
    abbr -a -- pico micro
end
