# My Dotfiles

## Setup

Set computer name in System Settings → General → Info → Name.

```shell
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
eval "$(/opt/homebrew/bin/brew shellenv)"
brew install yadm
yadm clone --bootstrap https://pe@github.com/pe/dotfiles.git
printf "\temail = %s" EMAIL_HERE >> ~/.config/git/local
```

Upload SSH Key [to Github](https://github.com/settings/keys)
