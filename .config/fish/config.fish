/opt/homebrew/bin/brew shellenv | source

set PATH $HOME/.jenv/bin $PATH

if status --is-interactive
    command -q jenv; and jenv init - | source
    command -q starship; and starship init fish | source
    command -q oc; and oc completion fish | source
    command -q zoxide; and zoxide init fish | source
    test -e {$HOME}/.iterm2_shell_integration.fish; and source {$HOME}/.iterm2_shell_integration.fish
    abbr -a -- nano micro
    abbr -a -- cat bat
    abbr -a -- find fd
    abbr -a -- ls eza
    abbr -a -- watch viddy
    abbr -a -- edit micro
    abbr -a -- pico micro
    abbr -a -- cd z

    set -gx MANPAGER "sh -c 'col -bx | bat -l man -p'"
    set -gx MANROFFOPT "-c"
    set -gx HOMEBREW_CASK_OPTS "--fontdir=/Library/Fonts"

    fish_config theme choose tokyonight
end

# Local environment variables
test -e {$HOME}/.config/environment.local; and export (cat {$HOME}/.config/environment.local |xargs -L 1)

# Jira PAT — read from the macOS Keychain
# Keychain item was created with:
#   security add-generic-password -a "$USER" -s jira-pat -w
# Verify without printing the token:
#   security find-generic-password -s jira-pat -w | wc -c
set -l JIRA_PAT (security find-generic-password -s jira-pat -w 2>/dev/null)
if set -q JIRA_PAT[1]
    set -gx JIRA_PAT $JIRA_PAT
end
