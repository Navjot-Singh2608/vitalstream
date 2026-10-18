# Starts everything you need to work on the backend, with auto-reload.
#
# Usage (from the backend folder):
#   powershell -ExecutionPolicy Bypass -File dev.ps1
#
# What it does:
#   1. Creates the Python environment (.venv) the first time and installs libraries
#   2. Starts Kafka + Kafka UI in Docker, and WAITS until Kafka is ready
#   3. Runs everything in THIS window:
#        patient-service   on port 8001  (--reload: save -> it restarts itself)
#        stream-gateway    on port 8000  (--reload)
#        risk-scorer       plain script  (no auto-reload: restart dev.ps1 after editing)
#        vitals-simulator  plain script  (no auto-reload: restart dev.ps1 after editing)
#
# To stop: press Ctrl+C once (stops all of them).
# Kafka keeps running in the background until you run:  docker compose down

$ErrorActionPreference = "Continue"
$root = $PSScriptRoot
Set-Location $root
$py = Join-Path $root ".venv\Scripts\python.exe"

# ---- 1. Python environment (first time only) ----
if (-not (Test-Path $py)) {
    Write-Host "Creating Python environment (.venv) - first time only..."
    python -m venv .venv
    & $py -m pip install --upgrade pip
    & $py -m pip install -r requirements.txt
}

# ---- 2. Kafka in Docker ----
Write-Host "Starting Kafka in Docker..."
docker compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker could not start Kafka. Open Docker Desktop, wait for 'Engine running', then run dev.ps1 again." -ForegroundColor Red
    exit 1
}

# The services connect to Kafka as soon as they start, so wait until Kafka is healthy first.
Write-Host "Waiting for Kafka to be ready" -NoNewline
$deadline = (Get-Date).AddSeconds(120)
$health = ""
while ((Get-Date) -lt $deadline) {
    $health = (docker inspect -f "{{.State.Health.Status}}" vs-kafka 2>$null)
    if ($health -eq "healthy") { break }
    Write-Host "." -NoNewline
    Start-Sleep -Seconds 2
}
Write-Host ""
if ($health -ne "healthy") {
    Write-Host "Kafka did not become ready within 2 minutes. Check it with:  docker compose logs kafka" -ForegroundColor Red
    exit 1
}
Write-Host "Kafka is ready." -ForegroundColor Green

# ---- 3. Both services, in THIS window ----
function Start-InThisWindow([string]$folder, [int]$port) {
    $p = Start-Process -FilePath $py -WorkingDirectory $root -NoNewWindow -PassThru `
        -ArgumentList "-m", "uvicorn", "main:app", "--reload", "--port", "$port", "--app-dir", $folder
    Write-Host "Started $folder on port $port"
    return $p
}

function Start-ScriptInThisWindow([string]$script) {
    $p = Start-Process -FilePath $py -WorkingDirectory $root -NoNewWindow -PassThru -ArgumentList $script
    Write-Host "Started $script"
    return $p
}

$services = @(
    (Start-InThisWindow "patient-service" 8001),
    (Start-InThisWindow "stream-gateway"  8000),
    (Start-ScriptInThisWindow "risk-scorer\main.py"),       # reads vitals.raw, writes vitals.enriched
    (Start-ScriptInThisWindow "vitals-simulator\main.py")   # last: everyone is already listening
)

Write-Host ""
Write-Host "Patient service:  http://localhost:8001/patients   (API docs: http://localhost:8001/docs)"
Write-Host "Stream gateway:   ws://localhost:8000/ws/stream     (the dashboard connects here)"
Write-Host "Kafka UI:         http://localhost:8080"
Write-Host "Dashboard:        run 'npm run dev' in the dashboard folder, then open http://localhost:5173"
Write-Host ""
Write-Host "Both services print their messages here. Save any main.py and that service reloads by itself."
Write-Host "Press Ctrl+C to stop everything." -ForegroundColor Yellow
Write-Host ""

try {
    Wait-Process -Id $services.Id          # keep this window busy while the services run
}
finally {
    # Ctrl+C (or closing the window): make sure both services and their reload helpers are stopped
    foreach ($p in $services) {
        taskkill /PID $p.Id /T /F 2>$null | Out-Null
    }
    Write-Host "Services stopped. (Kafka is still running: 'docker compose down' to stop it.)"
}
