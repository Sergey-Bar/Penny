#!/usr/bin/env bash
# Install, start or update Penny in Docker (macOS and Linux). Works on its own:
#   curl -fsSL https://raw.githubusercontent.com/Sergey-Bar/Penny/main/install-docker.sh | bash
# 1. checks that Docker is installed and running, 2. downloads the newest release into ~/Penny (or $PENNY_DIR),
# 3. if Penny is already there and a newer release exists, offers to update (backup + rollback),
# 4. builds, starts and opens http://127.0.0.1:41234. Your data lives in a Docker volume, never in the code folder.
# Run it again any time: it updates when there is something new and otherwise just starts Penny.
set -u
REPO="Sergey-Bar/Penny"
DIR="${PENNY_DIR:-$HOME/Penny}"

say() { printf '%s\n' "$*"; }
# Reads from the terminal even when this script arrives through a pipe.
ask() {
  local reply=""
  if [ -r /dev/tty ]; then read -r -p "$1 [Y/n] " reply </dev/tty || reply=""; fi
  case "$reply" in [nN]*) return 1 ;; *) return 0 ;; esac
}

# $1 = start or update. Releases before scripts/docker/ keep these scripts at the top of the folder.
run() {
  local script="$DIR/scripts/docker/$1.sh"
  if [ ! -f "$script" ]; then
    if [ "$1" = update ]; then script="$DIR/Penny-update.sh"; else script="$DIR/Penny-docker.sh"; fi
  fi
  exec bash "$script"
}

download() { # $1 = tag: replaces the code in $DIR, keeps imports/ and .env
  local tmp
  tmp="$(mktemp -d)" || return 1
  curl -fsSL "https://github.com/$REPO/archive/refs/tags/$1.tar.gz" | tar -xz -C "$tmp" --strip-components=1 || { rm -rf "$tmp"; return 1; }
  mkdir -p "$DIR"
  find "$DIR" -mindepth 1 -maxdepth 1 ! -name imports ! -name .env -exec rm -rf {} +
  cp -R "$tmp"/. "$DIR"/ && rm -rf "$tmp"
  printf '%s\n' "$1" >"$DIR/.penny-version"
}

current_version() {
  if [ -d "$DIR/.git" ]; then git -C "$DIR" describe --tags --exact-match 2>/dev/null || git -C "$DIR" rev-parse --short HEAD 2>/dev/null
  elif [ -f "$DIR/.penny-version" ]; then cat "$DIR/.penny-version"
  fi
}

# Everything runs from here, so a download cut off halfway never runs half a script.
main() {
  # 1. Docker installed?
  if ! command -v docker >/dev/null 2>&1; then
    say "Docker is not installed."
    if [ "$(uname)" = "Darwin" ]; then
      if command -v brew >/dev/null 2>&1 && ask "Install Docker Desktop with Homebrew now?"; then
        brew install --cask docker || { say "Install failed. Get it from https://www.docker.com/products/docker-desktop/"; exit 1; }
      else
        say "Install Docker Desktop from https://www.docker.com/products/docker-desktop/ and run this again."; exit 1
      fi
    else
      say "Install Docker Engine: https://docs.docker.com/engine/install/ (then add yourself to the docker group) and run this again."
      exit 1
    fi
  fi

  # Docker running? On a Mac, start Docker Desktop and wait for it.
  if ! docker version >/dev/null 2>&1; then
    if [ "$(uname)" = "Darwin" ]; then
      say "Starting Docker Desktop..."
      open -a Docker 2>/dev/null
      for _ in $(seq 1 60); do docker version >/dev/null 2>&1 && break; sleep 2; done
    fi
    docker version >/dev/null 2>&1 || { say "Docker is installed but not running (or you lack permission). Start it and run this again."; exit 1; }
  fi
  docker compose version >/dev/null 2>&1 || { say "Docker Compose v2 is missing. Update Docker and run this again."; exit 1; }

  # 2. Newest release.
  local latest have
  latest="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null | sed -n 's/.*"tag_name": *"\(v[0-9.]*\)".*/\1/p' | head -n 1)"
  if [ -z "$latest" ]; then
    say "Could not reach GitHub to find the newest release."
    [ -f "$DIR/docker-compose.yml" ] || exit 1
  fi

  if [ ! -f "$DIR/docker-compose.yml" ]; then
    say "Downloading Penny $latest into $DIR..."
    if command -v git >/dev/null 2>&1; then
      git -c advice.detachedHead=false clone --quiet --branch "$latest" "https://github.com/$REPO.git" "$DIR" || { say "Download failed."; exit 1; }
    else
      download "$latest" || { say "Download failed."; exit 1; }
    fi
    run start
  fi

  # 3. Already installed: update if a newer release exists.
  have="$(current_version)"
  if [ -n "$latest" ] && [ "$have" != "$latest" ]; then
    if ask "Penny ${have:-(unknown version)} is installed. Update to $latest? Your data is backed up first."; then
      # A git checkout moves itself to the newest release; a downloaded copy is replaced first.
      [ -d "$DIR/.git" ] || download "$latest" || { say "Download failed. Nothing was changed."; exit 1; }
      run update
    fi
  elif [ -n "$latest" ]; then
    say "Penny $have is up to date."
  fi

  # 4. Start (or restart) what is installed.
  run start
}

main "$@"
