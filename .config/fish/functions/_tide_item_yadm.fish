function _tide_item_yadm
    set -l git_status (command yadm --no-optional-locks status --branch --porcelain=2 2>/dev/null)
    if not string match --quiet '# branch.ab +0 -0' -- $git_status; or string match --invert '# *' -- $git_status | string match --quiet --invert '*fish_variables'
        _tide_print_item yadm ""
    end
end