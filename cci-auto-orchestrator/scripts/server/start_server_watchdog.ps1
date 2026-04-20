param(
  [string]$HostAddr = "0.0.0.0",
  [int]$Port = 8000,
  [switch]$LanOnly,
  [string]$AllowedLanCidrs = "",
  [int]$CheckIntervalSec = 10,
  [int]$UnhealthyThreshold = 3,
  [int]$RestartDelaySec = 2
)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runtimeDir = Join-Path $root "runtime"
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$logPath = Join-Path $runtimeDir "server_watchdog.log"
$statePath = Join-Path $runtimeDir "server_watchdog.state.json"
$managedStdout = Join-Path $runtimeDir "managed_server.stdout.log"
$managedStderr = Join-Path $runtimeDir "managed_server.stderr.log"
$lockPath = Join-Path $runtimeDir "server_watchdog.lock"

function Write-WatchdogLog {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -Path $logPath -Value $line -Encoding UTF8
  Write-Host $line
}

function Test-ServerHealthy {
  param([int]$TargetPort)
  $url = "http://127.0.0.1:$TargetPort/auth/login"
  try {
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 4 -MaximumRedirection 0
    return ($resp.StatusCode -in @(200, 302, 303, 307, 308, 401))
  } catch {
    if ($_.Exception.Response) {
      $code = [int]$_.Exception.Response.StatusCode
      return ($code -in @(200, 302, 303, 307, 308, 401))
    }
    return $false
  }
}

function Resolve-PythonExe {
  $candidates = @(
    (Join-Path $root ".venv\Scripts\python.exe"),
    (Join-Path (Split-Path -Parent $root) ".venv\Scripts\python.exe")
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }
  $py = Get-Command python -ErrorAction SilentlyContinue
  if ($py -and $py.Source) {
    return $py.Source
  }
  throw "Python executable not found for watchdog managed server"
}

function Ensure-LanFirewallRule {
  param([int]$TargetPort)

  $ruleName = "CCI AutoTest $TargetPort"
  try {
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if (-not $existing) {
      New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $TargetPort -Profile Private -RemoteAddress LocalSubnet -ErrorAction Stop | Out-Null
      Write-WatchdogLog "Created firewall rule: $ruleName"
    } else {
      Set-NetFirewallRule -DisplayName $ruleName -Enabled True -Profile Private -ErrorAction Stop | Out-Null
      Write-WatchdogLog "Verified firewall rule: $ruleName"
    }
  } catch {
    Write-WatchdogLog "WARN firewall setup skipped: $($_.Exception.Message)"
  }
}

function Run-CriticalBackup {
  $backupScript = Join-Path $root "scripts\server\backup_critical_data.ps1"
  if (-not (Test-Path $backupScript)) {
    return
  }
  try {
    & $backupScript | Out-Host
    Write-WatchdogLog "critical backup executed"
  } catch {
    Write-WatchdogLog "WARN backup skipped: $($_.Exception.Message)"
  }
}

function Start-ManagedServer {
  param([string]$TargetHost,[int]$TargetPort,[bool]$LanMode,[string]$LanCidrs)

  $pythonExe = Resolve-PythonExe
  $env:CCI_LAN_ONLY = $(if ($LanMode) { "1" } else { "0" })
  if ($LanCidrs) {
    $env:CCI_ALLOWED_LAN_CIDRS = $LanCidrs
  }

  $args = @("-m", "uvicorn", "server.app.main:app", "--host", $TargetHost, "--port", [string]$TargetPort)
  $proc = Start-Process -FilePath $pythonExe -ArgumentList $args -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput $managedStdout -RedirectStandardError $managedStderr
  return $proc
}

function Save-State {
  param([hashtable]$State)
  try {
    $json = ($State | ConvertTo-Json -Depth 6)
    Set-Content -Path $statePath -Value $json -Encoding UTF8
  } catch {
    Write-WatchdogLog "WARN failed to save state: $($_.Exception.Message)"
  }
}

function Enter-WatchdogLock {
  param([string]$Path)

  if (Test-Path $Path) {
    try {
      $raw = (Get-Content -Path $Path -Raw -ErrorAction Stop).Trim()
      $existingPid = 0
      [void][int]::TryParse($raw, [ref]$existingPid)
      if ($existingPid -gt 0) {
        $existing = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
        if ($existing) {
          Write-WatchdogLog "another watchdog already running pid=$existingPid; exit"
          exit 0
        }
      }
    } catch {
      # stale or unreadable lock; overwrite below
    }
  }

  Set-Content -Path $Path -Value "$PID" -Encoding UTF8
}

function Exit-WatchdogLock {
  param([string]$Path)

  try {
    if (Test-Path $Path) {
      $raw = (Get-Content -Path $Path -Raw -ErrorAction SilentlyContinue).Trim()
      if ($raw -eq "$PID") {
        Remove-Item -Path $Path -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {}
}

trap {
  Exit-WatchdogLock -Path $lockPath
  continue
}

Write-WatchdogLog "watchdog start host=$HostAddr port=$Port lan_only=$($LanOnly.IsPresent)"
Enter-WatchdogLock -Path $lockPath
Ensure-LanFirewallRule -TargetPort $Port
Run-CriticalBackup
$restartCount = 0

while ($true) {
  $serverProc = Start-ManagedServer -TargetHost $HostAddr -TargetPort $Port -LanMode:$LanOnly.IsPresent -LanCidrs $AllowedLanCidrs
  $restartCount += 1
  Write-WatchdogLog "server started pid=$($serverProc.Id) restart_count=$restartCount"

  $failCount = 0
  while (-not $serverProc.HasExited) {
    Start-Sleep -Seconds $CheckIntervalSec

    $healthy = Test-ServerHealthy -TargetPort $Port
    if ($healthy) {
      $failCount = 0
      Save-State @{
        pid = $serverProc.Id
        healthy = $true
        fail_count = 0
        checked_at = (Get-Date).ToString("s")
        restarts = $restartCount
        port = $Port
      }
      continue
    }

    $failCount += 1
    Save-State @{
      pid = $serverProc.Id
      healthy = $false
      fail_count = $failCount
      checked_at = (Get-Date).ToString("s")
      restarts = $restartCount
      port = $Port
    }

    Write-WatchdogLog "health check failed pid=$($serverProc.Id) fail_count=$failCount"
    if ($failCount -ge $UnhealthyThreshold) {
      Write-WatchdogLog "forcing restart pid=$($serverProc.Id)"
      try {
        Stop-Process -Id $serverProc.Id -Force -ErrorAction Stop
      } catch {
        Write-WatchdogLog "WARN failed to stop pid=$($serverProc.Id): $($_.Exception.Message)"
      }
      break
    }
  }

  if ($serverProc.HasExited) {
    Write-WatchdogLog "server exited code=$($serverProc.ExitCode)"
  }

  Start-Sleep -Seconds $RestartDelaySec
}
