function fish_title
    # emacs' "term" is basically the only term that can't handle it.
    if not set -q INSIDE_EMACS; or string match -vq '*,term:*' -- $INSIDE_EMACS
        # replace $HOME with ~
        set -l working_directory (__fish_pwd | string replace $HOME '~')

        # An override for the current command is passed as the first parameter.
        # This is used by `fg` to show the true process name, among others.
        set -l command (set -q argv[1] && echo $argv[1] || status current-command)

        if [ $command = fish ]
            # 'fish' is not of interest as a command
            echo "$working_directory"
        else
            echo "$command · $working_directory"
        end
    end
end
