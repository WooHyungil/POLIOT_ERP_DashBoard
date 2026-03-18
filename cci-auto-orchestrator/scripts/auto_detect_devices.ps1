param(
  [string]$OutputPath = ".\config\devices.json",
  [int]$StartPort = 4723
)

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function ConvertTo-JsonArrayText {
  param([Parameter(Mandatory = $true)] [array]$Items)

  if ($Items.Count -eq 0) {
    return "[]"
  }
  if ($Items.Count -eq 1) {
    return "[`n$($Items[0] | ConvertTo-Json -Depth 6)`n]"
  }
  return ($Items | ConvertTo-Json -Depth 6)
}

$existing = @()
if (Test-Path $OutputPath) {
  try {
    $existingRaw = Get-Content $OutputPath -Raw | ConvertFrom-Json
    $existing = @($existingRaw)
  } catch {
    $existing = @()
  }
}

if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
  Write-Warning "adb not found. Skipping auto-detection."
  exit 0
}

$lines = adb devices -l
if (-not $lines) {
  Write-Warning "No adb output."
  exit 0
}

$devices = @()
$port = $StartPort
$index = 1

foreach ($line in $lines) {
  $t = "$line".Trim()
  if (-not $t -or $t.StartsWith("List of devices attached")) {
    continue
  }

  $parts = $t -split "\s+"
  if ($parts.Length -lt 2) {
    continue
  }

  $serial = $parts[0]
  $state = $parts[1]
  if ($state -ne "device") {
    continue
  }

  $model = "Android_$index"
  if ($t -match "model:([^\s]+)") {
    $model = $matches[1]
  }

  $devices += [pscustomobject]@{
    enabled = $true
    deviceId = "a$($index.ToString('00'))"
    name = $model
    platform = "android"
    udid = $serial
    appiumPort = $port
  }

  $port += 2
  $index += 1
}

if ($devices.Count -eq 0) {
  Write-Warning "No connected Android devices found. Keeping existing config entries."
}

# Keep non-Android entries (e.g., iOS devices configured manually).
$others = @($existing | Where-Object { $_.platform -ne "android" })
$merged = @($devices + $others)

if ($merged.Count -eq 0) {
  Write-Warning "No devices to write in config."
  exit 0
}

$dir = Split-Path -Parent $OutputPath
if (-not (Test-Path $dir)) {
  New-Item -ItemType Directory -Path $dir | Out-Null
}

$json = ConvertTo-JsonArrayText -Items $merged
$json | Set-Content -Path $OutputPath -Encoding UTF8
Write-Host "Auto-detected $($devices.Count) Android device(s) and updated merged config: $OutputPath"
