#!/usr/bin/env bash
# Update Penny safely (macOS and Linux; Windows uses update.bat): move to the newest release, back up
# the data, build the new version (its tests run during the build), switch, and roll back if it is not healthy.
set -u
cd "$(dirname "$0")/../.." || exit 1

wait_healthy() {
  for _ in $(seq 1 40); do
    [ "$(docker inspect --format '{{.State.Health.Status}}' penny 2>/dev/null)" = "healthy" ] && return 0
    sleep 3
  done
  return 1
}

command -v docker >/dev/null 2>&1 || { echo "Docker is not installed. Get it from https://www.docker.com/products/docker-desktop/ and try again."; exit 1; }
docker version >/dev/null 2>&1 || { echo "Docker is not running. Start Docker Desktop and try again."; exit 1; }

# 1. Get the newest release (a vX.Y.Z tag), never unreleased work. A dirty checkout stops instead of being overwritten.
if [ -n "$(git remote 2>/dev/null)" ]; then
  [ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "Local code changes found. Nothing was changed."; exit 1; }
  git fetch --tags --force --quiet || { echo "Could not reach GitHub. Nothing was changed."; exit 1; }
  tag="$(git tag --list 'v*' --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -n 1)"
  [ -n "$tag" ] || { echo "No release found. Nothing was changed."; exit 1; }
  git -c advice.detachedHead=false checkout --quiet "$tag" || { echo "Could not switch to $tag. Nothing was changed."; exit 1; }
  echo "Updating to $tag"
else
  echo "No git remote configured: rebuilding the code that is here."
fi
mkdir -p imports

# 2. Back up the database and encryption key inside the data volume (newest five are kept).
if [ "$(docker inspect --format '{{.State.Running}}' penny 2>/dev/null)" = "true" ]; then
  docker exec penny node scripts/backup-data.mjs /data || { echo "Backup failed. Nothing was changed."; exit 1; }
fi

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

# 3. Keep the current image so we can go back to it.
had_previous=0
if docker image inspect penny:latest >/dev/null 2>&1; then docker tag penny:latest penny:previous; had_previous=1; fi

# 4. Build. If the new version's tests fail, no image is produced and the running version is untouched.
PENNY_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
export PENNY_COMMIT
if ! docker compose build; then
  [ "$had_previous" = 1 ] && docker tag penny:previous penny:latest
  echo "Build or tests failed. Penny keeps running the previous version."
  exit 1
fi

# 5. Switch, and roll back if the new version is not healthy.
docker compose up -d --remove-orphans
if wait_healthy; then echo "Updated to $PENNY_COMMIT. Penny is running at http://127.0.0.1:41234"; remove_old_volume; exit 0; fi
echo "The new version did not become healthy. Rolling back."
docker compose logs --tail 30 penny
if [ "$had_previous" = 1 ]; then
  docker tag penny:previous penny:latest
  docker compose up -d --no-build
  if wait_healthy; then echo "Rolled back to the previous version."; else echo "Rollback did not come up healthy either. Your data is backed up in the volume under /data/backups."; fi
fi
exit 1
