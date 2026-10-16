function _update_delta_theme --description 'Set DELTA_FEATURES based on $fish_terminal_color_theme' --on-variable fish_terminal_color_theme
    switch $fish_terminal_color_theme
        case dark
            set -gx DELTA_FEATURES +zebra-dark +dark
        case light
            set -gx DELTA_FEATURES +zebra-light +light
    end
end
