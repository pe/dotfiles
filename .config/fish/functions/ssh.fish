function ssh --wraps='ghosty +ssh --' --description 'alias ssh=ghosty +ssh --'
    ghostty +ssh -- $argv
end
    