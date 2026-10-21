#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo 'Installing 1Password CLI requires administrator access.' >&2
  exit 1
fi

for tool in apt-get curl gpg dpkg mktemp; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Installing 1Password CLI requires $tool." >&2
    exit 1
  fi
done

architecture=$(dpkg --print-architecture)
case "$architecture" in
  amd64|arm64) ;;
  *) echo "1Password CLI installation is unsupported on $architecture in this Debian runtime." >&2; exit 1 ;;
esac

key_url=https://downloads.1password.com/linux/keys/1password.asc
repository_url="https://downloads.1password.com/linux/debian/$architecture"
key_file=$(mktemp)
keyring_file=$(mktemp)
trap 'rm -f "$key_file" "$keyring_file"' EXIT HUP INT TERM

curl --fail --silent --show-error --location "$key_url" --output "$key_file"
gpg --batch --yes --dearmor --output "$keyring_file" "$key_file"
install -m 0644 "$keyring_file" /usr/share/keyrings/1password-archive-keyring.gpg
printf 'deb [arch=%s signed-by=/usr/share/keyrings/1password-archive-keyring.gpg] %s stable main\n' "$architecture" "$repository_url" > /etc/apt/sources.list.d/1password.list

apt-get update
apt-get install -y 1password-cli
op --version
