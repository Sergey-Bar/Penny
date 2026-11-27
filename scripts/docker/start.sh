#!/usr/bin/env bash
# Start Penny in Docker and open it in the browser (macOS and Linux; Windows uses start.bat).
# Safe to run again: it rebuilds only what changed and keeps your data in the penny-data volume.
set -u
cd "$(dirname "$0")/../.." || exit 1
url="http://127.0.0.1:41234"

command -v docker >/dev/null 2>&1 || { echo "Docker is not installed. Get it from https://www.docker.com/products/docker-desktop/ and try again."; exit 1; }
docker version >/dev/null 2>&1 || { echo "Docker is not running. Start Docker Desktop and try again."; exit 1; }

# Lets the update check compare the running version with the newest one.
PENNY_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
export PENNY_COMMIT
# Created by you, not by Docker, so the app can move imported files (Docker would create it owned by root).
mkdir -p imports

# An install from before 0.4 keeps its data in another volume. Copy it into penny-data once, with the app stopped
# so the database is consistent; the old volume is removed only after the new one comes up healthy.
OLD_VOLUME=""
move_data_volume() {
  docker volume inspect penny-data >/dev/null 2>&1 && return 0
  local old
  old="$(docker inspect penny --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' 2>/dev/null)"
  [ -n "$old" ] && [ "$old" != "penny-data" ] || return 0
  echo "Moving your data to the penny-data volume (one time)..."
  docker stop penny >/dev/null 2>&1
  docker volume create penny-data >/dev/null || return 1
  if ! docker run --rm --user 0 --entrypoint sh -v "$old":/from:ro -v penny-data:/to penny:latest -c 'cp -a /from/. /to/'; then
    docker volume rm penny-data >/dev/null 2>&1
    echo "Could not copy your data. Nothing was changed."
    return 1
  fi
  # The old container still holds the name and the old volume; compose makes a new one.
  docker rm penny >/dev/null 2>&1
  OLD_VOLUME="$old"
}
remove_old_volume() {
  [ -n "$OLD_VOLUME" ] && docker volume rm "$OLD_VOLUME" >/dev/null 2>&1 && echo "Removed the old data volume."
  return 0
}
move_data_volume || exit 1

echo "Building and starting Penny (the first build takes a few minutes)..."
docker compose up -d --build --remove-orphans || { echo "Build failed. See the messages above."; exit 1; }

for _ in $(seq 1 40); do
  if [ "$(docker inspect --format '{{.State.Health.Status}}' penny 2>/dev/null)" = "healthy" ]; then
    echo "Penny is running at $url"
    remove_old_volume
    if command -v open >/dev/null; then open "$url"; elif command -v xdg-open >/dev/null; then xdg-open "$url" >/dev/null 2>&1; fi
    exit 0
  fi
  sleep 3
done
echo "Penny did not become healthy. Logs:"
docker compose logs --tail 30 penny
exit 1
