function _tide_item_gitfast --description 'Write out the git prompt'
    # If git isn't installed, there's nothing we can do
    if not command -sq git
        return
    end

    # --quiet = don't error if there are no commits
    command git rev-parse --quiet --git-dir --is-inside-work-tree 2>/dev/null |
        read --local --line git_dir is_inside_work_tree
    if test true != "$is_inside_work_tree"
        return # Abort when not inside a work tree (a bare repo, a .git dir or not a repository)
    end

    set -l git_status (command git --no-optional-locks status --branch --porcelain=2 2>/dev/null)

    set -l branch (__branch $git_status)
    set -l ahead_behind (__ahead_behind $git_status)
    set -l file_status (__file_status $git_status)
    set -l stash (__stash $git_dir)
    set -l operation (__current_operation $git_dir)

    _tide_print_item gitfast $tide_git_icon $branch $operation $ahead_behind $stash $file_status
end

function __branch --description "returns the current Git branch or commit if detached"
    set -l git_status $argv
    set -l branch ""(string match '# branch.head *' -- $git_status | string sub --start 15)
    if string match --quiet "*(detached)" -- $branch
        set branch ""(string match '# branch.oid *' -- $git_status | string sub --start 14 --length 8)
    end
    echo $branch
end

function __ahead_behind --description "returns how many commits ahead/behind"
    set -l git_status $argv
    set -l ahead_behind (string match --regex '# branch.ab \+(\d+) \-(\d+)' -- $git_status)
    set -l ahead
    set -l behind
    if test -n "$ahead_behind"
        if test "$ahead_behind[2]" -gt 0
            set ahead "⇡$ahead_behind[2]"
        end
        if test "$ahead_behind[3]" -gt 0
            set behind "⇣$ahead_behind[3]"
        end
    end
    echo (prefix_if_set ' ' "$ahead$behind")
end

function __file_status --description "returns the current Git status"
    set -l git_status $argv

    set -l untracked '?'(string match '\? *' $git_status | count) || set -e untracked
    set -l unstaged '+'(string match --regex '[12] [AMDRC.][AMDRC]' $git_status | count) || set -e unstaged
    set -l staged '•'(string match --regex '[12] [AMDRC][AMDRC.]' $git_status | count) || set -e staged
    set -l unmerged '☹︎'(string match 'u *' $git_status | count) || set -e unmerged

    echo (prefix_if_set ' ' "$untracked$unstaged$staged$unmerged")
end

function __stash --description "returns the current Git stash count" --argument-names git_dir
    set -l stashfile "$git_dir/logs/refs/stash"
    if test -s "$stashfile"
        printf %s ' ⚑'(count < $stashfile)
    end
end

function __current_operation --description "returns the current Git operation" --argument-names git_dir
    set -l operation
    set -l step
    set -l total

    if test -d $git_dir/rebase-merge
        read step <$git_dir/rebase-merge/msgnum
        read total <$git_dir/rebase-merge/end
        if test -f $git_dir/rebase-merge/interactive
            set operation " rebase-interactive"
        else
            set operation " rebase-merge"
        end
    else
        if test -d $git_dir/rebase-apply
            read step <$git_dir/rebase-apply/next
            read total <$git_dir/rebase-apply/last
            if test -f $git_dir/rebase-apply/rebasing
                set operation " rebase"
            else if test -f $git_dir/rebase-apply/applying
                set operation " am"
            else
                set operation " am/rebase"
            end
        else if test -f $git_dir/MERGE_HEAD
            set operation " merge"
        else if test -f $git_dir/CHERRY_PICK_HEAD
            set operation " cherry-pick"
        else if test -f $git_dir/REVERT_HEAD
            set operation " revert"
        else if test -f $git_dir/BISECT_LOG
            set operation " bisect"
        end
    end

    if test -n "$step" -a -n "$total"
        set operation "$operation $step/$total"
    end

    echo $operation
end

function prefix_if_set --argument-names prefix value
    if test -n "$value"
        echo "$prefix$value"
    end
end
