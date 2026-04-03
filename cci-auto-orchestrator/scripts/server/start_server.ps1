param(
  [string]$HostAddr = "0.0.0.0",
  [int]$Port = 8000,
  [string]$PublicBaseUrl = "",
  [switch]$LanOnly,
  [string]$AllowedLanCidrs = "",
  [switch]$Reload
)

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

$backupScript = Join-Path $root "scripts\server\backup_critical_data.ps1"
if (Test-Path $backupScript) {
  try {
    & $backupScript | Out-Host
  } catch {
    Write-Warning "Critical-data backup skipped: $($_.Exception.Message)"
  }
}

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
    foreach ($ownerPid in $owners) {
      try {
        Stop-Process -Id $ownerPid -Force -ErrorAction Stop
        Write-Host "Stopped existing listener PID=$ownerPid on TCP $TargetPort"
      } catch {
        Write-Warning "Failed to stop PID=$ownerPid on TCP $TargetPort"
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

if ($LanOnly.IsPresent) {
  $env:CCI_LAN_ONLY = "1"
  Write-Host "LAN only mode enabled"
} else {
  $env:CCI_LAN_ONLY = "0"
}

if ($AllowedLanCidrs) {
  $env:CCI_ALLOWED_LAN_CIDRS = $AllowedLanCidrs
  Write-Host "CCI_ALLOWED_LAN_CIDRS set: $AllowedLanCidrs"
}

function Ensure-LanFirewallRule {
  param([int]$TargetPort)

  $ruleName = "CCI AutoTest $TargetPort"
  try {
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if (-not $existing) {
      New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $TargetPort -Profile Private -RemoteAddress LocalSubnet -ErrorAction Stop | Out-Null
      Write-Host "Created Windows firewall rule: $ruleName (Private/LocalSubnet)"
    } else {
      Set-NetFirewallRule -DisplayName $ruleName -Enabled True -Profile Private -ErrorAction Stop | Out-Null
      Write-Host "Updated Windows firewall rule: $ruleName"
    }
  } catch {
    Write-Warning "Firewall rule setup skipped (run PowerShell as Administrator): $($_.Exception.Message)"
  }
}

Ensure-LanFirewallRule -TargetPort $Port

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
