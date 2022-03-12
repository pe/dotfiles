function fish_title
    # emacs' "term" is basically the only term that can't handle it.
    if not set -q INSIDE_EMACS; or string match -vq '*,term:*' -- $INSIDE_EMACS
        # An override for the current command is passed as the first parameter.
        # This is used by `fg` to show the true process name, among others.
        set -l command (set -q argv[1] && echo $argv[1] || status current-command)

        # Don't print "fish" because it's redundant
        if test "$command" = fish
            set command
        end
        echo "$command · " (prompt_pwd --full-length-dirs=4 --dir-length=2)
    end
end
