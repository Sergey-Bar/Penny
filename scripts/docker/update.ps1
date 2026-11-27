# Update Penny safely: back up the data, build the new version (its tests run during the build),
# switch to it, and roll back to the previous image if it does not come up healthy.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\..")

function Wait-Healthy {
    for ($i = 0; $i -lt 40; $i++) {
        if ((docker inspect --format "{{.State.Health.Status}}" penny 2>$null) -eq "healthy") { return $true }
        Start-Sleep 3
    }
    return $false
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Write-Host "Docker is not installed. Get it from https://www.docker.com/products/docker-desktop/ and try again."; exit 1 }
docker version *> $null
if ($LASTEXITCODE -ne 0) { Write-Host "Docker is not running. Start Docker Desktop and try again."; exit 1 }

# 1. Get the newest release (a vX.Y.Z tag), never unreleased work. A dirty checkout stops instead of being overwritten.
if (git remote) {
    if (git status --porcelain --untracked-files=no) { Write-Host "Local code changes found. Nothing was changed."; exit 1 }
    git fetch --tags --force --quiet
    $tag = git tag --list "v*" --sort=-v:refname | Where-Object { $_ -match '^v\d+\.\d+\.\d+$' } | Select-Object -First 1
    if (-not $tag) { Write-Host "No release found. Nothing was changed."; exit 1 }
    git -c advice.detachedHead=false checkout --quiet $tag
    if ($LASTEXITCODE -ne 0) { Write-Host "Could not switch to $tag. Nothing was changed."; exit 1 }
    Write-Host "Updating to $tag"
} else {
    Write-Host "No git remote configured: rebuilding the code that is here."
}

# 2. Back up the database and encryption key inside the data volume (newest five are kept).
$running = @("penny") | Where-Object { (docker inspect --format "{{.State.Running}}" $_ 2>$null) -eq "true" } | Select-Object -First 1
if ($running) {
    docker exec $running node scripts/backup-data.mjs /data
    if ($LASTEXITCODE -ne 0) { Write-Host "Backup failed. Nothing was changed."; exit 1 }
}

# An install from before 0.4 keeps its data in another volume. Copy it into penny-data once, with the app stopped
# so the database is consistent; the old volume is removed only after the new one comes up healthy.
$script:OldVolume = $null
function Move-DataVolume {
    docker volume inspect penny-data *> $null
    if ($LASTEXITCODE -eq 0) { return $true }
    $old = docker inspect penny --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' 2>$null
    if (-not $old -or $old -eq "penny-data") { return $true }
    Write-Host "Moving your data to the penny-data volume (one time)..."
    docker stop penny *> $null
    docker volume create penny-data *> $null
    docker run --rm --user 0 --entrypoint sh -v "${old}:/from:ro" -v penny-data:/to penny:latest -c "cp -a /from/. /to/"
    if ($LASTEXITCODE -ne 0) {
        docker volume rm penny-data *> $null
        Write-Host "Could not copy your data. Nothing was changed."
        return $false
    }
    # The old container still holds the name and the old volume; compose makes a new one.
    docker rm penny *> $null
    $script:OldVolume = $old
    return $true
}
function Remove-OldVolume {
    if ($script:OldVolume) { docker volume rm $script:OldVolume *> $null; if ($LASTEXITCODE -eq 0) { Write-Host "Removed the old data volume." } }
}

if (-not (Move-DataVolume)) { exit 1 }

# 3. Keep the current image so we can go back to it.
$current = @("penny:latest") | Where-Object { docker image inspect $_ *> $null; $LASTEXITCODE -eq 0 } | Select-Object -First 1
$hadPrevious = [bool]$current
if ($hadPrevious) { docker tag $current penny:previous }

# 4. Build. If the new version's tests fail, no image is produced and the running version is untouched.
$env:PENNY_COMMIT = (git rev-parse --short HEAD 2>$null)
if (-not $env:PENNY_COMMIT) { $env:PENNY_COMMIT = "unknown" }
docker compose build
if ($LASTEXITCODE -ne 0) {
    if ($hadPrevious) { docker tag penny:previous penny:latest }
    Write-Host "Build or tests failed. Penny keeps running the previous version."
    exit 1
}

# 5. Switch, and roll back if the new version is not healthy. --remove-orphans retires a container from before the rename.
docker compose up -d --remove-orphans
if (Wait-Healthy) {
    Write-Host "Updated to $env:PENNY_COMMIT. Penny is running at http://127.0.0.1:41234"
    Remove-OldVolume
    exit 0
}
Write-Host "The new version did not become healthy. Rolling back."
docker compose logs --tail 30 penny
if ($hadPrevious) {
    docker tag penny:previous penny:latest
    docker compose up -d --no-build
    if (Wait-Healthy) { Write-Host "Rolled back to the previous version." } else { Write-Host "Rollback did not come up healthy either. Your data is backed up in the volume under /data/backups." }
}
exit 1
