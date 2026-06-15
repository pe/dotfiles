function _update_eza_theme --description 'Set eza theme based on $fish_terminal_color_theme' --on-variable fish_terminal_color_theme
    switch $fish_terminal_color_theme
        case dark
            ln -fs ~/Library/Application\ Support/eza/tokyonight_night.yml ~/Library/Application\ Support/eza/theme.yml
        case light
            ln -fs ~/Library/Application\ Support/eza/tokyonight_day.yml ~/Library/Application\ Support/eza/theme.yml
    end
end
