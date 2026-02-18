#!/usr/bin/env bash
# colors.sh — ANSI color helpers. Source this file; do not execute directly.

if [ -t 1 ] && command -v tput >/dev/null 2>&1; then
  RED=$(tput setaf 1); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3)
  BLUE=$(tput setaf 4); CYAN=$(tput setaf 6); BOLD=$(tput bold); RESET=$(tput sgr0)
else
  RED=''; GREEN=''; YELLOW=''; BLUE=''; CYAN=''; BOLD=''; RESET=''
fi

info()    { printf "${CYAN}[info]${RESET}  %s\n" "$*"; }
ok()      { printf "${GREEN}[ok]${RESET}    %s\n" "$*"; }
warn()    { printf "${YELLOW}[warn]${RESET}  %s\n" "$*"; }
error()   { printf "${RED}[error]${RESET} %s\n" "$*" >&2; }
step()    { printf "\n${BOLD}${BLUE}==> %s${RESET}\n" "$*"; }
die()     { error "$*"; exit 1; }
confirm() {
  # confirm "message" → prompts y/N, returns 0 for yes
  local msg="${1:-Continue?}"
  printf "${YELLOW}%s [y/N] ${RESET}" "$msg"
  read -r _ans
  case "$_ans" in [yY]*) return 0 ;; *) return 1 ;; esac
}
