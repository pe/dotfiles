test -e {$HOME}/.iterm2_shell_integration.fish ; and source {$HOME}/.iterm2_shell_integration.fish

function locks
    log show --predicate '(subsystem == "com.apple.login") && (category == "Logind_General") && (eventMessage beginswith "-[SessionAgent SA_SetSessionStateForUser:state:reply:]:")' --last 14d --style json | jq '.[] | .timestamp + "\t" + .eventMessage[-1:]' --raw-output | ~/Documents/locks
end

set PATH $HOME/.jenv/bin $PATH
status --is-interactive; and source (jenv init -|psub)
thefuck --alias | source
