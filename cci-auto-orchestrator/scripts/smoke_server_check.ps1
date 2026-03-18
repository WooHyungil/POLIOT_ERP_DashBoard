param(
  [string]$HostAddr = "127.0.0.1",
  [int]$Port = 8000,
  [int]$StartupTimeoutSec = 30,
  [string]$PublicBaseUrl = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$serverDir = Join-Path $repoRoot "server"

function Resolve-PythonExe {
  param([string]$Root)

  $candidates = @(
    (Join-Path $Root ".venv\Scripts\python.exe"),
    (Join-Path (Split-Path -Parent $Root) ".venv\Scripts\python.exe")
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

  throw "Python executable not found."
}

$pythonExe = Resolve-PythonExe -Root $repoRoot
Write-Host "Using Python: $pythonExe"

$uvicornArgs = @(
  "-m", "uvicorn", "app.main:app",
  "--host", $HostAddr,
  "--port", [string]$Port
)

$proc = Start-Process -FilePath $pythonExe -ArgumentList $uvicornArgs -WorkingDirectory $serverDir -PassThru
Write-Host ("Started server PID={0} on {1}:{2}" -f $proc.Id, $HostAddr, $Port)

try {
  $loginUrl = "http://127.0.0.1:$Port/auth/login"
  $healthy = $false

  for ($i = 0; $i -lt $StartupTimeoutSec; $i++) {
    Start-Sleep -Seconds 1
    try {
      $resp = Invoke-WebRequest -Uri $loginUrl -UseBasicParsing -TimeoutSec 3
      if ($resp.StatusCode -eq 200) {
        $healthy = $true
        break
      }
    } catch {
      # Retry until timeout.
    }
  }

  if (-not $healthy) {
    throw "Health check failed: $loginUrl did not return 200 within $StartupTimeoutSec sec."
  }

  Write-Host "Health check passed: $loginUrl => 200"

  if ($PublicBaseUrl) {
    $publicMyPage = "$PublicBaseUrl/mypage"
    try {
      $publicResp = Invoke-WebRequest -Uri $publicMyPage -UseBasicParsing -TimeoutSec 8 -MaximumRedirection 0
      $publicCode = [int]$publicResp.StatusCode
    } catch {
      if ($_.Exception.Response) {
        $publicCode = [int]$_.Exception.Response.StatusCode
      } else {
        throw "Public URL check failed: $($_.Exception.Message)"
      }
    }

    if ($publicCode -notin @(200, 302, 303, 307, 308)) {
      throw "Public URL check failed: $publicMyPage => $publicCode"
    }

    Write-Host "Public URL check passed: $publicMyPage => $publicCode"
  }

  Push-Location $repoRoot
  try {
    $status = git status --short
    if ([string]::IsNullOrWhiteSpace(($status | Out-String))) {
      Write-Host "Git status clean"
    } else {
      Write-Warning "Git status has changes:"
      $status
    }
  } finally {
    Pop-Location
  }

  Write-Host "Smoke check completed successfully."
} finally {
  if ($proc -and -not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped server PID=$($proc.Id)"
  }
}
