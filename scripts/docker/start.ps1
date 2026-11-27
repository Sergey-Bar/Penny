# Start Penny in Docker and open it in the browser.
# Safe to run again: it rebuilds only what changed and keeps your data in the penny-data volume.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\..")
$url = "http://127.0.0.1:41234"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Write-Host "Docker is not installed. Get it from https://www.docker.com/products/docker-desktop/ and try again."; exit 1 }
docker version *> $null
if ($LASTEXITCODE -ne 0) { Write-Host "Docker is not running. Start Docker Desktop and try again."; exit 1 }

# Lets the update check compare the running version with the newest one.
$env:PENNY_COMMIT = (git rev-parse --short HEAD 2>$null)
if (-not $env:PENNY_COMMIT) { $env:PENNY_COMMIT = "unknown" }

New-Item -ItemType Directory -Force imports | Out-Null

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

Write-Host "Building and starting Penny (the first build takes a few minutes)..."
docker compose up -d --build --remove-orphans
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed. See the messages above."; exit 1 }

for ($i = 0; $i -lt 40; $i++) {
    if ((docker inspect --format "{{.State.Health.Status}}" penny 2>$null) -eq "healthy") {
        Write-Host "Penny is running at $url"
        Remove-OldVolume
        Start-Process $url
        exit 0
    }
    Start-Sleep 3
}
Write-Host "Penny did not become healthy. Logs:"
docker compose logs --tail 30 penny
exit 1
