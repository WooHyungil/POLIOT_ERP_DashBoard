param(
  [string]$HostAddr = "0.0.0.0",
  [int]$Port = 8000,
  [string]$PublicBaseUrl = "",
  [switch]$Reload
)

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path ".venv")) {
  python -m venv .venv
}

. .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

function Stop-ListenerOnPort {
  param([int]$TargetPort)

  try {
    $owners = @(Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique)
    foreach ($pid in $owners) {
      try {
        Stop-Process -Id $pid -Force -ErrorAction Stop
        Write-Host "Stopped existing listener PID=$pid on TCP $TargetPort"
      } catch {
        Write-Warning "Failed to stop PID=$pid on TCP $TargetPort"
      }
    }
  } catch {
    Write-Warning "Could not inspect TCP $TargetPort listeners"
  }
}

Stop-ListenerOnPort -TargetPort $Port
if ($PublicBaseUrl) {
  $env:PUBLIC_BASE_URL = $PublicBaseUrl
  Write-Host "PUBLIC_BASE_URL set: $PublicBaseUrl"
}

$uvicornArgs = @('-m', 'uvicorn', 'server.app.main:app', '--host', $HostAddr, '--port', [string]$Port)
if ($Reload.IsPresent) {
  $uvicornArgs += '--reload'
  Write-Host 'Starting uvicorn in reload mode'
} else {
  Write-Host 'Starting uvicorn in single-process mode'
}

$pythonExe = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) { $pythonExe = "python" }
& $pythonExe @uvicornArgs
