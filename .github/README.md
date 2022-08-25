# My Dotfiles

## Setup

```shell
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" # install homebrew
brew install yadm
yadm clone --bootstrap https://pe@github.com/pe/dotfiles.git
printf "[user]\n\tname = %s\n" (id -F) >> ~/.config/git/local
printf "\temail = %s" EMAIL_HERE >> ~/.config/git/local
```

Upload SSH Key to Github
