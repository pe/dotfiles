/opt/homebrew/bin/brew shellenv | source

set PATH $HOME/.jenv/bin $PATH

if status --is-interactive
    command -q jenv; and jenv init - | source
    command -q starship; and starship init fish | source
    command -q oc; and oc completion fish | source
    test -e {$HOME}/.iterm2_shell_integration.fish; and source {$HOME}/.iterm2_shell_integration.fish
    function iterm2_print_user_vars
        iterm2_set_user_var openshiftProject $(command oc project -q 2>&1)
        function yadm_status
            echo (command yadm --no-optional-locks status --untracked-files=no --branch --porcelain | string match --regex '## .+ \[(.+)\]')[2]
            echo (command yadm --no-optional-locks diff --shortstat HEAD)
        end
        iterm2_set_user_var yadmDirty $(yadm_status)
    end
end
