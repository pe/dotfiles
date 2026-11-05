function ssh --wraps='ssh' --description 'Use Ghostty SSH integration when running in Ghostty'
    if test "$TERM_PROGRAM" = ghostty
        ghostty +ssh -- $argv
    else
        command ssh $argv
    end
end
    