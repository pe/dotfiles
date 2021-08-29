function __login_on_remote
    if set -q SSH_TTY
        prompt_login
    end
end

function __jobs
    set -l jobs (jobs | count)
    if [ $jobs -eq 0 ]
        return
    end
    echo -sn (set_color 'cyan') " $jobs" (set_color normal)
end

function __last_status
    if [ $argv -ne 0 ]
        echo -sn (set_color 'red') '' (set_color normal)
    end
end

function __kubernetes_prompt --description 'Write out the kubernetes prompt'
    # If openshift isn't installed, there's nothing we can do
    if not command -sq oc
        return
    end

    set -l current_context (command oc project -q 2>/dev/null)

    if [ $status -eq 0 ]
        echo -sn (set_color 'magenta') " $current_context" (set_color normal)
    end
end

function fish_prompt --description 'Write out the prompt'
    # Save the last status for later (do this before anything else)
    set -l last_status $status

    set -l segments (string collect (__login_on_remote) (prompt_pwd) (__fast_git_prompt) (__kubernetes_prompt) (__jobs) (__last_status $last_status))
    echo -n "$segments ❯ "
end
